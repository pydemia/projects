"""Planning drafts are separate from live work until atomic application."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "planning_drafts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("intent", sa.Text(), nullable=False),
        sa.Column("references", sa.JSON(), nullable=False),
        sa.Column("proposals", sa.JSON(), nullable=False),
        sa.Column(
            "source_run_id", sa.String(36), sa.ForeignKey("skill_runs.id")
        ),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0"),
        sa.CheckConstraint("status IN ('draft','cancelled','applied')"),
        sa.CheckConstraint("mode IN ('initial','incremental')"),
    )
    op.create_index(
        "ix_planning_drafts_project_id", "planning_drafts", ["project_id"]
    )
    op.create_index(
        "ix_planning_drafts_actor_id", "planning_drafts", ["actor_id"]
    )
    op.create_table(
        "planning_applications",
        sa.Column("operation_id", sa.String(100), primary_key=True),
        sa.Column(
            "draft_id",
            sa.String(36),
            sa.ForeignKey("planning_drafts.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("receipt", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("planning_applications")
    op.drop_table("planning_drafts")
