"""Practice-mode history: what a student answered outside a test, and how
long it took them.

Deliberately not part of the attempt or scoring paths. Practice is untimed
self-study; nothing here feeds a scaled score or the adaptive engine, and the
analytics dashboard reports on finished attempts only (see analytics_service).
"""

from app.extensions import db
from app.models import PracticeResponse

# One hour on a single practice question is already implausible. The cap is
# here because the duration is reported by the client, and an unbounded number
# would skew every average built on top of it.
MAX_SECONDS_PER_QUESTION = 3600


def record_practice_response(user, question, answer, is_correct, seconds_spent=None):
    """Appends one graded practice answer.

    Append-only: answering the same question again is a second go at it, not
    an edit of the first. Keeping both is the point - the comparison over time
    is the only reason to store the duration at all.
    """
    entry = PracticeResponse(
        user_id=user.id,
        question_id=question.id,
        answer=answer,
        is_correct=is_correct,
        seconds_spent=min(max(int(seconds_spent or 0), 0), MAX_SECONDS_PER_QUESTION),
    )
    db.session.add(entry)
    db.session.commit()
    return entry


def latest_practice_by_question(user_id, questions):
    """This student's most recent practice answer for each of `questions`.

    Exists so a practice session can be resumed. Leaving the session and coming
    back used to lose every graded answer, because the verdicts only ever lived
    in the browser - the server knew, and was never asked.

    Includes `correct_answer` and `rationale`, which the bank otherwise withholds
    from students. That is not a new leak: both were already shown to this
    student, for these specific questions, at the moment they checked them. What
    stays withheld is every question they have *not* answered, which is the
    thing the test engine actually protects.

    Keyed by question id, newest wins - the table is append-only, so a question
    answered three times has three rows and only the last one is the state to
    restore.
    """
    by_id = {q.id: q for q in questions}
    if not by_id:
        return {}

    rows = (
        PracticeResponse.query.filter(
            PracticeResponse.user_id == user_id,
            PracticeResponse.question_id.in_(list(by_id)),
        )
        .order_by(PracticeResponse.created_at.asc())
        .all()
    )

    history = {}
    for row in rows:
        question = by_id[row.question_id]
        history[row.question_id] = {
            "answer": row.answer,
            "is_correct": row.is_correct,
            "seconds_spent": row.seconds_spent or 0,
            "correct_answer": question.correct_answer,
            "rationale": question.rationale,
        }
    return history
