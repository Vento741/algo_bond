"""add invite_codes access_requests and consent_accepted_at

Revision ID: a1b2c3d4e5f6
Revises: ddcb3eec09b7
Create Date: 2026-04-04 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "ddcb3eec09b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Создать таблицы invite_codes, access_requests и добавить consent_accepted_at."""
    # Enum для статусов заявок
    access_request_status = postgresql.ENUM(
        "pending", "approved", "rejected",
        name="access_request_status",
        create_type=False,
    )
    access_request_status.create(op.get_bind(), checkfirst=True)

    # Таблица invite_codes
    op.create_table(
        "invite_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(8), unique=True, index=True, nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "used_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Таблица access_requests
    op.create_table(
        "access_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram", sa.String(64), index=True, nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="access_request_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "generated_invite_code_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invite_codes.id"),
            nullable=True,
        ),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Добавить consent_accepted_at в users
    op.add_column(
        "users",
        sa.Column("consent_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Откатить: удалить таблицы и колонку."""
    op.drop_column("users", "consent_accepted_at")
    op.drop_table("access_requests")
    op.drop_table("invite_codes")
    op.execute("DROP TYPE IF EXISTS access_request_status")
