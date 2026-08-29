from sqlalchemy import and_, func

from app.extensions import db
from app.models import AnswerResponse, FormQuestion, PracticeResponse, Question


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


FILTER_FIELDS = ("section", "domain", "skill", "difficulty", "question_type", "source")


def _apply_filters(query, filters: dict):
    """Narrows `query` by whichever filters are set.

    A filter may be a single value or a list of them. A list becomes an IN,
    which is what lets a student practise several categories at once - "give me
    Algebra and Geometry together" is one pool, not two sessions.

    Values within a field are OR'd; different fields are AND'd. So Algebra plus
    Geometry plus hard means hard questions from either domain, which is what
    picking those three controls looks like it should do.
    """
    for field in FILTER_FIELDS:
        value = filters.get(field)
        if not value:
            continue
        column = getattr(Question, field)
        if isinstance(value, (list, tuple, set)):
            values = [v for v in value if v]
            if not values:
                continue
            query = query.filter(column.in_(values)) if len(values) > 1 else query.filter(
                column == values[0]
            )
        else:
            query = query.filter(column == value)
    return query


def query_questions(filters: dict, page: int = 1, per_page: int = 50):
    query = _apply_filters(Question.query, filters)
    query = query.order_by(Question.created_at.desc())
    return query.paginate(page=page, per_page=per_page, error_out=False)


def count_by_category(filters: dict, user_id=None):
    """How many questions sit under each section, domain and skill, and how
    many of them this student has already answered.

    Aggregated in SQL rather than by reading the rows and counting in Python.
    The practice browser calls this on every filter change, and the bank is
    hundreds of questions - pulling every matching row back to count it is a
    cost paid per keystroke for a result that is a few dozen numbers.

    `COUNT(DISTINCT ...)` on both sides is load-bearing. The outer join fans a
    question out into one row per practice attempt, so counting `questions.id`
    plainly would inflate the total; and `practice_responses` is append-only,
    so counting its rows would report a question answered three times as three
    questions solved.
    """
    solved_column = (
        func.count(func.distinct(PracticeResponse.question_id))
        if user_id is not None
        else func.count(func.distinct(Question.id)) * 0
    )

    query = db.session.query(
        Question.section,
        Question.domain,
        Question.skill,
        func.count(func.distinct(Question.id)),
        solved_column,
    )
    if user_id is not None:
        query = query.outerjoin(
            PracticeResponse,
            and_(
                PracticeResponse.question_id == Question.id,
                PracticeResponse.user_id == user_id,
            ),
        )

    rows = (
        _apply_filters(query, filters)
        .group_by(Question.section, Question.domain, Question.skill)
        .all()
    )

    sections: dict = {}
    for section, domain, skill, total, solved in rows:
        s = sections.setdefault(section, {"total": 0, "solved": 0, "domains": {}})
        d = s["domains"].setdefault(domain, {"total": 0, "solved": 0, "skills": {}})
        d["skills"][skill] = {"total": total, "solved": solved}
        for bucket in (s, d):
            bucket["total"] += total
            bucket["solved"] += solved

    return {
        "total": sum(s["total"] for s in sections.values()),
        "solved": sum(s["solved"] for s in sections.values()),
        "sections": sections,
    }
