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
| POST | `/api/questions` | **admin** | 201, or 422 with per-field errors |
| PATCH | `/api/questions/<id>` | **admin** | partial; re-validates the merged record |
| DELETE | `/api/questions/<id>` | **admin** | 204 |

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

## Deployment

Deployed on Railway (project `gleaming-vitality`, service `edunexus-api`) from
the `main` branch of `yamenmod9/edunexus-2.0-`.

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
