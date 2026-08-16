"""create questions table

Revision ID: 0001_create_questions
Revises:
Create Date: 2026-08-16

Written against PostgreSQL types (the deployment target), not the SQLite
local dev fallback.
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_create_questions"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "questions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("section", sa.String(length=20), nullable=False),
        sa.Column("domain", sa.String(length=40), nullable=False),
        sa.Column("skill", sa.String(length=255), nullable=False),
        sa.Column("difficulty", sa.String(length=10), nullable=False),
        sa.Column("question_type", sa.String(length=20), nullable=False),
        sa.Column("stimulus", sa.Text(), nullable=True),
        sa.Column("stem", sa.Text(), nullable=False),
        sa.Column("choices", sa.JSON(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("figure_url", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "question_type != 'multiple_choice' OR choices IS NOT NULL",
            name="ck_multiple_choice_has_choices",
        ),
        sa.CheckConstraint(
            "question_type != 'grid_in' OR choices IS NULL",
            name="ck_grid_in_has_no_choices",
        ),
    )
    op.create_index("ix_questions_section", "questions", ["section"])
    op.create_index("ix_questions_domain", "questions", ["domain"])
    op.create_index("ix_questions_skill", "questions", ["skill"])
    op.create_index("ix_questions_difficulty", "questions", ["difficulty"])
    op.create_index("ix_questions_question_type", "questions", ["question_type"])
    op.create_index(
        "ix_questions_section_domain_difficulty",
        "questions",
        ["section", "domain", "difficulty"],
    )


def downgrade():
    op.drop_index("ix_questions_section_domain_difficulty", table_name="questions")
    op.drop_index("ix_questions_question_type", table_name="questions")
    op.drop_index("ix_questions_difficulty", table_name="questions")
    op.drop_index("ix_questions_skill", table_name="questions")
    op.drop_index("ix_questions_domain", table_name="questions")
    op.drop_index("ix_questions_section", table_name="questions")
    op.drop_table("questions")
