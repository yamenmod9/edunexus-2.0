# EduNexus Backend

Flask + SQLAlchemy API for the EduNexus Digital SAT platform. See `../CLAUDE.md` for architecture and phase rules, `../build-roadmap.md` for the task breakdown.

## Setup

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # macOS/Linux

cp .env.example .env   # then fill in DATABASE_URL / SECRET_KEY
```

`DATABASE_URL` is optional locally — without it the app falls back to a SQLite
file (`edunexus_dev.db`), so the API runs with no Supabase credentials.

## Run

```bash
.venv/Scripts/python.exe -m flask --app wsgi run --port 5055
```

Verify:

```bash
curl http://127.0.0.1:5055/health      # {"status":"ok"}          liveness
curl http://127.0.0.1:5055/health/db   # {"database":"connected"} readiness
```

Production (what Railway runs, via `Procfile`):

```bash
gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60
```

## Tests

```bash
.venv/Scripts/python.exe -m pytest              # all
.venv/Scripts/python.exe -m pytest -q           # quiet
.venv/Scripts/python.exe -m pytest tests/test_questions_api.py            # one file
.venv/Scripts/python.exe -m pytest -k test_patch_rejects_invalid_merged_state  # one test
```

Tests run against in-memory SQLite; no database setup required.

## Migrations

```bash
.venv/Scripts/python.exe -m flask --app wsgi db upgrade    # apply
.venv/Scripts/python.exe -m flask --app wsgi db migrate -m "message"   # generate
.venv/Scripts/python.exe -m flask --app wsgi db current    # show revision
```

Always generate migrations with `DATABASE_URL` pointing at **Postgres**, never
the SQLite fallback — autogenerating from SQLite bakes in wrong column types.

In production, `db upgrade` runs itself: `railway.json` sets it as the service's
pre-deploy command, so it runs after the build and before the new version takes
traffic. Note that Railway does **not** run a Heroku-style `release:` process
from the Procfile — putting the upgrade there would look done and do nothing.

## Deployment region

**Keep the Railway service in the same region as the Supabase database**
(currently `europe-west4`, matching Supabase in eu-west). This is not a
micro-optimisation. The service ran in `sfo` against a eu-west database for a
while, and every single query paid a transatlantic round trip:

| | `sfo` | `europe-west4` |
|---|---|---|
| `/health`, touching no database | ~200ms | ~90ms |
| a login, one query plus bcrypt | ~880ms | ~145ms |

(Server-side time, measured as TTFB minus the TLS handshake so the client's own
distance is excluded.) That is roughly 680ms of pure network per query, on a
screen where the student is waiting.

Supabase's **direct** connection host also resolves IPv6-only, and this service
has IPv6 egress disabled — so `DATABASE_URL` must use the **pooler** host, not
`db.<ref>.supabase.co`.

## Question bank import

```bash
.venv/Scripts/python.exe -m scripts.import_questions path/to/questions.csv --dry-run
.venv/Scripts/python.exe -m scripts.import_questions path/to/questions.json
```

Accepts `.csv` and `.json`. Each row is validated independently: valid rows
import even when siblings fail, failures are reported by row index, and the
command exits non-zero if any row failed. `--dry-run` validates and rolls back.

In CSV, the `choices` column holds a JSON array; empty cells become SQL NULL
rather than empty strings.

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | liveness (no DB) |
| GET | `/health/db` | public | readiness (checks Postgres) |
| POST | `/api/auth/register` | public | creates a student, returns a token pair |
| POST | `/api/auth/login` | public | returns a token pair |
| POST | `/api/auth/refresh` | public | rotates: revokes the old refresh token |
| POST | `/api/auth/logout` | public | revokes the presented refresh token |
| GET | `/api/auth/me` | user | current account |
| POST | `/api/auth/password` | user | changes password, revokes all sessions |
| GET | `/api/questions` | **user** | filter + paginate |
| GET | `/api/questions/<id>` | **user** | |
| POST | `/api/questions/<id>/check` | **user** | practice grading; 409 for a question in your live attempt |
| POST | `/api/questions` | **admin** | 201, or 422 with per-field errors |
| PATCH | `/api/questions/<id>` | **admin** | partial; re-validates the merged record |
| DELETE | `/api/questions/<id>` | **admin** | 204 |
| GET | `/api/forms` | **user** | active forms; admins see every form and its variants |
| GET | `/api/forms/<id>` | **user** | |
| POST | `/api/forms` | **admin** | assembles a form from the bank; 422 with shortfalls if the bank is thin |
| DELETE | `/api/forms/<id>` | **admin** | 204; 409 once the form has attempts |
| POST | `/api/attempts` | **user** | starts an attempt; 409 if one is already open |
| GET | `/api/attempts` | **user** | your own attempts, newest first |
| GET | `/api/attempts/current` | **user** | resume: the open attempt, or `null` |
| GET | `/api/attempts/<id>` | **user** | current module, questions, time left |
| PUT | `/api/attempts/<id>/responses/<qid>` | **user** | `{"answer": "B", "flagged": true}` |
| POST | `/api/attempts/<id>/module/complete` | **user** | finish the module early; triggers routing |
| POST | `/api/attempts/<id>/submit` | **user** | end the attempt wherever you are |
| POST | `/api/attempts/<id>/abandon` | **user** | discard without finishing |
| GET | `/api/attempts/<id>/review` | **user** | 409 until the attempt is over |
| GET | `/api/attempts/<id>/score` | **user** | score report; 409 until the attempt is over |

Attempt and form routes are owner-scoped and answer 404 — not 403 — for
someone else's attempt, so ids cannot be probed. Admins get no back door into
a student's attempt.

Filters: `section`, `domain`, `skill`, `difficulty`, `question_type`, `source`,
plus `page` / `per_page` (max 200).

```bash
curl "http://127.0.0.1:5055/api/questions?section=math&difficulty=hard&per_page=10" \
     -H "Authorization: Bearer <access_token>"
```

## Authentication

Reading the question bank requires an account. Register, then send the access
token as a bearer token:

```bash
curl -X POST $API/api/auth/register -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","password":"your long password 1"}'

curl "$API/api/questions" -H "Authorization: Bearer <access_token>"
```

Access tokens last 15 minutes and cannot be revoked; refresh tokens last 30
days, are stored per-`jti`, and are rotated on every refresh so a stolen one
stops working as soon as the real client refreshes. Changing a password
revokes every outstanding session.

Registration always creates a `student`. Create the first admin out-of-band:

```bash
python -m scripts.create_admin admin@example.com            # create
python -m scripts.create_admin someone@example.com --promote  # promote existing
```

The password is read from `EDUNEXUS_ADMIN_PASSWORD` or prompted for — never
passed as an argument, which would leak it into shell history.

Auth routes are rate limited (default 10 attempts / 5 minutes per IP). The
limiter is in-process, so with N gunicorn workers the effective limit is N x
that; move it to Redis before scaling up.

### Validation rules

Enforced in the schema and mirrored by database check constraints:

- `domain` must belong to its `section` (taxonomy in `CLAUDE.md` §5)
- `multiple_choice` requires `choices`; `grid_in` must not have them
- `grid_in` is math-only

## Adaptive test engine

A **form** is a pre-assembled test: six modules, being module 1 plus both
module 2 variants, for each of the two sections. An **attempt** walks four of
them:

```
1  Reading & Writing module 1   same for everyone
2  Reading & Writing module 2   routed from module 1
3  Math module 1                same for everyone
4  Math module 2                routed from module 3
```

Assemble a form from the bank:

```bash
.venv/Scripts/python.exe -m scripts.build_form "Practice Test 1"
.venv/Scripts/python.exe -m scripts.build_form "Mini 1" --questions-per-module 8 --minutes 12
.venv/Scripts/python.exe -m scripts.build_form "Practice Test 2" --seed 42 --dry-run
```

Defaults are the real Digital SAT shape — R&W 27 questions / 32 min per
module, Math 22 / 35 — which needs 81 R&W and 66 Math questions in the bank.
Assembly is all-or-nothing: a bank too thin for the blueprint fails with a
per-section shortfall rather than writing a half-built form that would route
students into an empty module 2.

### Routing

`app/services/routing_service.py` is the only place the module 2 decision is
made. It compares the module 1 raw-score ratio against `ROUTING_THRESHOLD`
(default `0.6`, inclusive — meeting it routes up). Every input is written to
the module attempt, so a past decision stays explainable from stored data.

The threshold is snapshotted onto the attempt when it starts, so changing the
config never re-routes a test already under way.

This is an **approximation**. The real exam routes on an IRT ability estimate
that needs College Board item calibration data we do not have.

### Timers

Each module attempt stores `expires_at`, set server-side from the module's
limit. The client is never the clock. Reading an attempt is what rolls an
expired module forward, and the next module starts at the previous module's
**deadline**, not at reconnect — otherwise closing the app during module 1
would buy a fresh clock for module 2. A long enough absence expires every
remaining module in one pass and submits the attempt.

### Withholding the answer key

Questions delivered during an attempt carry an explicit allowlist of fields
(`app/schemas/attempt_schema.py`): no `correct_answer`, no `rationale`, and no
`difficulty` — a module 2 full of hard questions would otherwise announce that
the student routed up. Answers are graded server-side the moment they are
submitted, but `is_correct` is never serialized back until the attempt is.

The question bank is the other way in, so it is narrowed too: non-admin reads
of `/api/questions` omit `correct_answer` and `rationale` entirely. Practice
mode grades through `POST /api/questions/<id>/check`, which refuses any
question that is part of the caller's in-progress attempt.

`GET /api/attempts/<id>/review` returns 409 until the attempt is submitted or
abandoned; afterwards it returns the key, the grading, and the routing
decision with its inputs. It reports **raw counts only** — scaled scores are
Phase 4.

## Scoring

**These scores are an approximation and are not official SAT equating.**
Real scaling is IRT-based and needs College Board's per-item calibration
data, which we do not have (`CLAUDE.md` §7). Every score payload carries
`approximation: true` and a note saying so; any UI that displays a score must
surface that caveat rather than presenting the number bare.

`GET /api/attempts/<id>/score` returns the report, and `/review` embeds the
same object under `score` so a result screen needs one request, not two.

### Conversion tables are data

The curves live in `app/data/scoring/edunexus_approx_v1.json`, not in code, so
better estimates can be dropped in without touching `scoring_service.py`.
Regenerate with:

```bash
.venv/Scripts/python.exe -m scripts.generate_scale_table
.venv/Scripts/python.exe -m scripts.generate_scale_table --stdout   # preview
```

Each section has two curves. Routing to the easier module 2 **caps the
section** — the easy path tops out at 600, the hard path at 800 — because a
student who never saw the harder questions has not shown they can answer
them. The practical effect: the same raw score is worth about 140 points more
on the hard path.

Section scores are 200–800 in multiples of 10, totals 400–1600. Curves are
generated non-decreasing, so an extra correct answer can never lower a score.

`SCALE_TABLE_ID` selects the table for **new** attempts. Each attempt stores
the id it was started under, so re-scaling never rewrites a score a student
has already been shown.

### Short forms

A practice form may run 8 questions a module rather than 27. Raw scores are
projected onto the table's canonical length (54 R&W, 44 Math) before lookup.
That projection is itself an approximation — 6/8 is treated as equivalent to
40/54, which real equating would not accept.

### Incomplete attempts

A section the student never finished reports `scaled_score: null` with an
`incomplete_reason`, and the total is null unless both sections are complete.
Raw counts and the per-domain breakdown are still reported. Half a test does
not have a 400–1600 score, and inventing one would be the wrong kind of
helpful.

## Deployment

Deployed on Railway (project `gleaming-vitality`, service `edunexus-api`) from
the `main` branch of `yamenmod9/edunexus-2.0`.

Railway service settings that matter:

| Setting | Value |
|---|---|
| Root directory | `/backend` |
| Start command | from `Procfile` (gunicorn) |
| Healthcheck path | `/health` |

Required environment variables in Railway:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string |
| `SECRET_KEY` | set in Railway, never committed |
| `FLASK_ENV` | `production` |

`ProductionConfig` raises at startup if `DATABASE_URL` or `SECRET_KEY` is
missing — a misconfigured deploy fails loudly instead of booting broken.
