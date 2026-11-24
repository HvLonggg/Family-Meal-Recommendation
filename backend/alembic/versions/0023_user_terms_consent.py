"""Record when and which version of the Terms/Privacy Policy each user accepted.

Revision ID: 0023_user_terms_consent
Revises: 0022_cooking_logs_timers
"""

import sqlalchemy as sa

from alembic import op

revision = "0023_user_terms_consent"
down_revision = "0022_cooking_logs_timers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("terms_version", sa.String(length=16)))


def downgrade() -> None:
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
