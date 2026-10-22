"""Bind organization accounts to the Entra app's immutable OIDC subject."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts", sa.Column("entra_subject", sa.String(255), nullable=True)
    )
    op.create_unique_constraint(
        "uq_accounts_entra_subject", "accounts", ["entra_subject"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_accounts_entra_subject", "accounts", type_="unique")
    op.drop_column("accounts", "entra_subject")
