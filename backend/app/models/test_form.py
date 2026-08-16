import uuid
from datetime import datetime, timezone

from app.extensions import db

# The Digital SAT is delivered Reading & Writing first, then Math. Attempt
# ordering depends on this tuple, so it is the single source of truth.
SECTION_ORDER = ("reading_writing", "math")

# Module 1 is identical for everyone ("standard"); module 2 comes in two
# variants and the routing service picks one.
MODULE_1_VARIANT = "standard"
MODULE_2_VARIANTS = ("easy", "hard")
VARIANTS = (MODULE_1_VARIANT,) + MODULE_2_VARIANTS

MODULES_PER_SECTION = 2
MODULES_PER_ATTEMPT = len(SECTION_ORDER) * MODULES_PER_SECTION


def _utcnow_naive():
    """Naive UTC — matches the DateTime columns used across this codebase."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TestForm(db.Model):
    """A fixed, pre-assembled test. Holds six modules: one module 1 and two
    module-2 variants per section. An attempt walks four of them."""

    __tablename__ = "test_forms"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    created_at = db.Column(db.DateTime, default=_utcnow_naive)
    updated_at = db.Column(db.DateTime, default=_utcnow_naive, onupdate=_utcnow_naive)

    modules = db.relationship(
        "Module",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="Module.section, Module.sequence, Module.variant",
    )

    def module_for(self, section, sequence, variant):
        for module in self.modules:
            if (
                module.section == section
                and module.sequence == sequence
                and module.variant == variant
            ):
                return module
        return None

    def is_complete(self):
        """A form is usable only if every module an attempt could need exists
        and is non-empty. Assembly guarantees this; this guards against a form
        left half-built by a failed run."""
        for section in SECTION_ORDER:
            required = [(1, MODULE_1_VARIANT)] + [(2, v) for v in MODULE_2_VARIANTS]
            for sequence, variant in required:
                module = self.module_for(section, sequence, variant)
                if module is None or not module.form_questions:
                    return False
        return True

    def to_dict(self, include_variants=True):
        payload = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_variants:
            payload["modules"] = [m.to_dict() for m in self.modules]
        else:
            # Students are told how long each section's modules run and how
            # many questions they hold, but not which variants exist — the
            # variant they receive would otherwise disclose their module 1
            # performance before the score report.
            payload["sections"] = [
                self._section_summary(section) for section in SECTION_ORDER
            ]
        return payload

    def _section_summary(self, section):
        """One entry per module *slot*, collapsing the two module-2 variants
        into a single line — they have identical length and timing."""
        summary = {}
        for module in self.modules:
            if module.section != section:
                continue
            summary.setdefault(
                module.sequence,
                {
                    "sequence": module.sequence,
                    "question_count": module.question_count,
                    "time_limit_seconds": module.time_limit_seconds,
                },
            )
        return {"section": section, "modules": [summary[k] for k in sorted(summary)]}


class Module(db.Model):
    __tablename__ = "modules"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    form_id = db.Column(
        db.String(36),
        db.ForeignKey("test_forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section = db.Column(db.String(20), nullable=False)
    sequence = db.Column(db.Integer, nullable=False)  # 1 or 2
    variant = db.Column(db.String(10), nullable=False)  # standard | easy | hard
    time_limit_seconds = db.Column(db.Integer, nullable=False)

    created_at = db.Column(db.DateTime, default=_utcnow_naive)

    form = db.relationship("TestForm", back_populates="modules")
    form_questions = db.relationship(
        "FormQuestion",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="FormQuestion.position",
    )

    __table_args__ = (
        db.UniqueConstraint(
            "form_id", "section", "sequence", "variant", name="uq_module_slot"
        ),
        db.CheckConstraint("sequence IN (1, 2)", name="ck_module_sequence"),
        # Module 1 is never a variant, and module 2 is never "standard" —
        # enforced here so a bad insert can't create an unroutable form.
        db.CheckConstraint(
            "(sequence = 1 AND variant = 'standard')"
            " OR (sequence = 2 AND variant IN ('easy', 'hard'))",
            name="ck_module_variant_matches_sequence",
        ),
        db.CheckConstraint("time_limit_seconds > 0", name="ck_module_time_limit"),
    )

    @property
    def question_count(self):
        return len(self.form_questions)

    def to_dict(self):
        return {
            "id": self.id,
            "section": self.section,
            "sequence": self.sequence,
            "variant": self.variant,
            "time_limit_seconds": self.time_limit_seconds,
            "question_count": self.question_count,
        }


class FormQuestion(db.Model):
    """Ordered membership of a question in a module."""

    __tablename__ = "form_questions"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id = db.Column(
        db.String(36),
        db.ForeignKey("modules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id = db.Column(
        db.String(36),
        # RESTRICT, not CASCADE: deleting a question that a form depends on
        # would silently shorten every attempt taken on that form.
        db.ForeignKey("questions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    position = db.Column(db.Integer, nullable=False)

    module = db.relationship("Module", back_populates="form_questions")
    question = db.relationship("Question")

    __table_args__ = (
        db.UniqueConstraint("module_id", "position", name="uq_form_question_position"),
        db.UniqueConstraint("module_id", "question_id", name="uq_form_question_unique"),
        db.CheckConstraint("position > 0", name="ck_form_question_position"),
    )
