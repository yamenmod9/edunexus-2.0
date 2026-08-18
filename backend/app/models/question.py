import uuid
from datetime import datetime, timezone

from app.extensions import db

SECTIONS = ("math", "reading_writing")

DOMAINS_BY_SECTION = {
    "math": (
        "algebra",
        "advanced_math",
        "problem_solving_data_analysis",
        "geometry_trigonometry",
    ),
    "reading_writing": (
        "information_ideas",
        "craft_structure",
        "expression_of_ideas",
        "standard_english_conventions",
    ),
}

# The display name for every taxonomy value whose title-cased form is wrong.
#
# CLAUDE.md section 5 fixes these names exactly - "Problem-Solving & Data
# Analysis", not "Problem Solving Data Analysis" - because they are what a
# student reads on the score report and what the analytics group by. Deriving
# them by title-casing the enum silently drops every ampersand and hyphen, so
# the exceptions live here, once, and the clients mirror this map.
DISPLAY_NAMES = {
    "reading_writing": "Reading & Writing",
    "advanced_math": "Advanced Math",
    "problem_solving_data_analysis": "Problem-Solving & Data Analysis",
    "geometry_trigonometry": "Geometry & Trigonometry",
    "information_ideas": "Information & Ideas",
    "craft_structure": "Craft & Structure",
    "expression_of_ideas": "Expression of Ideas",
    "standard_english_conventions": "Standard English Conventions",
    "official_qb": "Official QB",
}


def display_name(value):
    """The human-facing name for a taxonomy value."""
    if not value:
        return ""
    return DISPLAY_NAMES.get(value) or value.replace("_", " ").title()


DIFFICULTIES = ("easy", "medium", "hard")
QUESTION_TYPES = ("multiple_choice", "grid_in")
SOURCES = ("official_qb", "self_authored", "other")


class Question(db.Model):
    __tablename__ = "questions"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Indexed: these are the adaptive engine's pooling keys (Phase 3) and the
    # question-bank filter set, so every hot query filters on them.
    section = db.Column(db.String(20), nullable=False, index=True)
    domain = db.Column(db.String(40), nullable=False, index=True)
    skill = db.Column(db.String(255), nullable=False, index=True)
    difficulty = db.Column(db.String(10), nullable=False, index=True)
    question_type = db.Column(db.String(20), nullable=False, index=True)

    stimulus = db.Column(db.Text, nullable=True)
    stem = db.Column(db.Text, nullable=False)
    # none_as_null: without it SQLAlchemy stores Python None as JSON 'null'
    # rather than SQL NULL, which makes the grid-in check constraint below fail.
    choices = db.Column(db.JSON(none_as_null=True), nullable=True)
    correct_answer = db.Column(db.Text, nullable=False)
    rationale = db.Column(db.Text, nullable=True)
    figure_url = db.Column(db.String(500), nullable=True)

    source = db.Column(db.String(20), nullable=False, default="self_authored")
    external_id = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # Composite index for the most common pooling query: pick questions of a
        # given difficulty within a section+domain.
        db.Index("ix_questions_section_domain_difficulty", "section", "domain", "difficulty"),
        db.CheckConstraint(
            "question_type != 'multiple_choice' OR choices IS NOT NULL",
            name="ck_multiple_choice_has_choices",
        ),
        db.CheckConstraint(
            "question_type != 'grid_in' OR choices IS NULL",
            name="ck_grid_in_has_no_choices",
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "section": self.section,
            "domain": self.domain,
            "skill": self.skill,
            "difficulty": self.difficulty,
            "question_type": self.question_type,
            "stimulus": self.stimulus,
            "stem": self.stem,
            "choices": self.choices,
            "correct_answer": self.correct_answer,
            "rationale": self.rationale,
            "figure_url": self.figure_url,
            "source": self.source,
            "external_id": self.external_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
