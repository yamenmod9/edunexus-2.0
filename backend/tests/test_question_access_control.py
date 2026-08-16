"""Phase 2 access rules for the question bank:

    reads  -> any signed-up, active user
    writes -> admins only

Every route is asserted explicitly; a route that silently loses its
decorator is exactly the kind of regression these tests exist to catch.
"""

import pytest

from tests.conftest import make_question

STUDENT = {"email": "student@example.com", "password": "student pass 1"}
ADMIN = {"email": "admin@example.com", "password": "admin pass 12"}


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def student_token(client):
    return client.post("/api/auth/register", json=STUDENT).get_json()["access_token"]


@pytest.fixture
def admin_token(client, db):
    from app.models import User

    client.post("/api/auth/register", json=ADMIN)
    user = db.session.query(User).filter_by(email=ADMIN["email"]).one()
    user.role = "admin"
    db.session.commit()

    return client.post("/api/auth/login", json=ADMIN).get_json()["access_token"]


@pytest.fixture
def existing_question(client, admin_token):
    return client.post(
        "/api/questions", json=make_question(), headers=auth_header(admin_token)
    ).get_json()


# --- unauthenticated: everything is closed --------------------------------

def test_anonymous_cannot_list_questions(client):
    assert client.get("/api/questions").status_code == 401


def test_anonymous_cannot_read_a_question(client, existing_question):
    assert client.get(f"/api/questions/{existing_question['id']}").status_code == 401


def test_anonymous_cannot_create(client):
    assert client.post("/api/questions", json=make_question()).status_code == 401


def test_anonymous_cannot_update(client, existing_question):
    resp = client.patch(
        f"/api/questions/{existing_question['id']}", json={"difficulty": "easy"}
    )
    assert resp.status_code == 401


def test_anonymous_cannot_delete(client, existing_question):
    assert client.delete(f"/api/questions/{existing_question['id']}").status_code == 401


def test_anonymous_gets_401_not_404_for_missing_question(client):
    """Auth is checked before existence, so an anonymous caller cannot probe
    which question ids exist."""
    assert client.get("/api/questions/does-not-exist").status_code == 401


# --- student: reads allowed, writes refused -------------------------------

def test_student_can_list(client, student_token, existing_question):
    resp = client.get("/api/questions", headers=auth_header(student_token))
    assert resp.status_code == 200
    assert resp.get_json()["total"] == 1


def test_student_can_read_one(client, student_token, existing_question):
    resp = client.get(
        f"/api/questions/{existing_question['id']}", headers=auth_header(student_token)
    )
    assert resp.status_code == 200


def test_student_can_filter(client, student_token, existing_question):
    resp = client.get(
        "/api/questions?section=math&domain=algebra", headers=auth_header(student_token)
    )
    assert resp.status_code == 200
    assert resp.get_json()["total"] == 1


def test_student_cannot_create(client, student_token):
    resp = client.post(
        "/api/questions", json=make_question(), headers=auth_header(student_token)
    )
    assert resp.status_code == 403


def test_student_cannot_update(client, student_token, existing_question):
    resp = client.patch(
        f"/api/questions/{existing_question['id']}",
        json={"difficulty": "easy"},
        headers=auth_header(student_token),
    )
    assert resp.status_code == 403


def test_student_cannot_delete(client, student_token, existing_question):
    resp = client.delete(
        f"/api/questions/{existing_question['id']}", headers=auth_header(student_token)
    )
    assert resp.status_code == 403


# --- admin: full access ---------------------------------------------------

def test_admin_can_create(client, admin_token):
    resp = client.post(
        "/api/questions", json=make_question(), headers=auth_header(admin_token)
    )
    assert resp.status_code == 201


def test_admin_can_update(client, admin_token, existing_question):
    resp = client.patch(
        f"/api/questions/{existing_question['id']}",
        json={"difficulty": "easy"},
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 200


def test_admin_can_delete(client, admin_token, existing_question):
    resp = client.delete(
        f"/api/questions/{existing_question['id']}", headers=auth_header(admin_token)
    )
    assert resp.status_code == 204


def test_validation_still_runs_for_admins(client, admin_token):
    """Access control must not short-circuit the Phase 1 taxonomy rules."""
    resp = client.post(
        "/api/questions",
        json=make_question(domain="craft_structure"),
        headers=auth_header(admin_token),
    )
    assert resp.status_code == 422


def test_health_stays_public(client):
    """Railway's health check is unauthenticated."""
    assert client.get("/health").status_code == 200
