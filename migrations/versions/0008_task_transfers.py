"""Global personal views and durable atomic project transfers."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_archive_references",
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            primary_key=True,
        ),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.alter_column("task_views", "project_id", nullable=True)
    op.add_column(
        "task_views",
        sa.Column(
            "scope_type",
            sa.String(20),
            nullable=False,
            server_default="project",
        ),
    )
    op.create_check_constraint(
        "ck_task_views_scope_type",
        "task_views",
        "(scope_type = 'global' AND project_id IS NULL) OR (scope_type = 'project' AND project_id IS NOT NULL)",
    )
    for constraint in sa.inspect(op.get_bind()).get_foreign_keys("links"):
        if len(constraint["constrained_columns"]) == 2:
            op.drop_constraint(constraint["name"], "links", type_="foreignkey")
    op.create_foreign_key(
        "fk_links_source_item", "links", "items", ["source_id"], ["id"]
    )
    op.create_foreign_key(
        "fk_links_target_item", "links", "items", ["target_id"], ["id"]
    )
    op.create_table(
        "task_transfers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("operation_id", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "operation_id"),
    )


def downgrade() -> None:
    connection = op.get_bind()
    if any(
        connection.execute(sa.text(statement)).scalar()
        for statement in (
            "SELECT count(*) FROM task_transfers",
            "SELECT count(*) FROM project_archive_references",
            "SELECT count(*) FROM task_views WHERE scope_type = 'global'",
        )
    ):
        raise RuntimeError(
            "이동 이력·외부 참조·전역 보기를 보존한 후 이전 schema로 복원해야 합니다."
        )
    op.drop_table("project_archive_references")
    op.drop_table("task_transfers")
    op.drop_constraint("fk_links_source_item", "links", type_="foreignkey")
    op.drop_constraint("fk_links_target_item", "links", type_="foreignkey")
    op.create_foreign_key(
        "links_project_id_source_id_fkey",
        "links",
        "items",
        ["project_id", "source_id"],
        ["project_id", "id"],
    )
    op.create_foreign_key(
        "links_project_id_target_id_fkey",
        "links",
        "items",
        ["project_id", "target_id"],
        ["project_id", "id"],
    )
    op.execute("DELETE FROM task_views WHERE scope_type = 'global'")
    op.drop_constraint("ck_task_views_scope_type", "task_views")
    op.drop_column("task_views", "scope_type")
    op.alter_column("task_views", "project_id", nullable=False)
