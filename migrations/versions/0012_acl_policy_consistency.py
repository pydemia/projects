"""Align already-initialized ACL installations with the final operation policy."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

ACTIVE = {
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
}
OWNER_ONLY = {
    "project.archive",
    "member.manage",
    "role.manage",
    "ownership.transfer",
}


def upgrade() -> None:
    # Some development databases applied the first 0011 draft before this index
    # was removed. The immutable legacy creator must never constrain new grants.
    op.execute(
        sa.text("DROP INDEX IF EXISTS uq_projects_owner_repository_scope")
    )
    connection = op.get_bind()
    changed = set()
    for row in connection.execute(
        sa.text(
            "SELECT id, project_id, preset, permissions FROM project_roles"
        )
    ).mappings():
        stored = row["permissions"]
        if row["preset"] == "owner":
            permissions = sorted(ACTIVE)
        elif row["preset"] == "editor":
            permissions = sorted(ACTIVE - OWNER_ONLY)
        elif row["preset"] == "viewer":
            permissions = ["project.export", "project.read"]
        else:
            permissions = sorted(set(stored) & (ACTIVE - OWNER_ONLY))
        if sorted(stored) == permissions:
            continue
        connection.execute(
            sa.text(
                "UPDATE project_roles SET permissions=CAST(:permissions AS json), revision=revision+1 WHERE id=:id"
            ),
            {"permissions": json.dumps(permissions), "id": row["id"]},
        )
        changed.add(row["project_id"])
    for project_id in changed:
        connection.execute(
            sa.text(
                "UPDATE projects SET access_revision=access_revision+1 WHERE id=:id"
            ),
            {"id": project_id},
        )


def downgrade() -> None:
    # Do not restore unsupported permissions or a creator-based uniqueness gate.
    # 0011 downgrade owns removal of the ACL schema and legacy index restoration.
    pass
