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
