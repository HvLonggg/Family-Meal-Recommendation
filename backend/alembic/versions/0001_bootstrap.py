"""Khởi tạo chuỗi migration của dự án.

Revision ID: 0001_bootstrap
Revises:
Create Date: 2026-09-27
"""

from collections.abc import Sequence

revision: str = "0001_bootstrap"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
