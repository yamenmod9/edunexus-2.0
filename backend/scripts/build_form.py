"""Assemble a test form from the question bank.

Defaults to real Digital SAT dimensions (R&W 27 questions / 32 min per module,
Math 22 / 35), which needs 81 R&W and 66 Math questions in the bank. Use
--questions-per-module for a shorter practice form.

Usage:
    python -m scripts.build_form "Practice Test 1"
    python -m scripts.build_form "Mini 1" --questions-per-module 8 --minutes 12
    python -m scripts.build_form "Practice Test 2" --seed 42 --dry-run
"""

import argparse
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import SECTION_ORDER  # noqa: E402
from app.services.form_service import (  # noqa: E402
    DEFAULT_BLUEPRINT,
    FormAssemblyError,
    assemble_form,
)


def build_blueprint(args):
    if args.questions_per_module is None and args.minutes is None:
        return None  # full-length defaults

    blueprint = {}
    for section in SECTION_ORDER:
        default = DEFAULT_BLUEPRINT[section]
        blueprint[section] = {
            "questions_per_module": args.questions_per_module
            or default["questions_per_module"],
            "time_limit_seconds": (args.minutes * 60)
            if args.minutes
            else default["time_limit_seconds"],
        }
    return blueprint


def main():
    parser = argparse.ArgumentParser(description="Assemble a test form.")
    parser.add_argument("name")
    parser.add_argument("--description", default=None)
    parser.add_argument(
        "--questions-per-module",
        type=int,
        default=None,
        help="Override the per-module length for both sections.",
    )
    parser.add_argument(
        "--minutes",
        type=int,
        default=None,
        help="Override the per-module time limit for both sections.",
    )
    parser.add_argument(
        "--seed", type=int, default=None, help="Makes assembly reproducible."
    )
    parser.add_argument(
        "--inactive",
        action="store_true",
        help="Assemble without publishing; students cannot start it.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Assemble, report, then roll back without saving.",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        try:
            form, report = assemble_form(
                name=args.name,
                description=args.description,
                blueprint=build_blueprint(args),
                seed=args.seed,
                activate=not args.inactive,
            )
        except FormAssemblyError as exc:
            print(f"error: {exc}", file=sys.stderr)
            for shortfall in exc.shortfalls:
                print(
                    "  {section}: need {needed}, have {available} "
                    "(short by {short_by})".format(**shortfall),
                    file=sys.stderr,
                )
            return 1

        print(f"{'would assemble' if args.dry_run else 'assembled'} form {form.name}")
        print(f"  id: {form.id}")
        for module in form.modules:
            print(
                "  {:<16} module {} ({:<8}) {:>3} questions, {:>4}s".format(
                    module.section,
                    module.sequence,
                    module.variant,
                    module.question_count,
                    module.time_limit_seconds,
                )
            )
        for substitution in report["substitutions"]:
            print(
                "  note: {section} module {sequence} ({variant}) took "
                "{substituted} question(s) off its difficulty target — the bank "
                "is thin at that level".format(**substitution)
            )

        if args.dry_run:
            db.session.delete(form)
            db.session.commit()
            print("  rolled back (--dry-run)")

        return 0


if __name__ == "__main__":
    sys.exit(main())
