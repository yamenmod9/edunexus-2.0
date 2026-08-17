# EduNexus Mobile

Flutter client for the EduNexus Digital SAT platform — one codebase for
Android, iOS and Windows. See `../CLAUDE.md` for architecture,
`../build-roadmap.md` for the phase plan, and `../backend/README.md` for the
API this talks to.

`mobile/` is never web-deployed. It compiles per platform and ships to app
stores.

## Setup

```bash
flutter pub get
```

## Run

Against the deployed API (the default, so no flags needed):

```bash
flutter run -d windows
flutter run -d <android-device-id>
```

Against a local backend:

```bash
# Android emulator: 10.0.2.2 is the host machine; 127.0.0.1 is the emulator
flutter run --dart-define=EDUNEXUS_API_URL=http://10.0.2.2:5055

# Windows desktop
flutter run -d windows --dart-define=EDUNEXUS_API_URL=http://127.0.0.1:5055
```

## Tests

```bash
flutter test
flutter analyze
```

## What runs where

The client renders and reports. It decides nothing the exam depends on:

| Decision | Where it happens |
|---|---|
| Which module 2 a student gets | Server (`routing_service.py`) |
| Whether an answer was correct | Server, on submission |
| When a module runs out of time | Server; the on-screen clock is display only |
| Scaled scores | Server (`scoring_service.py`) |

The countdown in the test player re-syncs to the server's `seconds_remaining`
on every response, and at zero it **asks** the server what happens rather than
ending the module itself. A client that expired its own module would let anyone
with a debugger award themselves extra time.

## Tokens

`lib/api/token_store.dart`, backed by the platform keystore — Keychain on iOS,
the Android Keystore on Android, DPAPI on Windows. The web client uses
`localStorage` because a browser offers nothing better; a native client does,
so this uses it.

Storage goes through a three-method `SecureKeyValueStore` interface rather than
`FlutterSecureStorage` directly. That package's option types change between
majors (v11 merged the iOS and macOS options into `AppleOptions`), and tests
that mirror its full signature break on every upgrade for no benefit.

**Refresh is single-flight, and that is a correctness requirement.** The
backend rotates refresh tokens — using one revokes it. If two requests 401 at
once and each starts its own refresh, the second presents a token the first
already revoked and the student is signed out mid-test. On a phone this is
*more* likely than on the web: returning from a tunnel or a locked screen tends
to fire several stale-token requests together. `test/api_client_test.dart`
covers it; removing the guard makes it fail with three refreshes instead of one.

## Offline tolerance

Roadmap task 6.4. `lib/api/answer_queue.dart` holds answers that could not be
delivered and replays them when the network returns.

- Replay is safe because `PUT /responses/<id>` is idempotent — it sets the
  answer rather than appending one.
- Only the newest answer per question is kept; a student who changed their mind
  offline means the earlier answer was never true.
- The queue is persisted, not just held in memory. On a phone, "lost the
  connection" and "the OS reclaimed the app" happen together often enough that
  an in-memory queue would lose real answers.
- A rejection **with** a status (404, 409) is not retried. The server has
  decided something — the module moved on, the time ran out — and retrying
  cannot change its mind. Those answers are reported to the student rather than
  silently dropped, so nobody believes an answer counted when it did not.
- A corrupt stored queue is discarded on load rather than crashing at launch.

## Math

`lib/widgets/math_text.dart` renders `$…$` inline and `$$…$$` as a display
block via `flutter_math_fork`, the same authoring convention as the web client.
A lone `$` stays literal — "costs $5" appears in these questions far more often
than an unclosed expression. An expression the parser rejects renders as its
own source rather than throwing, because a broken question should look wrong,
not take the screen down mid-test.

## Build prerequisites

Two environment requirements that are easy to trip over, both discovered the
hard way:

**Android: the project path must not contain parentheses.** Gradle's generated
invocation does not quote the project path, so a directory like
`C:\Programming\Flutter\edunexus(2.0)` truncates at the `(` and the build
fails with `'C:\Programming\Flutter\edunexus' is not recognized as an
internal or external command`. Parentheses are cmd.exe grouping characters;
hyphens and dots are fine.

The only real fix is to check the repo out somewhere without them, e.g.
`C:\Programming\Flutter\edunexus-2.0`. A directory junction pointing at the
parenthesised path does **not** work — tested, and Gradle resolves the junction
back to the real path and fails identically. Building from a copy works but is
not a way to live.

**`flutter_secure_storage` is pinned to 9.2.4, deliberately.** The 11.x line
does not build here on either mobile platform we can verify:

- its Windows plugin includes `<atlstr.h>`, so a Windows build needs Visual
  Studio's optional C++ ATL component (`error C1083: Cannot open include file:
  'atlstr.h'`). 9.2.4's Windows plugin uses `bcrypt.h`/`wincred.h` and needs no
  ATL.
- it requires `compileSdk 37`, above both Flutter 3.44's default of 36 and the
  maximum Android Gradle Plugin 9.0.1 recommends. 9.2.4 asks for 34.

Neither is fixable in application code — Flutter compiles every plugin declared
for a target platform, so the Windows plugin builds whether or not the app calls
it there. Pinning the dependency is the fix. Revisit when AGP catches up to
compileSdk 37 and the ATL include is dropped upstream.

One consequence: 9.x defaults `encryptedSharedPreferences` to `false`, so
`token_store.dart` opts in explicitly. Without that the tokens would not be in
Jetpack's encrypted store.

## Platform status

| Platform | Build verified |
|---|---|
| Android | ✅ `flutter build apk --debug`, from a parenthesis-free path |
| Windows | ✅ `flutter build windows --release` |
| iOS | ❌ **not verifiable here** |

iOS cannot be built or verified on Windows — it needs macOS and Xcode. The iOS
target is configured and the code is platform-neutral (no `dart:io` platform
branches, no Windows-only plugins), but nobody has compiled or run it. Treat
iOS as unproven until someone builds it on a Mac:

```bash
flutter build ios --release    # requires macOS + Xcode
```
