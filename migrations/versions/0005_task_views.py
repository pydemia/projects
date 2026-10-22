"""Store personal task views separately from task records."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_views",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint("scope = 'personal'"),
    )
    op.create_index("ix_task_views_project_id", "task_views", ["project_id"])
    op.create_index("ix_task_views_owner_id", "task_views", ["owner_id"])
    op.create_index(
        "uq_task_views_personal_default",
        "task_views",
        ["project_id", "owner_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_index("uq_task_views_personal_default", table_name="task_views")
    op.drop_index("ix_task_views_owner_id", table_name="task_views")
    op.drop_index("ix_task_views_project_id", table_name="task_views")
    op.drop_table("task_views")
