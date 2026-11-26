"""Retain immutable Entra object evidence beside legacy subject bindings."""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entra_object_identities",
        sa.Column("tenant_id", sa.String(36), primary_key=True),
        sa.Column("object_id", sa.String(36), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "account_id", name="uq_entra_object_identity_account"
        ),
    )


def downgrade() -> None:
    op.drop_table("entra_object_identities")
