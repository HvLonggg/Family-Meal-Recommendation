"""Remember the last week a user was sent the weekly meal-planning reminder email.

Revision ID: 0024_weekly_reminder_week
Revises: 0023_user_terms_consent
"""

import sqlalchemy as sa

from alembic import op

revision = "0024_weekly_reminder_week"
down_revision = "0023_user_terms_consent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("weekly_reminder_week", sa.Date()))


def downgrade() -> None:
    op.drop_column("users", "weekly_reminder_week")
