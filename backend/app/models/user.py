import uuid
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db

ROLES = ("student", "admin")


def _utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student")
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, default=_utcnow)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow)

    tokens = db.relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )

    @staticmethod
    def normalize_email(email):
        return email.strip().lower()

    def set_password(self, password):
        # scrypt via Werkzeug — no native build step, which keeps the
        # dependency set free of platform wheel problems.
        self.password_hash = generate_password_hash(password, method="scrypt")

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == "admin"

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RefreshToken(db.Model):
    """One row per issued refresh token, so tokens can be revoked on logout
    and rotated on refresh. Without this, a leaked refresh token would stay
    valid for its full lifetime with no way to kill it."""

    __tablename__ = "refresh_tokens"

    jti = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=_utcnow)

    user = db.relationship("User", back_populates="tokens")

    @property
    def is_revoked(self):
        return self.revoked_at is not None
