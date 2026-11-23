"""Namespace immutable Entra subjects by their verified issuer tenant."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entra_identities",
        sa.Column("tenant_id", sa.String(36), primary_key=True),
        sa.Column("subject", sa.String(255), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.UniqueConstraint("account_id", name="uq_entra_identity_account"),
    )


def downgrade() -> None:
    op.drop_table("entra_identities")
