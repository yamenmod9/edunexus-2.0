"""Create an admin user, or promote an existing account to admin.

Registration always creates students, so the first admin has to be made
out-of-band. Password is read from EDUNEXUS_ADMIN_PASSWORD or prompted for,
never passed as an argument (arguments leak into shell history).

Usage:
    python -m scripts.create_admin admin@example.com
    python -m scripts.create_admin admin@example.com --promote
"""

import argparse
import getpass
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import User  # noqa: E402
from app.schemas.auth_schema import _validate_password_strength  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Create or promote an admin user.")
    parser.add_argument("email")
    parser.add_argument(
        "--promote",
        action="store_true",
        help="Promote an existing account instead of creating a new one.",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        email = User.normalize_email(args.email)
        existing = db.session.query(User).filter_by(email=email).first()

        if args.promote:
            if existing is None:
                print(f"error: no account with email {email}", file=sys.stderr)
                return 1
            existing.role = "admin"
            db.session.commit()
            print(f"promoted {email} to admin")
            return 0

        if existing is not None:
            print(
                f"error: {email} already exists (use --promote)", file=sys.stderr
            )
            return 1

        password = os.environ.get("EDUNEXUS_ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass("Password: ")
            if password != getpass.getpass("Confirm password: "):
                print("error: passwords do not match", file=sys.stderr)
                return 1

        try:
            _validate_password_strength(password)
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1

        user = User(email=email, role="admin")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"created admin {email}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
