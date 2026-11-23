"""Project membership, protected roles, preferences and actor attribution."""

from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

# Frozen policy for backfill; later code changes must not change old migrations.
PERMISSIONS = [
    "project.read",
    "project.update",
    "task.create",
    "task.update",
    "task.move",
    "item.write",
    "relation.write",
    "baseline.write",
    "test.write",
    "field.manage",
    "run.execute",
    "run.apply",
    "project.export",
    "project.import",
    "project.archive",
    "member.manage",
    "role.manage",
    "ownership.transfer",
]


def upgrade() -> None:
    # Repository duplication is scoped to current readable memberships in the
    # application, not the historical creator's owner_id metadata.
    op.drop_index("uq_projects_owner_repository_scope", table_name="projects")
    op.add_column(
        "projects",
        sa.Column(
            "access_revision", sa.Integer(), nullable=False, server_default="1"
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "archived", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "skill_runs",
        sa.Column("requested_by", sa.String(36), sa.ForeignKey("accounts.id")),
    )
    op.add_column(
        "skill_runs", sa.Column("requested_membership_id", sa.String(36))
    )
    op.create_table(
        "project_roles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("preset", sa.String(10), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.UniqueConstraint("project_id", "id"),
        sa.UniqueConstraint("project_id", "name"),
        sa.CheckConstraint("preset IN ('owner','editor','viewer','custom')"),
    )

    def role_fk() -> sa.ForeignKeyConstraint:
        return sa.ForeignKeyConstraint(
            ["project_id", "role_id"],
            ["project_roles.project_id", "project_roles.id"],
        )

    op.create_table(
        "project_memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("role_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "account_id"),
        role_fk(),
    )
    op.create_table(
        "project_preferences",
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            primary_key=True,
        ),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("sort_order", sa.Integer()),
    )
    op.create_table(
        "project_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column(
            "target_account_id", sa.String(36), sa.ForeignKey("accounts.id")
        ),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_by", sa.String(36), sa.ForeignKey("accounts.id")),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        role_fk(),
        sa.CheckConstraint("kind IN ('membership','ownership')"),
    )
    op.create_table(
        "project_access_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("target_id", sa.String(36)),
        sa.Column("before", sa.JSON(), nullable=False),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.Column("operation_id", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "actor_id", "operation_id"),
    )
    op.create_table(
        "project_task_field_definitions",
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint(
            "type IN ('text','number','date','select','checkbox')"
        ),
    )
    connection = op.get_bind()
    roles = sa.table(
        "project_roles",
        sa.column("id"),
        sa.column("project_id"),
        sa.column("name"),
        sa.column("preset"),
        sa.column("permissions", sa.JSON()),
        sa.column("revision"),
    )
    for project in connection.execute(
        sa.text("SELECT id, owner_id FROM projects")
    ).mappings():
        owner_role = None
        for preset, name in [
            ("owner", "오너"),
            ("editor", "에디터"),
            ("viewer", "뷰어"),
        ]:
            role_id = str(uuid4())
            if preset == "owner":
                owner_role = role_id
            permissions = (
                PERMISSIONS
                if preset == "owner"
                else [
                    permission
                    for permission in PERMISSIONS
                    if permission
                    not in {
                        "project.archive",
                        "member.manage",
                        "role.manage",
                        "ownership.transfer",
                    }
                ]
                if preset == "editor"
                else ["project.read", "project.export"]
            )
            connection.execute(
                roles.insert().values(
                    id=role_id,
                    project_id=project["id"],
                    name=name,
                    preset=preset,
                    permissions=permissions,
                    revision=1,
                )
            )
        connection.execute(
            sa.text(
                "INSERT INTO project_memberships (id, project_id, account_id, role_id, created_at) VALUES (:id, :project, :owner, :role, CURRENT_TIMESTAMP)"
            ),
            {
                "id": str(uuid4()),
                "project": project["id"],
                "owner": project["owner_id"],
                "role": owner_role,
            },
        )
    connection.execute(
        sa.text(
            "INSERT INTO project_preferences (account_id, project_id, sort_order) SELECT owner_id, id, sort_order FROM projects"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO project_task_field_definitions (project_id, id, name, type, options, revision, created_at) SELECT p.id, f.id, f.name, f.type, f.options, f.revision, f.created_at FROM projects p JOIN task_field_definitions f ON f.owner_id = p.owner_id"
        )
    )


def downgrade() -> None:
    for name in [
        "project_task_field_definitions",
        "project_access_events",
        "project_invitations",
        "project_preferences",
        "project_memberships",
        "project_roles",
    ]:
        op.drop_table(name)
    op.drop_column("skill_runs", "requested_membership_id")
    op.drop_column("skill_runs", "requested_by")
    op.drop_column("projects", "archived")
    op.drop_column("projects", "access_revision")
    op.create_index(
        "uq_projects_owner_repository_scope",
        "projects",
        ["owner_id", "repository_url", "repository_path"],
        unique=True,
        postgresql_where=sa.text("repository_url IS NOT NULL"),
    )
