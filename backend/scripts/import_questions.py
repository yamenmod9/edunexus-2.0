"""Question bank import CLI.

Usage:
    python -m scripts.import_questions path/to/questions.csv
    python -m scripts.import_questions path/to/questions.json --dry-run
"""

import argparse
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.services.question_import import (  # noqa: E402
    _clean_row,
    import_from_csv,
    import_from_json,
    import_records,
)


def _load_records(path):
    if path.lower().endswith(".json"):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data = data.get("questions", [])
        return [_clean_row(r) for r in data]
    import csv

    with open(path, "r", encoding="utf-8", newline="") as f:
        return [_clean_row(row) for row in csv.DictReader(f)]


def main():
    parser = argparse.ArgumentParser(description="Import questions into the EduNexus bank.")
    parser.add_argument("path", help="Path to a .csv or .json question file")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate only; roll back instead of committing.",
    )
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 2

    app = create_app()
    with app.app_context():
        if args.dry_run:
            records = _load_records(args.path)
            result = import_records(records, commit=False)
            db.session.rollback()
        elif args.path.lower().endswith(".json"):
            result = import_from_json(args.path)
        else:
            result = import_from_csv(args.path)

        label = "would import" if args.dry_run else "imported"
        print(f"{label}: {result.created}")
        print(f"failed:   {len(result.errors)}")

        for failure in result.errors:
            print(f"  row {failure['row']}: {failure['errors']}", file=sys.stderr)

        return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
