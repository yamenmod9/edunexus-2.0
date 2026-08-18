import uuid
from datetime import datetime, timezone

from app.extensions import db


class PracticeResponse(db.Model):
    """One graded practice-mode answer, with how long it took.

    Separate from `AnswerResponse` on purpose. Practice is not an attempt: it
    has no module, no clock, no routing and no bearing on a scaled score.
    Folding untimed self-study into the table the adaptive engine and the
    scoring service read from would mean every query in those paths has to
    start excluding it, and the first one that forgets quietly corrupts a
    score report.

    Rows are append-only: answering the same question again is a second
    attempt at it, not an edit of the first, and the whole point of storing
    the time is to see whether it came down.
    """

    __tablename__ = "practice_responses"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = db.Column(
        db.String(36),
        db.ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    answer = db.Column(db.Text, nullable=True)
    is_correct = db.Column(db.Boolean, nullable=False)
    # Wall-clock seconds the student had this question open before checking.
    seconds_spent = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    question = db.relationship("Question", lazy="joined")

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"<PracticeResponse {self.question_id} {self.seconds_spent}s>"
