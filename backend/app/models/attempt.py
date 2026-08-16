import uuid
from datetime import datetime, timedelta, timezone

from app.extensions import db

ATTEMPT_STATUSES = ("in_progress", "submitted", "abandoned")
MODULE_ATTEMPT_STATUSES = ("in_progress", "completed", "expired")


def _utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TestAttempt(db.Model):
    """One student's run at one form. All state that decides what the student
    sees next lives here, server-side — the client only reports answers."""

    __tablename__ = "test_attempts"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    form_id = db.Column(
        db.String(36),
        db.ForeignKey("test_forms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = db.Column(db.String(20), nullable=False, default="in_progress", index=True)

    # Snapshotted at start rather than read from config at routing time, so
    # changing the config mid-attempt cannot alter a test already under way,
    # and so any past routing decision stays explainable from stored data.
    routing_threshold = db.Column(db.Float, nullable=False)

    started_at = db.Column(db.DateTime, nullable=False, default=_utcnow_naive)
    submitted_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User")
    form = db.relationship("TestForm")
    module_attempts = db.relationship(
        "ModuleAttempt",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="ModuleAttempt.order_index",
    )

    __table_args__ = (
        db.CheckConstraint(
            "routing_threshold >= 0 AND routing_threshold <= 1",
            name="ck_attempt_routing_threshold",
        ),
    )

    @property
    def is_open(self):
        return self.status == "in_progress"

    @property
    def current_module_attempt(self):
        for module_attempt in self.module_attempts:
            if module_attempt.status == "in_progress":
                return module_attempt
        return None


class ModuleAttempt(db.Model):
    """A student's pass through one module. Owns the authoritative deadline."""

    __tablename__ = "module_attempts"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id = db.Column(
        db.String(36),
        db.ForeignKey("test_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_id = db.Column(
        db.String(36),
        db.ForeignKey("modules.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # 1..4 across the whole attempt: RW module 1, RW module 2, Math module 1,
    # Math module 2.
    order_index = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="in_progress")

    started_at = db.Column(db.DateTime, nullable=False, default=_utcnow_naive)
    # Computed from started_at + the module's limit at start time. The client
    # never supplies or adjusts this.
    expires_at = db.Column(db.DateTime, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    raw_correct = db.Column(db.Integer, nullable=True)

    # Routing provenance, written when this module attempt is *created* as a
    # module 2. Keeping the inputs makes a routing decision auditable after
    # the fact rather than something only re-derivable by rerunning the code.
    routed_from_raw = db.Column(db.Integer, nullable=True)
    routed_from_total = db.Column(db.Integer, nullable=True)
    routed_ratio = db.Column(db.Float, nullable=True)
    routed_threshold = db.Column(db.Float, nullable=True)

    attempt = db.relationship("TestAttempt", back_populates="module_attempts")
    module = db.relationship("Module")
    responses = db.relationship(
        "AnswerResponse",
        back_populates="module_attempt",
        cascade="all, delete-orphan",
        order_by="AnswerResponse.position",
    )

    __table_args__ = (
        db.UniqueConstraint("attempt_id", "order_index", name="uq_module_attempt_order"),
        db.CheckConstraint(
            "order_index >= 1 AND order_index <= 4", name="ck_module_attempt_order"
        ),
    )

    def seconds_remaining(self, now=None):
        now = now or _utcnow_naive()
        return max(0, int((self.expires_at - now).total_seconds()))

    def is_expired(self, now=None):
        return (now or _utcnow_naive()) >= self.expires_at

    @staticmethod
    def deadline_from(started_at, time_limit_seconds):
        return started_at + timedelta(seconds=time_limit_seconds)


class AnswerResponse(db.Model):
    """One row per delivered question, created up front when the module starts
    so navigation and review flags work before anything is answered."""

    __tablename__ = "answer_responses"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_attempt_id = db.Column(
        db.String(36),
        db.ForeignKey("module_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = db.Column(
        db.String(36),
        db.ForeignKey("questions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    position = db.Column(db.Integer, nullable=False)

    answer = db.Column(db.Text, nullable=True)
    # Graded on submission of the answer, but never serialized to the student
    # until the whole attempt is submitted — see app/schemas/attempt_schema.py.
    is_correct = db.Column(db.Boolean, nullable=True)
    flagged = db.Column(db.Boolean, nullable=False, default=False)
    answered_at = db.Column(db.DateTime, nullable=True)

    module_attempt = db.relationship("ModuleAttempt", back_populates="responses")
    question = db.relationship("Question")

    __table_args__ = (
        db.UniqueConstraint(
            "module_attempt_id", "question_id", name="uq_response_question"
        ),
        db.UniqueConstraint(
            "module_attempt_id", "position", name="uq_response_position"
        ),
    )

    @property
    def is_answered(self):
        return self.answer is not None
