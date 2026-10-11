"""Thêm lịch sử mâm cơm đã lưu của người dùng.

Revision ID: 0004_saved_meals
Revises: 0003_recipe_platform
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_saved_meals"
down_revision: str | Sequence[str] | None = "0003_recipe_platform"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mam_com_da_luu",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nguoi_dung_id", sa.Uuid(), nullable=False),
        sa.Column("tieu_chuan", sa.String(length=24), nullable=False),
        sa.Column("ma_mon_an", sa.JSON(), nullable=False),
        sa.Column(
            "ngay_tao", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["nguoi_dung_id"],
            ["users.id"],
            name=op.f("fk_mam_com_da_luu_nguoi_dung_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mam_com_da_luu")),
    )
    op.create_index(
        op.f("ix_mam_com_da_luu_nguoi_dung_id"),
        "mam_com_da_luu",
        ["nguoi_dung_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mam_com_da_luu_tieu_chuan"),
        "mam_com_da_luu",
        ["tieu_chuan"],
        unique=False,
    )
    op.create_index(
        op.f("ix_mam_com_da_luu_ngay_tao"),
        "mam_com_da_luu",
        ["ngay_tao"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_mam_com_da_luu_ngay_tao"), table_name="mam_com_da_luu")
    op.drop_index(op.f("ix_mam_com_da_luu_tieu_chuan"), table_name="mam_com_da_luu")
    op.drop_index(op.f("ix_mam_com_da_luu_nguoi_dung_id"), table_name="mam_com_da_luu")
    op.drop_table("mam_com_da_luu")
