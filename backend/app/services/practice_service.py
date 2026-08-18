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
