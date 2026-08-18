import 'dart:async';
import 'dart:ffi';
import 'dart:io' show Platform;

import 'package:edunexus_mobile/main.dart' as app;
import 'package:ffi/ffi.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:win32/win32.dart';

/// Drives the real app against the real API — the "done means run, not
/// compiled" bar from CLAUDE.md section 9.4.
///
/// Run it on whichever platform you want to prove:
///
///   flutter test integration_test/app_test.dart -d windows
///   flutter test integration_test/app_test.dart -d `<android-device>`
///
/// It hits whatever `EDUNEXUS_API_URL` points at (the deployed API by
/// default), so it creates a real account each run. Point it at a local
/// backend to keep production clean:
///
///   flutter test integration_test/app_test.dart -d windows \
///     --dart-define=EDUNEXUS_API_URL=http://127.0.0.1:5055
///
/// **The app window must be on screen for the whole run.** On Windows a window
/// that is minimised or fully covered stops being presented, the engine stops
/// producing frames, and every `pump` in the live binding waits forever on a
/// frame that never arrives. Diagnosed by watching the app process: it held
/// 0.6s of CPU for 35 minutes, then climbed the instant the window came
/// forward.
///
/// Two things here deal with that. [_keepAppWindowRaised] holds the app's own
/// window above the others for the whole run — raising it once at startup is
/// not enough, because anything that takes the foreground later buries it
/// again mid-test. It works from a plain [Timer] on purpose: Dart timers fire
/// whether or not frames are being produced, so this recovers a run that has
/// already stalled rather than only preventing one.
///
/// [_pumpSafely] is the backstop. It bounds every pump, so a window that stays
/// buried anyway fails the run in seconds with a message naming the cause,
/// instead of hanging silently forever. Bounding the *settles* alone does not
/// help: with no frame to pump, the deadline check between pumps is never
/// reached.

const _stallTimeout = Duration(seconds: 20);

const _stallMessage =
    'The app stopped producing frames, so pump() would never return.\n'
    'On Windows this means the "edunexus_mobile" window is minimised or fully '
    'covered — a fullscreen video, game or screen share is enough. Bring it to '
    'the front and re-run.';

/// Raises the app's own window so the compositor keeps presenting it.
///
/// Best-effort by design: every failure path here leaves the run to continue,
/// because [_pumpSafely] reports a starved engine far better than a throwing
/// helper would. Windows-only; a no-op everywhere else.
///
/// `steal` is true only for the first call. Taking the keyboard focus once at
/// startup is worth it; doing it every two seconds for the length of the run
/// would make the machine unusable, and being *visible* is all the compositor
/// needs.
void _raiseAppWindow({bool steal = false}) {
  if (!Platform.isWindows) return;
  final title = 'edunexus_mobile'.toNativeUtf16();
  try {
    final hwnd = FindWindow(nullptr, title);
    if (hwnd == 0) return;
    ShowWindow(hwnd, steal ? SW_RESTORE : SW_SHOWNOACTIVATE);
    // HWND_TOPMOST, position and size untouched.
    SetWindowPos(hwnd, -1, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    if (steal) SetForegroundWindow(hwnd);
  } on ArgumentError {
    // No user32 on this platform build; nothing to raise.
  } finally {
    calloc.free(title);
  }
}

/// Keeps the window up for the whole run. Returns the timer to cancel.
Timer _keepAppWindowRaised() {
  _raiseAppWindow(steal: true);
  return Timer.periodic(
    const Duration(seconds: 2),
    (_) => _raiseAppWindow(),
  );
}

/// `tester.pump`, but a stalled engine fails the run instead of hanging it.
///
/// `.timeout` cannot cancel the pump it races — the point is only to turn an
/// unbounded wait into a diagnosis, and the run ends at the `fail` below.
Future<void> _pumpSafely(WidgetTester tester, Duration duration) async {
  try {
    await tester.pump(duration).timeout(_stallTimeout);
  } on TimeoutException {
    fail(_stallMessage);
  }
}

/// A settle that cannot hang.
///
/// `pumpAndSettle` waits for the frame queue to drain, and this app holds an
/// indeterminate progress indicator on screen whenever it is waiting on the
/// server — which schedules frames forever. So this caps the wait rather than
/// treating "still animating" as a failure: [pumpUntil] does the real waiting,
/// on the thing actually being waited for.
Future<void> _settle(
  WidgetTester tester, {
  Duration limit = const Duration(seconds: 5),
}) async {
  final deadline = DateTime.now().add(limit);
  do {
    await _pumpSafely(tester, const Duration(milliseconds: 50));
  } while (tester.binding.hasScheduledFrame && DateTime.now().isBefore(deadline));
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final email = 'mobile-drive-${DateTime.now().millisecondsSinceEpoch}@example.com';
  const password = 'mobile drive 1';

  /// The app talks to a live server, so waiting a fixed number of frames is
  /// not enough — pump until the thing we are waiting for actually appears.
  Future<void> pumpUntil(
    WidgetTester tester,
    Finder finder, {
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      await _pumpSafely(tester, const Duration(milliseconds: 250));
      if (finder.evaluate().isNotEmpty) return;
    }
    // Dump what IS on screen — a bare "timed out" says nothing about why.
    final visible = find
        .byType(Text)
        .evaluate()
        .map((e) => (e.widget as Text).data)
        .whereType<String>()
        .where((t) => t.trim().isNotEmpty)
        .take(40)
        .toList();
    final buttons = find.byType(FilledButton).evaluate().map((e) {
      final b = e.widget as FilledButton;
      final label = b.child is Text ? (b.child! as Text).data : '?';
      return '$label(${b.onPressed == null ? 'disabled' : 'enabled'})';
    }).toList();
    fail(
      'timed out waiting for: ${finder.describeMatch(Plurality.many)}; '
      'visible text: $visible; '
      'buttons: $buttons',
    );
  }

  testWidgets('register, practise, then run a full adaptive test',
      (tester) async {
    app.main();
    // Before anything else: an unraised window means no frames, and no frames
    // means every pump below waits forever.
    await tester.pump(const Duration(milliseconds: 500));
    final raised = _keepAppWindowRaised();
    addTearDown(raised.cancel);
    await _settle(tester);

    // Tokens live in the platform keystore and survive both app restarts and
    // test runs, so a previous run leaves this signed in. Start from a known
    // state rather than assuming a fresh install.
    await tester.pump(const Duration(seconds: 2));
    final signOut = find.byTooltip('Sign out');
    if (signOut.evaluate().isNotEmpty) {
      await tester.tap(signOut);
      await _settle(tester);
    }

    // --- register -----------------------------------------------------
    await pumpUntil(tester, find.text('Sign in'));
    await tester.tap(find.text('No account yet? Create one'));
    await _settle(tester);

    await tester.enterText(find.byType(TextFormField).first, email);
    await tester.enterText(find.byType(TextFormField).last, password);
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));

    await pumpUntil(tester, find.text('PRACTICE TESTS'));
    expect(find.textContaining(email), findsWidgets);

    // --- practice mode ------------------------------------------------
    await tester.tap(find.text('Practice questions').first);
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Check'));

    // The bank must not hand a student the key before they answer: the only
    // way to learn it is the check endpoint.
    await tester.tap(find.byType(RadioListTile<String>).first);
    await _settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Check'));
    // The verdict is an Eyebrow, which uppercases, and it now sits directly
    // above the rationale rather than in a separate banner.
    await pumpUntil(
      tester,
      find.byWidgetPredicate((w) =>
          w is Text &&
          (w.data == 'CORRECT' ||
              w.data?.contains('THE ANSWER IS') == true)),
    );

    await tester.pageBack();
    await _settle(tester);

    // --- a full adaptive test ----------------------------------------
    await pumpUntil(tester, find.widgetWithText(FilledButton, 'Start test'));
    await tester.tap(find.widgetWithText(FilledButton, 'Start test').first);
    // The Bluebook bottom bar names the position; it is the first thing the
    // player renders that is unique to the player.
    await pumpUntil(tester, find.textContaining('Question 1 of'));

    for (var module = 0; module < 4; module += 1) {
      // Answer whatever is on screen, then walk forward through the module.
      // Navigation is the Next button rather than the seat grid: the seats now
      // live behind the navigator sheet, which is the point of that chrome, so
      // reaching in for them would test a layout the student never sees.
      while (true) {
        final choices = find.byType(RadioListTile<String>);
        if (choices.evaluate().isNotEmpty) {
          await tester.tap(choices.at(1)); // "B" in the seeded demo bank
          await _settle(tester);
        }
        final next = find.widgetWithText(FilledButton, 'Next');
        if (next.evaluate().isEmpty) break; // the last question offers Review
        await tester.tap(next);
        await _settle(tester);
      }

      await tester.tap(find.widgetWithText(FilledButton, 'Review'));
      await _settle(tester);

      final finish = find.widgetWithText(FilledButton, 'Finish test');
      final submit = find.widgetWithText(FilledButton, 'Submit module');
      await tester.tap(finish.evaluate().isNotEmpty ? finish : submit);

      if (module < 3) {
        await pumpUntil(tester, find.textContaining('Question 1 of'));
      }
    }

    // --- the score report --------------------------------------------
    // The app-bar title 'Score report' renders immediately on navigation,
    // before the review payload has loaded (see result_screen.dart) — wait
    // on 'TOTAL' instead, which only appears once _review is populated. This
    // is the last request of the run and hits the live deployed API by
    // default (see the file header), so it gets the longest budget here to
    // absorb a cold start rather than reading a slow response as a hang.
    await pumpUntil(tester, find.text('TOTAL'),
        timeout: const Duration(seconds: 60));

    // A score is never shown without the caveat the API attaches to it.
    expect(
      find.textContaining('These scores are an approximation'),
      findsOneWidget,
    );
    expect(find.text('TOTAL'), findsOneWidget);
    expect(find.text('READING & WRITING'), findsOneWidget);
    expect(find.text('MATH'), findsOneWidget);

    // Routing happened server-side and is reported after the fact. The module
    // cards sit below the fold, and a ListView builds its children lazily, so
    // scroll them into existence rather than asserting on an unbuilt widget.
    await tester.scrollUntilVisible(
      // Not .first — that throws while the target has not been built yet,
      // which is precisely the state this call exists to resolve.
      find.textContaining('Routed to the'),
      300,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 60,
    );
    await _settle(tester);
    expect(find.textContaining('Routed to the'), findsWidgets);

    // --- progress dashboard --------------------------------------------
    // Back to the home screen, then the analytics view built on top of the
    // attempt just finished (Phase 7).
    await tester.tap(find.widgetWithText(OutlinedButton, 'Back to the dashboard'));
    await pumpUntil(tester, find.byTooltip('Your progress'));
    await tester.tap(find.byTooltip('Your progress'));
    await pumpUntil(tester, find.textContaining('Based on 1 finished attempt'),
        timeout: const Duration(seconds: 30));
    expect(find.text('TOTAL SCORE'), findsNothing); // only 1 attempt so far
    expect(find.text('LATEST TOTAL SCORE'), findsOneWidget);

    // The rest of the dashboard is below the fold in a lazily-built
    // ListView, same as the score report's module cards above.
    await tester.scrollUntilVisible(
      find.text('TEST HISTORY'),
      300,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 60,
    );
    await _settle(tester);
    expect(find.text('BY DOMAIN'), findsOneWidget);
    expect(find.text('TEST HISTORY'), findsOneWidget);
  });
}
