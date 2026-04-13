"""add_system_settings

Revision ID: a1b2c3d4e5f6
Revises: bc91cb3b5c2e
Create Date: 2026-04-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'bc91cb3b5c2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    # Начальное значение версии
    op.execute(
        "INSERT INTO system_settings (key, value, updated_at) "
        "VALUES ('app_version', '0.9.0', now())"
    )


def downgrade() -> None:
    op.drop_table('system_settings')
