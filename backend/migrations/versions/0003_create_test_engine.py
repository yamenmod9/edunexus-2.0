"""create adaptive test engine tables

Revision ID: 0003_test_engine
Revises: 0002_create_users
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_test_engine"
down_revision = "0002_create_users"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "test_forms",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_test_forms_is_active", "test_forms", ["is_active"])

    op.create_table(
        "modules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("form_id", sa.String(length=36), nullable=False),
        sa.Column("section", sa.String(length=20), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("variant", sa.String(length=10), nullable=False),
        sa.Column("time_limit_seconds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["form_id"], ["test_forms.id"], name="fk_modules_form_id", ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "form_id", "section", "sequence", "variant", name="uq_module_slot"
        ),
        sa.CheckConstraint("sequence IN (1, 2)", name="ck_module_sequence"),
        sa.CheckConstraint(
            "(sequence = 1 AND variant = 'standard')"
            " OR (sequence = 2 AND variant IN ('easy', 'hard'))",
            name="ck_module_variant_matches_sequence",
        ),
        sa.CheckConstraint("time_limit_seconds > 0", name="ck_module_time_limit"),
    )
    op.create_index("ix_modules_form_id", "modules", ["form_id"])

    op.create_table(
        "form_questions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("module_id", sa.String(length=36), nullable=False),
        sa.Column("question_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["module_id"],
            ["modules.id"],
            name="fk_form_questions_module_id",
            ondelete="CASCADE",
        ),
        # RESTRICT: deleting a question a form depends on would silently
        # shorten every attempt already taken on that form.
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_form_questions_question_id",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("module_id", "position", name="uq_form_question_position"),
        sa.UniqueConstraint("module_id", "question_id", name="uq_form_question_unique"),
        sa.CheckConstraint("position > 0", name="ck_form_question_position"),
    )
    op.create_index("ix_form_questions_module_id", "form_questions", ["module_id"])
    op.create_index("ix_form_questions_question_id", "form_questions", ["question_id"])

    op.create_table(
        "test_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("form_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("routing_threshold", sa.Float(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_test_attempts_user_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["form_id"],
            ["test_forms.id"],
            name="fk_test_attempts_form_id",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "routing_threshold >= 0 AND routing_threshold <= 1",
            name="ck_attempt_routing_threshold",
        ),
    )
    op.create_index("ix_test_attempts_user_id", "test_attempts", ["user_id"])
    op.create_index("ix_test_attempts_form_id", "test_attempts", ["form_id"])
    op.create_index("ix_test_attempts_status", "test_attempts", ["status"])

    op.create_table(
        "module_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("attempt_id", sa.String(length=36), nullable=False),
        sa.Column("module_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("raw_correct", sa.Integer(), nullable=True),
        sa.Column("routed_from_raw", sa.Integer(), nullable=True),
        sa.Column("routed_from_total", sa.Integer(), nullable=True),
        sa.Column("routed_ratio", sa.Float(), nullable=True),
        sa.Column("routed_threshold", sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["test_attempts.id"],
            name="fk_module_attempts_attempt_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["module_id"],
            ["modules.id"],
            name="fk_module_attempts_module_id",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("attempt_id", "order_index", name="uq_module_attempt_order"),
        sa.CheckConstraint(
            "order_index >= 1 AND order_index <= 4", name="ck_module_attempt_order"
        ),
    )
    op.create_index("ix_module_attempts_attempt_id", "module_attempts", ["attempt_id"])
    op.create_index("ix_module_attempts_module_id", "module_attempts", ["module_id"])

    op.create_table(
        "answer_responses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("module_attempt_id", sa.String(length=36), nullable=False),
        sa.Column("question_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("flagged", sa.Boolean(), nullable=False),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["module_attempt_id"],
            ["module_attempts.id"],
            name="fk_answer_responses_module_attempt_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_answer_responses_question_id",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "module_attempt_id", "question_id", name="uq_response_question"
        ),
        sa.UniqueConstraint(
            "module_attempt_id", "position", name="uq_response_position"
        ),
    )
    op.create_index(
        "ix_answer_responses_module_attempt_id", "answer_responses", ["module_attempt_id"]
    )
    op.create_index(
        "ix_answer_responses_question_id", "answer_responses", ["question_id"]
    )


def downgrade():
    op.drop_index("ix_answer_responses_question_id", table_name="answer_responses")
    op.drop_index(
        "ix_answer_responses_module_attempt_id", table_name="answer_responses"
    )
    op.drop_table("answer_responses")

    op.drop_index("ix_module_attempts_module_id", table_name="module_attempts")
    op.drop_index("ix_module_attempts_attempt_id", table_name="module_attempts")
    op.drop_table("module_attempts")

    op.drop_index("ix_test_attempts_status", table_name="test_attempts")
    op.drop_index("ix_test_attempts_form_id", table_name="test_attempts")
    op.drop_index("ix_test_attempts_user_id", table_name="test_attempts")
    op.drop_table("test_attempts")

    op.drop_index("ix_form_questions_question_id", table_name="form_questions")
    op.drop_index("ix_form_questions_module_id", table_name="form_questions")
    op.drop_table("form_questions")

    op.drop_index("ix_modules_form_id", table_name="modules")
    op.drop_table("modules")

    op.drop_index("ix_test_forms_is_active", table_name="test_forms")
    op.drop_table("test_forms")
