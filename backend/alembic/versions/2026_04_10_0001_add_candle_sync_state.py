"""add candle_sync_state

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-10 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "candle_sync_state",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=30), nullable=False),
        sa.Column("timeframe", sa.String(length=10), nullable=False),
        sa.Column("oldest_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("newest_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("backfill_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("backfill_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("backfill_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sync_symbol_tf", "candle_sync_state", ["symbol", "timeframe"], unique=True
    )

    # Covering index для быстрой выборки свечей по symbol+timeframe+open_time
    op.create_index(
        "ix_ohlcv_range_cover",
        "ohlcv_candles",
        ["symbol", "timeframe", sa.text("open_time DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_ohlcv_range_cover", table_name="ohlcv_candles")
    op.drop_index("ix_sync_symbol_tf", table_name="candle_sync_state")
    op.drop_table("candle_sync_state")
