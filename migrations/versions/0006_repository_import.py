"""Repository provenance and bounded commit/PR snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, type_, nullable, default in (
        ("repository_url", sa.String(500), True, None),
        ("repository_path", sa.String(200), False, ""),
        ("repository_branch", sa.String(200), True, None),
        ("repository_sha", sa.String(40), True, None),
        ("repository_kind", sa.String(30), True, None),
        ("repository_manifest", sa.String(250), True, None),
        ("repository_imported_at", sa.DateTime(timezone=True), True, None),
    ):
        op.add_column(
            "projects",
            sa.Column(name, type_, nullable=nullable, server_default=default),
        )
    op.create_index(
        "uq_projects_owner_repository_scope",
        "projects",
        ["owner_id", "repository_url", "repository_path"],
        unique=True,
        postgresql_where=sa.text("repository_url IS NOT NULL"),
    )
    op.create_table(
        "repository_activities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("external_id", sa.String(60), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "kind", "external_id"),
        sa.CheckConstraint("kind IN ('commit', 'pr')"),
    )
    op.create_index(
        "ix_repository_activities_project_id",
        "repository_activities",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_repository_activities_project_id",
        table_name="repository_activities",
    )
    op.drop_table("repository_activities")
    op.drop_index("uq_projects_owner_repository_scope", table_name="projects")
    for name in (
        "repository_imported_at",
        "repository_manifest",
        "repository_kind",
        "repository_sha",
        "repository_branch",
        "repository_path",
        "repository_url",
    ):
        op.drop_column("projects", name)
