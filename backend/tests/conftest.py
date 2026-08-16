import pytest

from app import create_app
from app.extensions import db as _db


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def db(app):
    return _db


class AuthedClient:
    """Test client that attaches a bearer token to every request, so tests
    about question behaviour don't have to restate auth plumbing. Access
    control itself is covered in test_question_access_control.py."""

    def __init__(self, client, token):
        self._client = client
        self._headers = {"Authorization": f"Bearer {token}"}

    def _call(self, method, *args, **kwargs):
        headers = {**self._headers, **kwargs.pop("headers", {})}
        return getattr(self._client, method)(*args, headers=headers, **kwargs)

    def get(self, *a, **kw):
        return self._call("get", *a, **kw)

    def post(self, *a, **kw):
        return self._call("post", *a, **kw)

    def patch(self, *a, **kw):
        return self._call("patch", *a, **kw)

    def delete(self, *a, **kw):
        return self._call("delete", *a, **kw)


@pytest.fixture
def admin_client(client, db):
    """A client authenticated as an admin — full access to the question bank."""
    from app.models import User

    creds = {"email": "fixture-admin@example.com", "password": "fixture pass 1"}
    client.post("/api/auth/register", json=creds)

    user = db.session.query(User).filter_by(email=creds["email"]).one()
    user.role = "admin"
    db.session.commit()

    token = client.post("/api/auth/login", json=creds).get_json()["access_token"]
    return AuthedClient(client, token)


def make_question(**overrides):
    """A valid multiple-choice math question; override fields per test."""
    question = {
        "section": "math",
        "domain": "algebra",
        "skill": "Linear equations in one variable",
        "difficulty": "medium",
        "question_type": "multiple_choice",
        "stem": "If 3x + 7 = 22, what is the value of x?",
        "choices": [
            {"id": "A", "text": "3"},
            {"id": "B", "text": "5"},
            {"id": "C", "text": "7"},
            {"id": "D", "text": "15"},
        ],
        "correct_answer": "B",
        "source": "self_authored",
    }
    question.update(overrides)
    return question


def make_grid_in(**overrides):
    question = {
        "section": "math",
        "domain": "advanced_math",
        "skill": "Quadratic equations",
        "difficulty": "hard",
        "question_type": "grid_in",
        "stem": "What is the positive solution to x^2 - 9 = 0?",
        "correct_answer": "3",
        "source": "self_authored",
    }
    question.update(overrides)
    return question
