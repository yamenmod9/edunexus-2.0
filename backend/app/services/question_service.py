from app.extensions import db
from app.models import Question


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
