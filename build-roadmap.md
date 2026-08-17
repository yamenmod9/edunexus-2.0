# EduNexus — Build Roadmap

Phase-gated task breakdown. Authoritative execution order; `CLAUDE.md` remains authoritative on architecture and constraints.

**How this runs:** each phase is planned → implemented → audited (`CLAUDE.md` §9.1), built end to end without stopping mid-phase (§9.2), and closed with a live run, not just green tests (§9.4). At the end of a phase: stop, report, wait for review. Do not auto-start the next phase.

**Gate rule:** a phase starts only when the previous phase's exit criteria are all met.

---

## Phase 1 — Backend + question bank tooling  ✅ COMPLETE (2026-08-16)

Live at **https://edunexus-api-production.up.railway.app**

Flask app, question model, import tooling, CRUD/query API.

| # | Task | Status |
|---|---|---|
| 1.1 | App factory, config, extensions | ✅ |
| 1.2 | `Question` model + taxonomy constants + check constraints | ✅ |
| 1.3 | Marshmallow schemas, incl. cross-field rules (domain↔section, choices↔type, grid-in is math-only) | ✅ |
| 1.4 | Question service layer (CRUD + filtered query + pagination) | ✅ |
| 1.5 | REST routes: list/filter, get, create, patch, delete, health | ✅ |
| 1.6 | Import service (CSV + JSON, per-row validation, partial success) | ✅ |
| 1.7 | Import CLI with `--dry-run` | ✅ |
| 1.8 | Test suite (21 passing) | ✅ |
| 1.9 | Alembic migrations, written against Postgres | ✅ |
| 1.10 | `backend/README.md` — setup, run, test, import commands | ✅ |
| 1.11 | `/health` (liveness) + `/health/db` (readiness) | ✅ |
| 1.12 | Deployed to Railway, verified against the live domain | ✅ |

**Exit criteria — all met:** migration applied to Supabase Postgres and verified
drift-free (`db migrate` reports "No changes in schema detected"); 21/21 tests
green; every route driven live via `curl`; README written.

**Open decision (not mine):** College Board Question Bank licensing (`CLAUDE.md` §6). The importer supports `source=official_qb`/`external_id`, but no bulk official import happens until terms are confirmed.

---

## Phase 2 — Auth + user accounts  ✅ COMPLETE (2026-08-16)

JWT bearer tokens (not cookie sessions) so web and Flutter clients use one identical API.

| # | Task |
|---|---|
| 2.1 | `User` model — email, password hash (argon2/bcrypt), role (`student`/`admin`), timestamps |
| 2.2 | Registration + login endpoints, password strength validation |
| 2.3 | JWT issue/verify: short-lived access + refresh token, rotation on refresh |
| 2.4 | `@require_auth` / `@require_admin` decorators |
| 2.5 | Lock question **write** endpoints (POST/PATCH/DELETE) + import CLI to admin |
| 2.6 | `GET /api/me`; password change; logout (refresh revocation list) |
| 2.7 | Rate limiting on auth routes |
| 2.8 | Tests: auth flows, token expiry/rotation, role enforcement on every protected route |

**Decision taken:** question reads are **login-required**, not public — access to the bank is gated behind signing up.

**Exit criteria — all met:** anonymous callers get 401 on every question route (auth is checked before existence, so ids cannot be probed); students read but get 403 on writes; admins have full access; refresh rotation, replay rejection, logout revocation and password-change session revocation all verified against the live deployment. 69/69 tests pass; migration 0002 applied to Supabase and verified drift-free.

**Deferred:** the auth rate limiter is in-process, so its effective limit scales with gunicorn worker count. Move to Redis before scaling beyond a couple of workers.

---

## Phase 3 — Adaptive test engine  ✅ COMPLETE (2026-08-16)

The MST state machine. Server-side only (`CLAUDE.md` §7) — never in a client.

| # | Task | Status |
|---|---|---|
| 3.1 | Models: `TestForm`, `Module`, `FormQuestion`, `TestAttempt`, `ModuleAttempt`, `AnswerResponse` | ✅ |
| 3.2 | Form assembly: build a form from the bank by section/domain/difficulty blueprint | ✅ |
| 3.3 | Attempt lifecycle: start → module 1 → route → module 2 → next section → submit | ✅ |
| 3.4 | **Routing service** — module 1 performance → easy/hard module 2 variant, threshold configurable and recorded per attempt | ✅ |
| 3.5 | Server-tracked timers: per-module deadline stored server-side; late submissions rejected/flagged | ✅ |
| 3.6 | Answer submission, per-question review flags, navigation within a module | ✅ |
| 3.7 | Resume-in-progress attempt (network drop / app close) | ✅ |
| 3.8 | Correct answers + rationales withheld until the attempt is submitted | ✅ |
| 3.9 | Tests: routing at/above/below threshold, timer expiry, resume, no answer-key leakage | ✅ |
| 3.10 | `scripts/build_form.py` — form assembly CLI with `--dry-run` | ✅ |
| 3.11 | Migration `0003`, applied to Supabase and verified drift-free | ✅ |

**Exit criteria — all met:** a full 4-module attempt driven end to end over
HTTP, routing up in one section and down in the other in the same run; the
routing decision is made only in `app/services/routing_service.py` and its
inputs are stored per module attempt; no payload before submission contains
`correct_answer`, `rationale`, `difficulty` or `is_correct`. 170/170 tests
pass.

**Scope added beyond the original task list:** 3.8 was not enforceable on its
own. An attempt hands the student real question ids, and `GET
/api/questions/<id>` returned the answer outright — so the bank routes now
omit `correct_answer`/`rationale` for non-admins, and practice-mode grading
moved to `POST /api/questions/<id>/check`, which refuses questions inside the
caller's live attempt.

**Decisions taken:**
- One open attempt per user at a time. Otherwise a student could scout a
  form's module 1, abandon, and restart already knowing the questions.
- An expired module chains the next module's clock from its **deadline**, not
  from reconnect, so closing the app cannot buy extra time.
- Routing at exactly the threshold routes **up** (inclusive boundary).
- Attempts are owner-scoped with 404, and admins get no back door — support
  access, if it is ever wanted, should be a deliberate audited feature.

**Deferred to Phase 4:** review returns raw correct counts per module and
section. No scaled score yet.

---

## Phase 4 — Scoring  ✅ COMPLETE (2026-08-16)

| # | Task | Status |
|---|---|---|
| 4.1 | Raw score per section from responses | ✅ |
| 4.2 | Raw → scaled conversion tables (200–800/section), module-2-variant aware, as data not hardcoded logic | ✅ |
| 4.3 | Score report: total, per-section, per-domain breakdown | ✅ |
| 4.4 | Tests incl. boundary raw scores (0, max, off-by-one at table edges) | ✅ |
| 4.5 | `scripts/generate_scale_table.py` — regenerates the table as data | ✅ |
| 4.6 | Migration `0004` — snapshot `scale_table_id` per attempt | ✅ |

**Constraint (`CLAUDE.md` §7):** this is an **approximation**, not IRT equating — real equating needs College Board calibration data we don't have. Honoured in three places: a header warning in `scoring_service.py`, `"approximation": true` plus a note on every score payload, and `"approximation": true` inside the table file itself.

**Exit criteria — all met:** raw 0 scores 200 and raw max scores 800 (hard) / 600 (easy) in both sections; curves verified dense, non-decreasing, in-scale and multiples of 10; off-by-one at both table edges pinned; driven live through to a score report. 214/214 tests pass.

**Decisions taken:**
- **The easier module 2 caps the section** (600 vs 800). Live-verified: the same 8/16 raw scores 570 on the hard path and 430 on the easy one, 140 points apart. Without this, adaptive routing would have no effect on the score and Phase 3 would be decorative.
- **Short forms are projected onto the canonical length** (54 R&W / 44 Math) before lookup, so practice forms score. Flagged as an approximation on top of an approximation.
- **Incomplete sections score `null`, not a number.** A section whose module 2 was never reached has no routed path to scale against, and the total is null unless both sections are complete.
- **`scale_table_id` is snapshotted per attempt**, like `routing_threshold` in Phase 3, so re-scaling cannot rewrite a score already shown.

**Bug found while auditing:** delivering a module issued one SELECT per question (27 on a full-length module) and scoring issued one per delivered question (98 on a full attempt). Both relationships are now `lazy="selectin"`; `tests/test_query_efficiency.py` guards the regression.

---

## Phase 5 — React web frontend  ✅ COMPLETE (2026-08-17)

First frontend. `web/`, React + Vite + Tailwind.

| # | Task | Status |
|---|---|---|
| 5.1 | Scaffold, routing, API client with token refresh interception | ✅ |
| 5.2 | Auth screens (register/login/logout) | ✅ |
| 5.3 | Practice mode: filter bank, solve, rationale after answer, KaTeX math | ✅ |
| 5.4 | Test player: module UI, timer display (server clock is source of truth), navigation, review screen, submit | ✅ |
| 5.5 | Score report screen | ✅ |
| 5.6 | Admin: question authoring/edit + CSV import UI | ✅ |
| 5.7 | Responsive + keyboard accessible | ✅ |
| 5.8 | Backend CORS allowlist for the deployed web origin | ✅ |
| 5.9 | Backend `GET /api/taxonomy` so the client never hard-codes the taxonomy | ✅ |
| 5.10 | Backend `POST /api/questions/import` for the admin CSV upload | ✅ |

**Exit criteria — all met:** the full journey (register → practice → full 4-module adaptive test → score report) runs in real Chromium via `web/e2e/journey.spec.js`. 7/7 journey, 10/10 accessibility, 16/16 API-client unit tests, 238/238 backend tests. Live at **https://edunexus-2wb.pages.dev**, smoke-tested in a real browser against the deployed Railway API with no console errors.

**Deployment note:** deployed with `wrangler pages deploy` (direct upload), not the GitHub integration described in `CLAUDE.md` §8 — so a push to `main` does **not** redeploy the frontend. Connect the repo in the Cloudflare dashboard for push-to-deploy.

**Scope added beyond the original task list:** the frontend needed three things the backend did not have — CORS (none existed), a taxonomy endpoint (otherwise the client duplicates the `CLAUDE.md` §5 taxonomy and drifts), and a bulk-import endpoint (import was CLI-only, so 5.6's "CSV import UI" had nothing to call).

**Decisions taken:**
- **Refresh is single-flight.** The backend rotates refresh tokens, so two concurrent 401s each firing their own refresh would make the second present a revoked token and log the student out mid-test. Verified by removing the guard: the test fails with 3 refreshes instead of 1.
- **The countdown never ends a module.** It re-syncs to the server's `seconds_remaining` on every response and, at zero, asks the server what happens. A client that expired its own module would hand anyone with devtools extra time.
- **Tokens live in `localStorage`.** Bearer tokens are a `CLAUDE.md` requirement so one API serves web and Flutter alike; the XSS tradeoff is why access tokens are 15 minutes and refresh tokens are revocable.
- **The score is never rendered without its approximation caveat**, per §7.

**Note:** the client renders and reports; it never decides routing or computes scores.

---

## Phase 6 — Flutter apps (Android / iOS / Windows)  ⚠️ COMPLETE except iOS

| # | Task | Status |
|---|---|---|
| 6.1 | Scaffold `mobile/`, shared API client, secure token storage | ✅ |
| 6.2 | Auth + practice mode | ✅ |
| 6.3 | Test player with `flutter_math_fork` rendering | ✅ |
| 6.4 | Offline tolerance: resume an attempt after connection loss | ✅ |
| 6.5 | Per-platform build verification | ⚠️ Android + Windows verified; iOS cannot be |
| 6.6 | `integration_test/` driving the real binary end to end | ✅ |

**Decisions taken:**
- **Tokens live in the platform keystore**, not `localStorage` as on the web — Keychain / Android Keystore / DPAPI. The web client uses `localStorage` because a browser offers nothing better; a native client does.
- Storage sits behind a three-method `SecureKeyValueStore` interface rather than using `FlutterSecureStorage` directly. That package changed its option types between majors (v11 merged the iOS and macOS options into `AppleOptions`), and a test fake mirroring its full signature breaks on every upgrade for nothing.
- **Refresh is single-flight**, same rotation hazard as the web client, and *more* likely to bite on mobile: returning from a tunnel or a locked screen fires several stale-token requests at once. Verified by removing the guard — the test then reports 3 refreshes instead of 1.
- **The countdown never ends a module**; at zero it asks the server.
- **Offline answers are persisted, not just buffered in memory.** On a phone, losing the connection and having the OS reclaim the app happen together often enough that an in-memory queue would lose real answers. Replay is safe because `PUT /responses/<id>` is idempotent, and only the newest answer per question is kept.
- **A rejection with a status is never retried and never silently dropped.** If the module moved on while the student was offline, those answers are reported to them rather than leaving them believing an answer counted.

**Exit criteria — met on the two platforms this machine can build:** the real
Windows binary was driven through register → practice → server-side grading →
all four adaptive modules → score report against a live API
(`flutter test integration_test/app_test.dart -d windows`). Android builds
(`app-debug.apk`). 35/35 Dart tests, `flutter analyze` clean.

**Three bugs that only driving the app could find**, none of which any unit
test, the analyzer, or a successful build would have caught:
1. **Answer choices were unselectable.** `MathText` rendered
   `SelectableText.rich`, whose tap recogniser swallows taps before the
   enclosing `InkWell` sees them — so tapping the answer text, which is where
   people tap, did nothing. `MathText` is now non-selectable by default and
   opts in only outside tap targets.
2. **Ink splashes and the selection highlight never painted.** The background
   colour was on a `Container` wrapping the `ListTile`; `ListTile` paints on
   the nearest `Material` ancestor. Now on a `Material`, with the border moved
   to the tile's `shape`.
3. **`flutter_secure_storage` 11.x broke both buildable platforms** (ATL on
   Windows, `compileSdk 37` on Android). Pinned to 9.2.4, with
   `encryptedSharedPreferences` opted into explicitly since 9.x defaults it off.

**iOS is not verified and cannot be from this machine.** It needs macOS and Xcode. The target is configured and the code is platform-neutral — no `dart:io` platform branches, no Windows-only plugins — but nothing has compiled or run it. Treat iOS as unproven until someone runs `flutter build ios` on a Mac.

---

## Phase 7 — Analytics / progress dashboards

| # | Task |
|---|---|
| 7.1 | Aggregates: accuracy by domain/skill/difficulty over time |
| 7.2 | Score history across attempts |
| 7.3 | Weakness identification driven by the §5 taxonomy |
| 7.4 | Dashboards in web, then Flutter |
| 7.5 | Query performance pass; Redis caching if measurements justify it |

---

## Deployment checkpoints

Per `CLAUDE.md` §8 — not separate phases:

- **After Phase 1:** backend → Railway (root dir `backend/`), env vars set in Railway, health check green, domain assigned.
- **After Phase 5:** web → Cloudflare Pages (root dir `web/`, `npm run build` → `dist`), `VITE_API_URL` set, backend CORS updated.
- `mobile/` is never web-deployed — it ships to app stores.
