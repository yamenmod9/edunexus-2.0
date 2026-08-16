import uuid
from datetime import datetime, timedelta, timezone

import jwt
from flask import current_app

from app.extensions import db
from app.models import RefreshToken, User

ALGORITHM = "HS256"


class AuthError(Exception):
    """Raised for any authentication failure. The message is safe to return
    to the client; it deliberately never distinguishes 'unknown email' from
    'wrong password'."""


def _utcnow():
    return datetime.now(timezone.utc)


def _utcnow_naive():
    """Naive UTC, matching the DateTime columns (which are timezone-naive)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _secret():
    return current_app.config["SECRET_KEY"]


def _encode(payload):
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def issue_access_token(user):
    ttl = current_app.config["ACCESS_TOKEN_TTL_MINUTES"]
    now = _utcnow()
    return _encode(
        {
            "sub": user.id,
            "role": user.role,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=ttl),
            "jti": str(uuid.uuid4()),
        }
    )


def issue_refresh_token(user):
    ttl_days = current_app.config["REFRESH_TOKEN_TTL_DAYS"]
    now = _utcnow()
    expires_at = now + timedelta(days=ttl_days)
    jti = str(uuid.uuid4())

    db.session.add(
        RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at.replace(tzinfo=None))
    )
    db.session.commit()

    return _encode(
        {
            "sub": user.id,
            "type": "refresh",
            "iat": now,
            "exp": expires_at,
            "jti": jti,
        }
    )


def issue_token_pair(user):
    return {
        "access_token": issue_access_token(user),
        "refresh_token": issue_refresh_token(user),
        "token_type": "bearer",
        "expires_in": current_app.config["ACCESS_TOKEN_TTL_MINUTES"] * 60,
    }


def decode_token(token, expected_type):
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("invalid token") from exc

    if payload.get("type") != expected_type:
        # Stops a refresh token being replayed as an access token.
        raise AuthError(f"expected a {expected_type} token")

    return payload


def register_user(email, password, role="student"):
    email = User.normalize_email(email)
    if db.session.query(User).filter_by(email=email).first():
        raise AuthError("an account with that email already exists")

    user = User(email=email, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


def authenticate(email, password):
    email = User.normalize_email(email)
    user = db.session.query(User).filter_by(email=email).first()

    # Same error and roughly the same work either way, so the response does
    # not reveal whether an account exists.
    if user is None or not user.check_password(password):
        raise AuthError("invalid email or password")
    if not user.is_active:
        raise AuthError("account is disabled")

    return user


def get_user_from_access_token(token):
    payload = decode_token(token, "access")
    user = db.session.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise AuthError("account no longer valid")
    return user


def rotate_refresh_token(token):
    """Verifies a refresh token, revokes it, and issues a fresh pair. Rotation
    means a stolen refresh token is only usable until the legitimate client
    next refreshes."""
    payload = decode_token(token, "refresh")

    stored = db.session.get(RefreshToken, payload.get("jti"))
    if stored is None:
        raise AuthError("refresh token is not recognized")
    if stored.is_revoked:
        raise AuthError("refresh token has been revoked")
    if stored.expires_at < _utcnow_naive():
        raise AuthError("refresh token has expired")

    user = db.session.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise AuthError("account no longer valid")

    stored.revoked_at = _utcnow_naive()
    db.session.commit()

    return user, issue_token_pair(user)


def revoke_refresh_token(token):
    payload = decode_token(token, "refresh")
    stored = db.session.get(RefreshToken, payload.get("jti"))
    if stored is None:
        raise AuthError("refresh token is not recognized")

    if not stored.is_revoked:
        stored.revoked_at = _utcnow_naive()
        db.session.commit()


def revoke_all_for_user(user):
    now = _utcnow_naive()
    (
        db.session.query(RefreshToken)
        .filter_by(user_id=user.id, revoked_at=None)
        .update({"revoked_at": now})
    )
    db.session.commit()


def change_password(user, current_password, new_password):
    if not user.check_password(current_password):
        raise AuthError("current password is incorrect")

    user.set_password(new_password)
    db.session.commit()
    # A password change should invalidate every existing session.
    revoke_all_for_user(user)
