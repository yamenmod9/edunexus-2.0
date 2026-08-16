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

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness (no DB) |
| GET | `/health/db` | readiness (checks Postgres) |
| GET | `/api/questions` | filter + paginate |
| GET | `/api/questions/<id>` | |
| POST | `/api/questions` | 201, or 422 with per-field errors |
| PATCH | `/api/questions/<id>` | partial; re-validates the merged record |
| DELETE | `/api/questions/<id>` | 204 |

Filters: `section`, `domain`, `skill`, `difficulty`, `question_type`, `source`,
plus `page` / `per_page` (max 200).

```bash
curl "http://127.0.0.1:5055/api/questions?section=math&difficulty=hard&per_page=10"
```

### Validation rules

Enforced in the schema and mirrored by database check constraints:

- `domain` must belong to its `section` (taxonomy in `CLAUDE.md` §5)
- `multiple_choice` requires `choices`; `grid_in` must not have them
- `grid_in` is math-only
