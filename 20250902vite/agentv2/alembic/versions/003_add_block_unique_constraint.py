"""add unique constraint on blocks(device_id, index)

Revision ID: 003
Revises: 002
Create Date: 2026-03-31

Adds a UNIQUE constraint on (device_id, index) to prevent duplicate block
indexes for the same device, which would corrupt the blockchain's integrity.
SQLite uses CREATE UNIQUE INDEX for this since ALTER TABLE ADD CONSTRAINT
is not supported.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite does not support ALTER TABLE ADD CONSTRAINT, so we use a unique index.
    # op.create_unique_constraint is not supported on SQLite either; use raw SQL.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_blocks_device_index "
        "ON blocks (device_id, \"index\")"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_blocks_device_index")
