"""Optional schedules, iteration assignment history and schedule snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

TABLES = (
    "project_schedules",
    "schedule_changes",
    "task_iterations",
    "task_iteration_changes",
    "schedule_snapshots",
)


def upgrade() -> None:
    op.create_table(
        "project_schedules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("confirmed_date", sa.Date()),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("member_ids", sa.JSON(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('epic','phase','milestone','iteration')"),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date"
        ),
    )
    op.create_table(
        "schedule_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "schedule_id",
            sa.String(36),
            sa.ForeignKey("project_schedules.id"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "task_iterations",
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("items.id"),
            primary_key=True,
        ),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "iteration_id",
            sa.String(36),
            sa.ForeignKey("project_schedules.id"),
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_table(
        "task_iteration_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "task_id", sa.String(36), sa.ForeignKey("items.id"), nullable=False
        ),
        sa.Column(
            "previous_iteration_id",
            sa.String(36),
            sa.ForeignKey("project_schedules.id"),
        ),
        sa.Column(
            "iteration_id",
            sa.String(36),
            sa.ForeignKey("project_schedules.id"),
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "schedule_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("schedules", sa.JSON(), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for table, column in (
        ("project_schedules", "project_id"),
        ("schedule_changes", "schedule_id"),
        ("task_iterations", "project_id"),
        ("task_iteration_changes", "project_id"),
        ("task_iteration_changes", "task_id"),
        ("schedule_snapshots", "project_id"),
    ):
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for name in reversed(TABLES):
        op.drop_table(name)
