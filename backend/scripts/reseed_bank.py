"""Reloads the question bank from data/question_bank/*.json.

The JSON files are the source of truth; the database is a derived artifact.
This drops every question and reimports them, so an edit to a bank file cannot
leave stale rows behind.

Because questions are referenced by forms and by answered attempts (both
ON DELETE RESTRICT, deliberately - a delivered question must not vanish from a
student's score report), a full reload also clears forms and attempts. That is
destructive and dev-only, hence the explicit --yes flag.

    python -m scripts.reseed_bank --yes
    python -m scripts.reseed_bank --yes --build-forms 4
"""

import argparse
import glob
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    AnswerResponse,
    FormQuestion,
    Module,
    ModuleAttempt,
    Question,
    TestAttempt,
    TestForm,
)
from app.services.form_service import assemble_form  # noqa: E402
from app.services.question_import import import_records, _clean_row  # noqa: E402

BANK_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "question_bank"
)


def main():
    p = argparse.ArgumentParser(description="Reload the question bank from JSON.")
    p.add_argument("--yes", action="store_true", help="Confirm the destructive reload.")
    p.add_argument(
        "--build-forms",
        type=int,
        default=0,
        help="Assemble N full-length forms after importing.",
    )
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--quick-form",
        action="store_true",
        help="Also assemble a 2-question-per-module form for end-to-end tests, "
        "which would otherwise have to click through all 98 questions.",
    )
    args = p.parse_args()

    if not args.yes:
        print("refusing to run without --yes (this deletes all questions, forms "
              "and attempts)", file=sys.stderr)
        return 2

    app = create_app()
    with app.app_context():
        # Order matters: dependents before the rows they point at.
        for model in (AnswerResponse, ModuleAttempt, TestAttempt, FormQuestion,
                      Module, TestForm, Question):
            db.session.query(model).delete()
        db.session.commit()

        total = 0
        for path in sorted(glob.glob(os.path.join(BANK_DIR, "*.json"))):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            records = [_clean_row(r) for r in data.get("questions", [])]
            result = import_records(records, commit=True)
            print(
                f"  {os.path.basename(path):32} +{result.created:4}  "
                f"errors {len(result.errors)}"
            )
            for err in result.errors[:3]:
                print(f"      {err}")
            total += result.created

        print(f"imported {total} questions")

        if args.quick_form:
            blueprint = {
                section: {"questions_per_module": 2, "time_limit_seconds": 1800}
                for section in ("reading_writing", "math")
            }
            form, _ = assemble_form(
                name="Quick Check",
                seed=args.seed - 1,
                blueprint=blueprint,
                description="Short form for automated end-to-end tests.",
            )
            db.session.commit()
            print("  assembled Quick Check: 2 questions per module")

        for i in range(args.build_forms):
            name = f"Practice Test {i + 1}"
            form, _report = assemble_form(
                name=name,
                seed=args.seed + i,
                description="Full-length adaptive practice test",
            )
            db.session.commit()
            n = sum(len(m.form_questions) for m in form.modules)
            print(f"  assembled {name}: {n} questions across {len(form.modules)} modules")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
