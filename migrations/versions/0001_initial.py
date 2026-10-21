"""Initial PostgreSQL tables for personal workspace and immutable revisions."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema is emitted by this immutable migration, not create_all on startup.
    op.create_table(
        "accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(80), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
    )
    op.create_table(
        "login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("goal", sa.Text, nullable=False),
        sa.Column("profile", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_table(
        "items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "id"),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint(
            "kind IN ('idea','feature','requirement','artifact','task','test_case','decision')"
        ),
    )
    op.create_index("ix_items_project_id", "items", ["project_id"])
    op.create_table(
        "revisions",
        sa.Column(
            "item_id",
            sa.String(36),
            sa.ForeignKey("items.id"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("source_id", sa.String(36), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column("relation", sa.String(30), nullable=False),
        sa.Column("source_revision", sa.Integer, nullable=False),
        sa.Column("target_revision", sa.Integer, nullable=False),
        sa.Column("review", sa.JSON, nullable=False),
        sa.UniqueConstraint("source_id", "target_id", "relation"),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id"], ["items.project_id", "items.id"]
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "target_id"], ["items.project_id", "items.id"]
        ),
    )
    op.create_index("ix_links_project_id", "links", ["project_id"])
    op.create_table(
        "test_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("case_id", sa.String(36), nullable=False),
        sa.Column("case_revision", sa.Integer, nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("actual", sa.Text, nullable=False),
        sa.Column("environment", sa.Text, nullable=False),
        sa.Column("target_sha", sa.String(128), nullable=False),
        sa.Column("evidence_url", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id", "case_revision"],
            ["revisions.item_id", "revisions.revision"],
        ),
    )
    op.create_index("ix_test_runs_project_id", "test_runs", ["project_id"])
    op.create_table(
        "baselines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("revisions", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_baselines_project_id", "baselines", ["project_id"])
    op.create_table(
        "skill_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("operation", sa.String(40), nullable=False),
        sa.Column("instruction", sa.Text, nullable=False),
        sa.Column("target_id", sa.String(36), sa.ForeignKey("items.id")),
        sa.Column("target_revision", sa.Integer),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("skills_lock", sa.JSON, nullable=False),
        sa.Column("skill_ids", sa.JSON, nullable=False),
        sa.Column("reference_manifest", sa.JSON, nullable=False),
        sa.Column("source_snapshots", sa.JSON, nullable=False),
        sa.Column("result", sa.JSON),
        sa.Column("error", sa.Text),
        sa.Column("applied_ids", sa.JSON, nullable=False),
        sa.Column("attempt", sa.Integer, nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_skill_runs_project_id", "skill_runs", ["project_id"])
    op.create_index("ix_skill_runs_status", "skill_runs", ["status"])


def downgrade() -> None:
    for table in [
        "skill_runs",
        "baselines",
        "test_runs",
        "links",
        "revisions",
        "items",
        "projects",
        "login_sessions",
        "accounts",
    ]:
        op.drop_table(table)
