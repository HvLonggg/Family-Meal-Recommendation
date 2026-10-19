"""Store transparent cut-out images uploaded by admins for new recipes.

Revision ID: 0017_admin_recipe_images
Revises: 0016_meal_plan_email_reminders
"""

import sqlalchemy as sa

from alembic import op

revision = "0017_admin_recipe_images"
down_revision = "0016_meal_plan_email_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mon_an", sa.Column("anh_du_lieu", sa.LargeBinary(), nullable=True))
    op.add_column("mon_an", sa.Column("anh_dinh_dang", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("mon_an", "anh_dinh_dang")
    op.drop_column("mon_an", "anh_du_lieu")
