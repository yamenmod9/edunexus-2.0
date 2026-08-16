"""add scale_table_id to test_attempts

Nullable on purpose: attempts created before Phase 4 have no snapshot, and
scoring falls back to the current default table for those rather than
refusing to produce a report.

Revision ID: 0004_scale_table
Revises: 0003_test_engine
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_scale_table"
down_revision = "0003_test_engine"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "test_attempts",
        sa.Column("scale_table_id", sa.String(length=64), nullable=True),
    )


def downgrade():
    op.drop_column("test_attempts", "scale_table_id")
