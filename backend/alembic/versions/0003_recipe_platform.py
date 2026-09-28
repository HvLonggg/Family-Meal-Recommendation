"""Thêm nền tảng món ăn, nguyên liệu và bước nấu bằng tiếng Việt.

Revision ID: 0003_recipe_platform
Revises: 0002_authentication
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_recipe_platform"
down_revision: str | Sequence[str] | None = "0002_authentication"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mon_an",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("duong_dan", sa.String(length=180), nullable=False),
        sa.Column("ten", sa.String(length=180), nullable=False),
        sa.Column("mo_ta_ngan", sa.Text(), nullable=False),
        sa.Column("vung_mien", sa.String(length=32), nullable=False),
        sa.Column("loai_mon", sa.String(length=48), nullable=False),
        sa.Column("do_kho", sa.String(length=24), nullable=False),
        sa.Column("phut_so_che", sa.Integer(), nullable=False),
        sa.Column("phut_nau", sa.Integer(), nullable=False),
        sa.Column("khau_phan_goc", sa.Integer(), nullable=False),
        sa.Column("duong_dan_anh", sa.String(length=500), nullable=False),
        sa.Column("mo_ta_anh", sa.String(length=300), nullable=False),
        sa.Column("cach_dung", sa.Text(), nullable=False),
        sa.Column("mach_nho", sa.Text(), nullable=False),
        sa.Column("ten_nguon", sa.String(length=120), nullable=False),
        sa.Column("duong_dan_nguon", sa.String(length=500), nullable=False),
        sa.Column("trang_thai", sa.String(length=24), nullable=False),
        sa.Column(
            "ngay_tao", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "ngay_cap_nhat",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mon_an")),
        sa.UniqueConstraint("duong_dan", name=op.f("uq_mon_an_duong_dan")),
    )
    op.create_index(op.f("ix_mon_an_duong_dan"), "mon_an", ["duong_dan"], unique=False)
    op.create_index(op.f("ix_mon_an_ten"), "mon_an", ["ten"], unique=False)
    op.create_index(op.f("ix_mon_an_vung_mien"), "mon_an", ["vung_mien"], unique=False)
    op.create_index(op.f("ix_mon_an_loai_mon"), "mon_an", ["loai_mon"], unique=False)
    op.create_index(op.f("ix_mon_an_do_kho"), "mon_an", ["do_kho"], unique=False)
    op.create_index(op.f("ix_mon_an_trang_thai"), "mon_an", ["trang_thai"], unique=False)

    op.create_table(
        "nguyen_lieu_mon_an",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mon_an_id", sa.Uuid(), nullable=False),
        sa.Column("nhom_nguyen_lieu", sa.String(length=120), nullable=False),
        sa.Column("ten_nguyen_lieu", sa.String(length=180), nullable=False),
        sa.Column("so_luong", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("don_vi", sa.String(length=60), nullable=False),
        sa.Column("ghi_chu", sa.String(length=300), nullable=True),
        sa.Column("co_the_dieu_chinh", sa.Boolean(), nullable=False),
        sa.Column("thu_tu", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["mon_an_id"],
            ["mon_an.id"],
            name=op.f("fk_nguyen_lieu_mon_an_mon_an_id_mon_an"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_nguyen_lieu_mon_an")),
    )
    op.create_index(
        op.f("ix_nguyen_lieu_mon_an_mon_an_id"),
        "nguyen_lieu_mon_an",
        ["mon_an_id"],
        unique=False,
    )

    op.create_table(
        "buoc_nau_mon_an",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mon_an_id", sa.Uuid(), nullable=False),
        sa.Column("loai_buoc", sa.String(length=24), nullable=False),
        sa.Column("noi_dung", sa.Text(), nullable=False),
        sa.Column("thu_tu", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["mon_an_id"],
            ["mon_an.id"],
            name=op.f("fk_buoc_nau_mon_an_mon_an_id_mon_an"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_buoc_nau_mon_an")),
    )
    op.create_index(
        op.f("ix_buoc_nau_mon_an_mon_an_id"),
        "buoc_nau_mon_an",
        ["mon_an_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_buoc_nau_mon_an_loai_buoc"),
        "buoc_nau_mon_an",
        ["loai_buoc"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_buoc_nau_mon_an_loai_buoc"), table_name="buoc_nau_mon_an")
    op.drop_index(op.f("ix_buoc_nau_mon_an_mon_an_id"), table_name="buoc_nau_mon_an")
    op.drop_table("buoc_nau_mon_an")
    op.drop_index(
        op.f("ix_nguyen_lieu_mon_an_mon_an_id"), table_name="nguyen_lieu_mon_an"
    )
    op.drop_table("nguyen_lieu_mon_an")
    op.drop_index(op.f("ix_mon_an_trang_thai"), table_name="mon_an")
    op.drop_index(op.f("ix_mon_an_do_kho"), table_name="mon_an")
    op.drop_index(op.f("ix_mon_an_loai_mon"), table_name="mon_an")
    op.drop_index(op.f("ix_mon_an_vung_mien"), table_name="mon_an")
    op.drop_index(op.f("ix_mon_an_ten"), table_name="mon_an")
    op.drop_index(op.f("ix_mon_an_duong_dan"), table_name="mon_an")
    op.drop_table("mon_an")
