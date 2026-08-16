# CLAUDE.md — EduNexus

This file is the top-level context for Claude Code. Read it before touching any code. It defines what EduNexus is, how it's built, and the order things get built in. When in doubt, follow this file over improvising.

---

## 1. What this project is

EduNexus is a Digital SAT practice platform (OnePrep-style). Students solve individual practice questions from a tagged question bank, and take full-length **adaptive mock tests** that replicate the real digital SAT's Multistage Adaptive Testing (MST) format as closely as possible.

Two things make this different from a generic quiz app, and both are non-negotiable design constraints:

1. **The test engine is adaptive.** Each section (Reading & Writing, Math) has two modules. Module 1 is the same for every student. Performance on Module 1 determines whether the student receives the easier or harder variant of Module 2. This routing decision — and all scoring — must happen server-side, never on the client.
2. **The question bank is structured, not flat.** Every question is tagged with section, domain, skill, and difficulty. The adaptive engine and analytics both depend on this taxonomy being correct from day one.

---

## 2. Current build phase

**We are in Phase 1: Backend + Question Bank Tooling.**

Do not scaffold the React or Flutter frontends yet. Do not build test-session/attempt endpoints yet. Focus entirely on:
- Core Flask app structure and config
- Database models (see §5)
- Question bank import/authoring tooling (CLI or admin endpoints — CSV/JSON import, validation, tagging)
- Basic CRUD + query endpoints for questions (filter by section/domain/skill/difficulty)

Do not build ahead of the current phase. If a task implies later-phase work (adaptive routing, scoring, auth, frontend), flag it and stop rather than improvising it early.

**Planned phases after this one** (for context, not to be built now):
- Phase 2: Auth + user accounts
- Phase 3: Adaptive test engine (module routing state machine, server-tracked timers)
- Phase 4: Scoring (raw-score → scaled-score conversion tables per section)
- Phase 5: React web frontend
- Phase 6: Flutter apps (Android/iOS/Windows)
- Phase 7: Analytics/progress dashboards

---

## 3. Tech stack

**Backend:** Flask + SQLAlchemy + PostgreSQL (via Supabase)
**Web frontend (Phase 5):** React + Vite + Tailwind
**Native apps (Phase 6):** Flutter — single codebase targeting Android, iOS, and Windows
**Caching (later, if needed):** Redis, for question-pool lookups during adaptive routing
**Auth:** Token-based (JWT bearer tokens), not cookie sessions — required so the same API works identically for the React web client and the Flutter native clients
**Math rendering (frontend, later):** KaTeX on web, `flutter_math_fork` on Flutter
**Deployment:** Backend deployed on its own subdomain (e.g. `api.edunexus.app`), decoupled from wherever the web frontend is hosted. CORS allowlist for the web origin; no CORS concerns for native clients.

---

## 4. Repo structure

Monorepo, single-developer project:

```
edunexus/
├── backend/              # Flask app (current focus)
│   ├── app/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/     # import/validation logic, later: adaptive engine, scoring
│   │   ├── schemas/       # marshmallow/pydantic validation schemas
│   │   └── config.py
│   ├── migrations/
│   ├── scripts/          # question bank import CLI tools
│   ├── tests/
│   └── requirements.txt
├── web/                  # React app (Phase 5, not started)
├── mobile/               # Flutter app (Phase 6, not started)
├── CLAUDE.md             # this file
├── technical-spec.md     # (to be created — full schema, endpoints, adaptive logic spec)
└── build-roadmap.md      # (to be created — phase-gated task breakdown)
```

---

## 5. Question bank data model (Phase 1 core)

This is the schema Claude Code should implement first. Treat it as authoritative unless `technical-spec.md` says otherwise once that file exists.

**`questions` table:**

| Field | Notes |
|---|---|
| `id` | UUID or serial PK |
| `section` | enum: `math`, `reading_writing` |
| `domain` | enum, section-dependent (see taxonomy below) |
| `skill` | text — specific skill within the domain |
| `difficulty` | enum: `easy`, `medium`, `hard` |
| `question_type` | enum: `multiple_choice`, `grid_in` (grid-in is math-only) |
| `stimulus` | text/markdown — passage or prompt context (nullable; most math questions won't have one, all R&W questions will) |
| `stem` | text/markdown — the actual question text |
| `choices` | JSON — array of `{id, text}` for multiple_choice; null for grid_in |
| `correct_answer` | text — choice id, or accepted value(s) for grid_in |
| `rationale` | text/markdown — explanation shown after answering |
| `figure_url` | nullable — for math questions with graphs/diagrams |
| `source` | enum: `official_qb`, `self_authored`, other — track provenance |
| `external_id` | nullable — College Board Question Bank ID if imported from there |
| `created_at` / `updated_at` | timestamps |

**Domain taxonomy (must match exactly — this drives routing and analytics later):**

- **Math:** Algebra · Advanced Math · Problem-Solving & Data Analysis · Geometry & Trigonometry
- **Reading & Writing:** Information & Ideas · Craft & Structure · Expression of Ideas · Standard English Conventions

Difficulty should be assigned per-question at import/authoring time, not inferred later — the adaptive engine (Phase 3) will pool questions by difficulty to build Module 2 variants, so bad tagging now becomes a routing bug later.

---

## 6. Content sourcing note

If question import is pulling from College Board's official Question Bank, confirm their terms of use permit the intended storage/redistribution before building the import pipeline around it. This is a content-licensing decision, not a coding one — surface it, don't silently assume it's fine.

---

## 7. Guardrails for Claude Code

- **Never put adaptive routing or scoring logic in a frontend client.** It belongs in `backend/app/services/` and nowhere else, even in later phases.
- **Don't invent scaled-score math.** True IRT equating isn't achievable without College Board's calibration data. When Phase 4 arrives, we'll use an approximate raw-to-scaled conversion table — flag this as an approximation in code comments, don't present it as psychometrically exact.
- **Don't scaffold frontends yet.** Stay in `backend/` until Phase 1 is genuinely done (models, migrations, import tooling, question CRUD/query endpoints, tests).
- **Ask rather than assume** when a task implies a later phase (auth, sessions, timers, routing) — flag it instead of quietly building it early.

---

## 8. Repo & deployment

Single GitHub repo containing all three top-level folders (`backend/`, `web/`, `mobile/`). Remote: `https://github.com/yamenmod9/edunexus-2.0-.git`.

**While building:**
- Work only within the current phase's folder (see §2 for phase order — Phase 1 is `backend/`).
- Commit incrementally with clear messages. Never push untested or broken code to `main`.
- Do not touch `web/` or `mobile/` until their phases begin.

**When the backend (Phase 1) is complete and its tests pass:**
1. Run the full backend test suite and confirm it passes.
2. Stage and commit all backend changes.
3. If `origin` isn't already set, add it: `git remote add origin https://github.com/yamenmod9/edunexus-2.0-.git`
4. Push to `main`.
5. Deploy to Railway:
   - Create a Railway service connected to this GitHub repo.
   - Set the service's **root directory** to `backend/` so only backend changes trigger redeploys.
   - Set required env vars (`DATABASE_URL` from Supabase, `SECRET_KEY`, etc.) in Railway's settings — never commit secrets to the repo.
   - Confirm the service boots and a health-check endpoint responds.
   - Assign a domain: Railway's generated domain first, or `api.edunexus.app` once DNS is ready.
6. Report the live API URL and stop. Do not start frontend work automatically.

**When the web frontend (Phase 5) is complete and its tests pass:**
1. Confirm the API base URL env var points at the live Railway backend.
2. Commit and push `web/` changes to `main`.
3. Deploy to Cloudflare Pages:
   - Connect the same GitHub repo.
   - Set root directory to `web/`.
   - Build command: `npm run build` (Vite) — output directory: `dist`.
   - Set `VITE_API_URL` (or equivalent) to the Railway API domain.
   - Assign the `edunexus.app` custom domain once DNS points at Cloudflare.
4. Update the Flask backend's CORS allow-list to include the live frontend domain; redeploy backend if changed.

**Not part of this flow:** `mobile/` (Flutter) is never deployed to a web host — it's compiled separately for app store distribution.

**Current state:** this directory is not yet a git repository. `git init` and the initial commit come before step 3 above, the first time this flow runs.

---

## 9. Working agreement (how Claude Code operates here)

### 9.1 Every task: plan → implement → audit

Three passes, in order, on all non-trivial work. Do not skip the audit — it's where the bugs that survive implementation get caught.

1. **Plan** — state the approach and the files to be touched before writing code. For a whole phase, plan the phase; for a task, a couple of lines is enough. Don't ask permission to proceed; just show the plan and continue.
2. **Implement** — build it.
3. **Audit** — review your own diff against this file's constraints, then *run the thing* (see §9.4). Report what the audit found, including when it found nothing. Fix what it surfaces before declaring done.

### 9.2 Phase autonomy — don't stop between steps

`build-roadmap.md` is the approved phase plan. Once a phase is approved, build it end to end without pausing for confirmation between tasks. Specifically:

- **Do not** ask "shall I continue?", "want me to proceed?", or present options that have an obvious default. Make the call and note it.
- **Do** stop and ask only when genuinely blocked: a missing credential, a decision only the user can make (licensing, spend, domains), or a contradiction with this file.
- Finish the phase, then stop and report. Do not roll into the next phase automatically.

### 9.3 Response format — terse, verifiable

Optimize the user's review time and cost. Per response:

- No preamble, no narration of what you're about to do, no restating the request.
- Prose only where it carries information a list can't.
- **End every response with a short status block** — the thing the user reads to verify:

```
DONE: <what actually works, past tense>
BUGS: <found + fixed, with file:line — or "none">
NEXT: <the single next action, or "awaiting review">
BLOCKED: <only if blocked, else omit>
```

- Report failures plainly with the actual output. Never describe unrun code as working, and never pad a summary to look thorough.

### 9.4 "Done" means run, not compiled

A phase or task is not done because tests pass. Before claiming done: launch the real thing and drive it (API → `curl` the routes; UI → load the page and interact). Tests plus a live run, or it isn't done. Report bugs the run surfaced that the tests missed.
