"""initial schema — all tables

Revision ID: 001
Revises:
Create Date: 2026-03-30

Creates all 8 tables that make up ChainTrace v8.5's schema.
Running upgrade() on an existing DB is safe because each CREATE TABLE uses
IF NOT EXISTS semantics (via Alembic's checkfirst=True).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = inspector.get_table_names()

    if "policies" not in existing:
        op.create_table(
            "policies",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("severity", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column("rule", sa.Text(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index("ix_policies_id", "policies", ["id"])

    if "devices" not in existing:
        op.create_table(
            "devices",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("ipAddress", sa.String(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("tags", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_devices_id", "devices", ["id"])

    if "device_policy_association" not in existing:
        op.create_table(
            "device_policy_association",
            sa.Column("device_id", sa.String(), nullable=False),
            sa.Column("policy_id", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["policy_id"], ["policies.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("device_id", "policy_id"),
        )

    if "blocks" not in existing:
        op.create_table(
            "blocks",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("device_id", sa.String(), nullable=False),
            sa.Column("index", sa.Integer(), nullable=False),
            sa.Column("timestamp", sa.String(), nullable=False),
            sa.Column("data", sa.Text(), nullable=False),
            sa.Column("prev_hash", sa.String(), nullable=False),
            sa.Column("hash", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("hash"),
        )
        op.create_index("ix_blocks_hash", "blocks", ["hash"])

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("password", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("extra_permissions", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("username"),
        )
        op.create_index("ix_users_username", "users", ["username"])

    if "audit_log" not in existing:
        op.create_table(
            "audit_log",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if "templates" not in existing:
        op.create_table(
            "templates",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index("ix_templates_id", "templates", ["id"])

    if "settings" not in existing:
        op.create_table(
            "settings",
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("key"),
        )

    if "deployment_history" not in existing:
        op.create_table(
            "deployment_history",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.Column("operator", sa.String(), nullable=False),
            sa.Column("template_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("summary", sa.String(), nullable=False),
            sa.Column("target_devices", sa.Text(), nullable=False),
            sa.Column("results", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if "write_tokens" not in existing:
        op.create_table(
            "write_tokens",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("token_value", sa.String(), nullable=False),
            sa.Column("created_by_admin", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("is_used", sa.Boolean(), nullable=False),
            sa.Column("used_by", sa.String(), nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("used_on_device", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_value"),
        )
        op.create_index("ix_write_tokens_token_value", "write_tokens", ["token_value"])

    # Idempotent column addition for devices.tags (handles pre-Alembic databases)
    existing_columns = [c["name"] for c in inspector.get_columns("devices")] if "devices" in inspector.get_table_names() else []
    if "tags" not in existing_columns:
        with op.batch_alter_table("devices") as batch_op:
            batch_op.add_column(sa.Column("tags", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_table("write_tokens")
    op.drop_table("deployment_history")
    op.drop_table("settings")
    op.drop_table("templates")
    op.drop_table("audit_log")
    op.drop_table("users")
    op.drop_table("blocks")
    op.drop_table("device_policy_association")
    op.drop_table("devices")
    op.drop_table("policies")
