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

## Phase 4 — Scoring

| # | Task |
|---|---|
| 4.1 | Raw score per section from responses |
| 4.2 | Raw → scaled conversion tables (200–800/section), module-2-variant aware, as data not hardcoded logic |
| 4.3 | Score report: total, per-section, per-domain breakdown |
| 4.4 | Tests incl. boundary raw scores (0, max, off-by-one at table edges) |

**Constraint (`CLAUDE.md` §7):** this is an **approximation**, not IRT equating — real equating needs College Board calibration data we don't have. Must be commented as such in code and surfaced in any UI that displays a score.

---

## Phase 5 — React web frontend

First frontend. `web/`, React + Vite + Tailwind.

| # | Task |
|---|---|
| 5.1 | Scaffold, routing, API client with token refresh interception |
| 5.2 | Auth screens (register/login/logout) |
| 5.3 | Practice mode: filter bank, solve, rationale after answer, KaTeX math |
| 5.4 | Test player: module UI, timer display (server clock is source of truth), navigation, review screen, submit |
| 5.5 | Score report screen |
| 5.6 | Admin: question authoring/edit + CSV import UI |
| 5.7 | Responsive + keyboard accessible |
| 5.8 | Backend CORS allowlist for the deployed web origin |

**Exit criteria:** full student journey (register → practice → full adaptive test → score report) driven in a real browser.

**Note:** the client renders and reports; it never decides routing or computes scores.

---

## Phase 6 — Flutter apps (Android / iOS / Windows)

| # | Task |
|---|---|
| 6.1 | Scaffold `mobile/`, shared API client, secure token storage |
| 6.2 | Auth + practice mode |
| 6.3 | Test player with `flutter_math_fork` rendering |
| 6.4 | Offline tolerance: resume an attempt after connection loss |
| 6.5 | Per-platform build verification |

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
