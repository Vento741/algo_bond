"""add strategy tables

Revision ID: ddcb3eec09b7
Revises: 31f5db7332c9
Create Date: 2026-03-29 14:53:26.833771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ddcb3eec09b7'
down_revision: Union[str, None] = '31f5db7332c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Применение миграции."""
    op.create_table('strategies',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('slug', sa.String(length=200), nullable=False),
    sa.Column('engine_type', sa.String(length=50), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('author_id', sa.UUID(), nullable=True),
    sa.Column('default_config', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('version', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_strategies_slug'), 'strategies', ['slug'], unique=True)
    op.create_table('strategy_configs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('strategy_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('symbol', sa.String(length=30), nullable=False),
    sa.Column('timeframe', sa.String(length=10), nullable=False),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Откат миграции."""
    op.drop_table('strategy_configs')
    op.drop_index(op.f('ix_strategies_slug'), table_name='strategies')
    op.drop_table('strategies')
