from app.extensions import db
from app.models import AnswerResponse, FormQuestion, Question


def create_question(data: dict) -> Question:
    question = Question(**data)
    db.session.add(question)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return question


def get_question(question_id: str) -> Question | None:
    return db.session.get(Question, question_id)


def update_question(question: Question, data: dict) -> Question:
    for key, value in data.items():
        setattr(question, key, value)
    db.session.commit()
    return question


def question_usage(question: Question) -> dict:
    """Where a question is referenced by the test engine. Both foreign keys are
    ON DELETE RESTRICT, so without this check a delete surfaces as a database
    integrity error rather than an explainable 409."""
    return {
        "forms": (
            db.session.query(FormQuestion)
            .filter_by(question_id=question.id)
            .count()
        ),
        "attempts": (
            db.session.query(AnswerResponse)
            .filter_by(question_id=question.id)
            .count()
        ),
    }


def delete_question(question: Question) -> None:
    db.session.delete(question)
    db.session.commit()


def query_questions(filters: dict, page: int = 1, per_page: int = 50):
    query = Question.query

    for field in ("section", "domain", "skill", "difficulty", "question_type", "source"):
        value = filters.get(field)
        if value:
            query = query.filter(getattr(Question, field) == value)

    query = query.order_by(Question.created_at.desc())
    return query.paginate(page=page, per_page=per_page, error_out=False)
