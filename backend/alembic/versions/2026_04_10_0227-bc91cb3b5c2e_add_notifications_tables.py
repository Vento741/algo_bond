"""add_notifications_tables

Revision ID: bc91cb3b5c2e
Revises: c3d4e5f6a7b8
Create Date: 2026-04-10 02:27:32.902360

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'bc91cb3b5c2e'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Применение миграции."""
    op.create_table('notification_preferences',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('positions_enabled', sa.Boolean(), nullable=False),
    sa.Column('bots_enabled', sa.Boolean(), nullable=False),
    sa.Column('orders_enabled', sa.Boolean(), nullable=False),
    sa.Column('backtest_enabled', sa.Boolean(), nullable=False),
    sa.Column('system_enabled', sa.Boolean(), nullable=False),
    sa.Column('billing_enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('notifications',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.Enum('POSITION_OPENED', 'POSITION_CLOSED', 'TP_HIT', 'SL_HIT', 'BOT_STARTED', 'BOT_STOPPED', 'BOT_ERROR', 'BOT_EMERGENCY', 'ORDER_FILLED', 'ORDER_CANCELLED', 'ORDER_ERROR', 'BACKTEST_COMPLETED', 'BACKTEST_FAILED', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'SYSTEM_ERROR', 'SUBSCRIPTION_EXPIRING', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', name='notificationtype'), nullable=False),
    sa.Column('priority', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='notificationpriority'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('message', sa.String(length=500), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('link', sa.String(length=300), nullable=True),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_user_created', 'notifications', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id', 'is_read'], unique=False)


def downgrade() -> None:
    """Откат миграции."""
    op.drop_index('ix_notifications_user_unread', table_name='notifications')
    op.drop_index('ix_notifications_user_created', table_name='notifications')
    op.drop_table('notifications')
    op.drop_table('notification_preferences')
