"""Add optional Phase dependencies and close-time outcomes."""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_schedules",
        sa.Column(
            "predecessor_id",
            sa.String(36),
            sa.ForeignKey("project_schedules.id"),
        ),
    )
    op.create_index(
        "ix_project_schedules_predecessor_id",
        "project_schedules",
        ["predecessor_id"],
    )
    for name in ("started_at", "closed_at"):
        op.add_column(
            "project_schedules", sa.Column(name, sa.DateTime(timezone=True))
        )
    op.add_column("project_schedules", sa.Column("phase_results", sa.JSON()))


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM project_schedules WHERE started_at IS NOT NULL OR predecessor_id IS NOT NULL)"
            )
        )
        .scalar()
    ):
        raise RuntimeError("Preserve Phase lifecycle data before downgrade")
    op.drop_index(
        "ix_project_schedules_predecessor_id", table_name="project_schedules"
    )
    for name in ("phase_results", "closed_at", "started_at", "predecessor_id"):
        op.drop_column("project_schedules", name)
