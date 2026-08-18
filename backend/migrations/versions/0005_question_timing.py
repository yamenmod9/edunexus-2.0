"""per-question timing and annotations

Two things, both about what a student does inside a single question.

`answer_responses.seconds_spent` accumulates how long a test question was open
across visits, and `annotations` holds Bluebook-style highlights and margin
notes. Both are non-null-safe additions: existing rows get 0 and NULL, which
read as "no timing recorded" and "nothing annotated" rather than as data.

`practice_responses` is a new table rather than more columns on
`answer_responses`, because practice is not an attempt - no module, no clock,
no routing, no bearing on a scaled score. See app/services/practice_service.py.

Revision ID: 0005_question_timing
Revises: 0004_scale_table
Create Date: 2026-08-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_question_timing"
down_revision = "0004_scale_table"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "answer_responses",
        sa.Column(
            "seconds_spent",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "answer_responses",
        sa.Column("annotations", sa.JSON(), nullable=True),
    )

    op.create_table(
        "practice_responses",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            sa.String(length=36),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("seconds_spent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_practice_responses_user_id", "practice_responses", ["user_id"]
    )
    op.create_index(
        "ix_practice_responses_question_id", "practice_responses", ["question_id"]
    )


def downgrade():
    op.drop_index("ix_practice_responses_question_id", table_name="practice_responses")
    op.drop_index("ix_practice_responses_user_id", table_name="practice_responses")
    op.drop_table("practice_responses")
    op.drop_column("answer_responses", "annotations")
    op.drop_column("answer_responses", "seconds_spent")
