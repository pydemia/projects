"""Atomic Assistant integration operation receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("principal_id", sa.String(200), nullable=False),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("operation_id", sa.String(36), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("request_method", sa.String(10), nullable=False),
        sa.Column("request_path", sa.Text(), nullable=False),
        sa.Column("request_body_sha256", sa.String(64), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "task_id", sa.String(36), sa.ForeignKey("items.id"), nullable=False
        ),
        sa.Column("receipt", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("principal_id", "operation_id"),
    )


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM assistant_operations"))
        .scalar()
    ):
        raise RuntimeError(
            "Preserve Assistant operation receipts before downgrade"
        )
    op.drop_table("assistant_operations")
