"""add topology_links table

Revision ID: 003
Revises: 002
Create Date: 2026-03-31

Adds the `topology_links` table for network topology discovery results.
Safe to run on existing databases — uses IF NOT EXISTS semantics.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = inspector.get_table_names()

    if "topology_links" not in existing:
        op.create_table(
            "topology_links",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("source_device_id", sa.String(), nullable=False),
            sa.Column("source_port", sa.String(), nullable=True),
            sa.Column("target_device_id", sa.String(), nullable=False),
            sa.Column("target_port", sa.String(), nullable=True),
            sa.Column("target_ip", sa.String(), nullable=True),
            sa.Column("target_platform", sa.String(), nullable=True),
            sa.Column("protocol", sa.String(), nullable=False, server_default="cdp"),
            sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_topology_links_source", "topology_links", ["source_device_id"])


def downgrade() -> None:
    op.drop_index("ix_topology_links_source", table_name="topology_links")
    op.drop_table("topology_links")
