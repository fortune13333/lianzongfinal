"""add scripts and scheduled_tasks tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-30

Adds the `scripts` and `scheduled_tasks` tables introduced in v9.0.
Safe to run on existing databases — uses IF NOT EXISTS semantics.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = inspector.get_table_names()

    if "scripts" not in existing:
        op.create_table(
            "scripts",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("device_type", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index("ix_scripts_id", "scripts", ["id"])

    if "scheduled_tasks" not in existing:
        op.create_table(
            "scheduled_tasks",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("cron_expr", sa.String(), nullable=False),
            sa.Column("task_type", sa.String(), nullable=False),
            sa.Column("device_ids", sa.Text(), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.Column("last_run", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_status", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scheduled_tasks_id", "scheduled_tasks", ["id"])


def downgrade() -> None:
    op.drop_table("scheduled_tasks")
    op.drop_table("scripts")
