import csv
import io
import json
from dataclasses import dataclass, field

from app.extensions import db
from app.models import Question
from app.schemas import question_schema

# CSV columns that are stored as JSON in the model but arrive as JSON-encoded
# strings in a CSV cell.
JSON_CSV_FIELDS = ("choices",)


@dataclass
class ImportResult:
    created: int = 0
    errors: list = field(default_factory=list)  # [{"row": int, "errors": dict}]

    @property
    def success(self) -> bool:
        return not self.errors


def _clean_row(raw: dict) -> dict:
    """Drop empty-string fields (CSV has no concept of null) and decode
    JSON-encoded cells."""
    row = {}
    for key, value in raw.items():
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                continue
        if key in JSON_CSV_FIELDS and isinstance(value, str):
            value = json.loads(value)
        row[key] = value
    return row


def import_records(records: list[dict], *, commit: bool = True) -> ImportResult:
    """Validate and insert a list of question dicts. Every record is
    validated independently; valid records are inserted even if others in
    the batch fail, and every failure is reported with its row index."""
    result = ImportResult()
    valid_questions = []

    for index, raw_record in enumerate(records):
        errors = question_schema.validate(raw_record)
        if errors:
            result.errors.append({"row": index, "errors": errors})
            continue
        loaded = question_schema.load(raw_record)
        valid_questions.append(Question(**loaded))

    if valid_questions:
        db.session.add_all(valid_questions)
        if commit:
            db.session.commit()

    result.created = len(valid_questions)
    return result


def import_from_json(file_path: str) -> ImportResult:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = data.get("questions", [])

    records = [_clean_row(record) for record in data]
    return import_records(records)


def import_from_csv(file_path: str) -> ImportResult:
    with open(file_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        records = [_clean_row(row) for row in reader]
    return import_records(records)


def parse_csv_text(text: str) -> list[dict]:
    """CSV rows from an uploaded body rather than a path. Split out so the
    admin upload endpoint and the CLI share one parser and cannot drift in
    how they treat empty cells or JSON columns."""
    reader = csv.DictReader(io.StringIO(text))
    return [_clean_row(row) for row in reader]


def parse_json_text(text: str) -> list[dict]:
    data = json.loads(text)
    if isinstance(data, dict):
        data = data.get("questions", [])
    if not isinstance(data, list):
        raise ValueError("expected a JSON array of questions")
    return [_clean_row(record) for record in data]
