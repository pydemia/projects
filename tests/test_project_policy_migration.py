"""Existing draft installations converge without changing business records."""

import json

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from projects.database import Account, Project
from projects.project_access import (
    PERMISSIONS,
    initialize_project_access,
    project_access,
)


def test_policy_upgrade_repairs_applied_draft_without_changing_business_data(
    engine,
):
    with engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0011")
    with Session(engine) as db, db.begin():
        account = Account(username="policy-owner", password_hash="unused")
        db.add(account)
        db.flush()
        project = Project(owner_id=account.id, name="Preserved", version=7)
        db.add(project)
        db.flush()
        initialize_project_access(db, project)
        owner_id, project_id = account.id, project.id
        baseline_revision = project.access_revision
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE UNIQUE INDEX uq_projects_owner_repository_scope ON projects(owner_id, repository_url, repository_path) WHERE repository_url IS NOT NULL"
            )
        )
        role_id = connection.scalar(
            text(
                "SELECT id FROM project_roles WHERE project_id=:id AND preset='owner'"
            ),
            {"id": project_id},
        )
        connection.execute(
            text(
                "UPDATE project_roles SET permissions=CAST(:permissions AS json) WHERE id=:id"
            ),
            {
                "id": role_id,
                "permissions": json.dumps(
                    sorted(PERMISSIONS | {"task.delete", "project.delete"})
                ),
            },
        )
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        assert (
            connection.scalar(
                text(
                    "SELECT count(*) FROM pg_indexes WHERE schemaname=current_schema() AND indexname='uq_projects_owner_repository_scope'"
                )
            )
            == 0
        )
    with Session(engine) as db:
        project = db.get(Project, project_id)
        assert (project.name, project.owner_id, project.version) == (
            "Preserved",
            owner_id,
            7,
        )
        access = project_access(db, project_id, owner_id)
        assert set(access["capabilities"]) == PERMISSIONS
        assert access["access_revision"] == baseline_revision + 1
