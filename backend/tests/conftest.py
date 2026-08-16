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

    def put(self, *a, **kw):
        return self._call("put", *a, **kw)

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


@pytest.fixture
def student_client(client, db):
    """A client authenticated as an ordinary student."""
    creds = {"email": "fixture-student@example.com", "password": "fixture pass 1"}
    client.post("/api/auth/register", json=creds)
    token = client.post("/api/auth/login", json=creds).get_json()["access_token"]
    return AuthedClient(client, token)


def register_student(client, email, password="fixture pass 1"):
    client.post("/api/auth/register", json={"email": email, "password": password})
    token = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    ).get_json()["access_token"]
    return AuthedClient(client, token)


# A short blueprint: 2 questions per module means a section needs 6 in the
# bank, which keeps the end-to-end attempt tests fast to drive and read.
SHORT_BLUEPRINT = {
    "reading_writing": {"questions_per_module": 2, "time_limit_seconds": 1800},
    "math": {"questions_per_module": 2, "time_limit_seconds": 1800},
}

DOMAINS = {
    "math": ("algebra", "advanced_math", "problem_solving_data_analysis", "geometry_trigonometry"),
    "reading_writing": (
        "information_ideas",
        "craft_structure",
        "expression_of_ideas",
        "standard_english_conventions",
    ),
}


def seed_bank(db, per_difficulty=3):
    """Fills the bank with questions spread over both sections, all four
    domains of each, and every difficulty. Answers are deterministic: the
    correct choice is always 'B', which lets a test answer exactly as many
    questions right as it means to."""
    from app.models import Question

    created = []
    for section, domains in DOMAINS.items():
        for difficulty in ("easy", "medium", "hard"):
            for index in range(per_difficulty):
                domain = domains[index % len(domains)]
                question = Question(
                    section=section,
                    domain=domain,
                    skill=f"{domain} skill",
                    difficulty=difficulty,
                    question_type="multiple_choice",
                    stem=f"{section} / {difficulty} / {index}",
                    choices=[
                        {"id": "A", "text": "wrong"},
                        {"id": "B", "text": "right"},
                        {"id": "C", "text": "wrong"},
                        {"id": "D", "text": "wrong"},
                    ],
                    correct_answer="B",
                    rationale="Because B.",
                    source="self_authored",
                )
                db.session.add(question)
                created.append(question)
    db.session.commit()
    return created


def build_form(db, name="Practice Form A", blueprint=None, seed=7):
    from app.services.form_service import assemble_form

    form, _ = assemble_form(
        name=name, blueprint=blueprint or SHORT_BLUEPRINT, seed=seed
    )
    return form


@pytest.fixture
def form(db):
    """A seeded bank plus one short, playable form."""
    seed_bank(db)
    return build_form(db)
