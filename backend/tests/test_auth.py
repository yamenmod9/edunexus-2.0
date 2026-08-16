import time

import jwt
import pytest

from app.auth import reset_rate_limits
from app.models import RefreshToken, User

CREDS = {"email": "student@example.com", "password": "correct horse 7"}


@pytest.fixture(autouse=True)
def _clear_limits():
    reset_rate_limits()
    yield
    reset_rate_limits()


def register(client, **overrides):
    return client.post("/api/auth/register", json={**CREDS, **overrides})


def test_register_returns_tokens_and_student_role(client):
    resp = register(client)
    assert resp.status_code == 201

    body = resp.get_json()
    assert body["user"]["email"] == CREDS["email"]
    assert body["user"]["role"] == "student"
    assert body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"]


def test_register_never_returns_password_hash(client):
    body = register(client).get_json()
    assert "password_hash" not in body["user"]
    assert "password" not in body["user"]


def test_email_is_normalized(client, db):
    register(client, email="Student@Example.COM  ")
    assert db.session.query(User).filter_by(email="student@example.com").count() == 1


def test_duplicate_email_rejected(client):
    register(client)
    assert register(client).status_code == 409


def test_duplicate_is_case_insensitive(client):
    register(client)
    assert register(client, email="STUDENT@example.com").status_code == 409


@pytest.mark.parametrize(
    "password", ["short1", "nodigitshere", "1234567890", "abc12"]
)
def test_weak_passwords_rejected(client, password):
    resp = register(client, password=password)
    assert resp.status_code == 422
    assert "password" in resp.get_json()["errors"]


def test_login_succeeds(client):
    register(client)
    resp = client.post("/api/auth/login", json=CREDS)
    assert resp.status_code == 200
    assert resp.get_json()["access_token"]


def test_login_wrong_password_rejected(client):
    register(client)
    resp = client.post(
        "/api/auth/login", json={**CREDS, "password": "wrong password 1"}
    )
    assert resp.status_code == 401


def test_login_does_not_reveal_whether_account_exists(client):
    register(client)
    unknown = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever 1"}
    )
    wrong = client.post("/api/auth/login", json={**CREDS, "password": "wrong pass 1"})

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.get_json()["error"] == wrong.get_json()["error"]


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_current_user(client):
    token = register(client).get_json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.get_json()["email"] == CREDS["email"]


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Basic abc123", "Bearer   ", "token abc123"],
)
def test_malformed_authorization_headers_rejected(client, header):
    resp = client.get("/api/auth/me", headers={"Authorization": header})
    assert resp.status_code == 401


def test_garbage_token_rejected(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


def test_token_signed_with_wrong_secret_rejected(client, app):
    forged = jwt.encode(
        {"sub": "whoever", "role": "admin", "type": "access", "exp": 9999999999},
        "not-the-real-secret",
        algorithm="HS256",
    )
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


def test_expired_access_token_rejected(client, app):
    app.config["ACCESS_TOKEN_TTL_MINUTES"] = -1  # already expired
    token = register(client).get_json()["access_token"]

    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert "expired" in resp.get_json()["error"]


def test_refresh_token_cannot_be_used_as_access_token(client):
    """A refresh token is also a valid JWT — the `type` claim is what stops
    it being replayed against a protected route."""
    refresh = register(client).get_json()["refresh_token"]

    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh}"})
    assert resp.status_code == 401


def test_refresh_rotates_and_revokes_the_old_token(client, db):
    original = register(client).get_json()["refresh_token"]

    resp = client.post("/api/auth/refresh", json={"refresh_token": original})
    assert resp.status_code == 200
    rotated = resp.get_json()["refresh_token"]
    assert rotated != original

    # The old one must not work a second time.
    replay = client.post("/api/auth/refresh", json={"refresh_token": original})
    assert replay.status_code == 401

    # And the new one must.
    assert client.post("/api/auth/refresh", json={"refresh_token": rotated}).status_code == 200


def test_access_token_cannot_be_used_to_refresh(client):
    access = register(client).get_json()["access_token"]
    assert client.post("/api/auth/refresh", json={"refresh_token": access}).status_code == 401


def test_logout_revokes_refresh_token(client):
    refresh = register(client).get_json()["refresh_token"]

    assert client.post("/api/auth/logout", json={"refresh_token": refresh}).status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_password_change_revokes_all_sessions(client, db):
    body = register(client).get_json()
    access, refresh = body["access_token"], body["refresh_token"]

    resp = client.post(
        "/api/auth/password",
        json={"current_password": CREDS["password"], "new_password": "brand new pass 9"},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert resp.status_code == 200

    assert client.post("/api/auth/refresh", json={"refresh_token": refresh}).status_code == 401
    assert client.post("/api/auth/login", json=CREDS).status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={**CREDS, "password": "brand new pass 9"}
        ).status_code
        == 200
    )


def test_password_change_requires_correct_current_password(client):
    access = register(client).get_json()["access_token"]
    resp = client.post(
        "/api/auth/password",
        json={"current_password": "wrong one 1", "new_password": "brand new pass 9"},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert resp.status_code == 401


def test_deactivated_user_is_locked_out(client, db):
    body = register(client).get_json()

    user = db.session.query(User).one()
    user.is_active = False
    db.session.commit()

    resp = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert resp.status_code == 401
    assert client.post("/api/auth/login", json=CREDS).status_code == 401


def test_rate_limit_blocks_repeated_login_attempts(client, app):
    register(client)
    app.config["RATE_LIMIT_ENABLED"] = True
    app.config["AUTH_RATE_LIMIT_ATTEMPTS"] = 3

    for _ in range(3):
        client.post("/api/auth/login", json={**CREDS, "password": "wrong pass 1"})

    blocked = client.post("/api/auth/login", json=CREDS)
    assert blocked.status_code == 429
    assert blocked.headers.get("Retry-After")


def test_refresh_token_row_is_recorded(client, db):
    register(client)
    assert db.session.query(RefreshToken).count() == 1
