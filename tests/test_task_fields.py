"""Typed task properties and portable definitions on real PostgreSQL."""

import base64
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session
from test_task_p1 import settings
from test_task_transfers import commit, request

from projects.database import (
    Account,
    Item,
    Project,
    ProjectTaskFieldDefinition,
    Revision,
    TaskFieldDefinition,
)
from projects.domain import Problem
from projects.portable import (
    export_project,
    import_project,
    json_bytes,
    read_archive,
    sha256,
    zip_files,
)
from projects.project_access import initialize_project_access
from projects.records import create_item, revise_item


def field(client, kind="text", **kwargs):
    response = client.post(
        "/api/task-fields",
        json={
            "name": f"{kind} field",
            "type": kind,
            **kwargs,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def patch(client, item, values):
    return client.patch(
        f"/api/items/{item['id']}/task-properties",
        json={
            "expected_revision": item["revision"],
            "values": values,
        },
    )


def encoded(data):
    content = json_bytes(data)
    return base64.b64encode(
        zip_files(
            {
                "data.json": content,
                "manifest.json": json_bytes(
                    {
                        "schema_version": data["schema_version"],
                        "kind": "project_archive",
                        "files": {"data.json": sha256(content)},
                    }
                ),
            }
        )
    ).decode()


@pytest.mark.parametrize(
    ("kind", "valid", "invalid"),
    [
        ("text", "value", 1),
        ("number", 2.5, True),
        ("date", "2026-11-02", "2026-02-30"),
        ("select", "ready", "unknown"),
        ("checkbox", False, 0),
    ],
)
def test_typed_values_on_create_revision_patch_and_restore(
    client,
    project,
    create_item,
    kind,
    valid,
    invalid,
):
    definition = field(
        client,
        kind,
        **({"options": ["ready", "done"]} if kind == "select" else {}),
    )
    key = definition["id"]
    task = create_item("task", data={"workflow": "personal"})
    failed = patch(client, task, {f"custom:{key}": invalid})
    assert failed.status_code == 422, failed.text
    created = client.post(
        f"/api/projects/{project['id']}/items",
        json={
            "kind": "task",
            "title": "invalid create",
            "data": {"custom_fields": {key: invalid}},
        },
    )
    assert created.status_code == 422
    result = patch(client, task, {f"custom:{key}": valid, "context": "desk"})
    assert result.status_code == 200, result.text
    updated = result.json()
    assert updated["data"]["custom_fields"] == {key: valid}
    assert (
        updated["title"] == task["title"] and updated["body"] == task["body"]
    )
    assert patch(client, task, {f"custom:{key}": valid}).status_code == 409
    failed = client.put(
        f"/api/items/{task['id']}",
        json={
            "expected_revision": updated["revision"],
            "title": task["title"],
            "body": task["body"],
            "data": {**updated["data"], "custom_fields": {key: invalid}},
        },
    )
    assert failed.status_code == 422
    cleared = patch(
        client,
        updated,
        {f"custom:{key}": None, "context": "", "estimated_minutes": 0},
    )
    assert cleared.status_code == 200
    assert cleared.json()["data"]["custom_fields"] == {}
    restored = client.post(
        f"/api/items/{task['id']}/restore",
        json={
            "expected_revision": cleared.json()["revision"],
            "revision": updated["revision"],
        },
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["custom_fields"] == {key: valid}


def test_owner_visibility_unknown_keys_and_immutable_types(
    client, app, create_item
):
    definition = field(client)
    task = create_item("task")
    assert "owner_id" not in definition
    with TestClient(app) as other:
        registered = other.post(
            "/api/auth/register",
            json={
                "username": "fields-other",
                "password": "test-password-long",
            },
        ).json()
        other.headers["X-CSRF-Token"] = registered["csrf_token"]
        assert other.get("/api/task-fields").json() == []
        project = other.post("/api/projects", json={"name": "other"}).json()
        result = other.post(
            f"/api/projects/{project['id']}/items",
            json={
                "kind": "task",
                "title": "foreign",
                "data": {"custom_fields": {definition["id"]: "bad"}},
            },
        )
        assert result.status_code == 422
        assert patch(other, task, {"context": "foreign"}).status_code == 404
    assert patch(client, task, {f"custom:{uuid4()}": None}).status_code == 422
    # Builtin state updates use the same completion gate as regular saves.
    assert patch(client, task, {"state": "done"}).status_code == 409
    assert client.put(
        f"/api/task-fields/{definition['id']}", json={"type": "number"}
    ).status_code in (404, 405)
    assert (
        client.post(
            "/api/task-fields", json={"name": " ", "type": "text"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/task-fields",
            json={
                "name": "bad",
                "type": "select",
                "options": ["same", "same"],
            },
        ).status_code
        == 422
    )


def test_view_columns_validate_ownership_and_preserve_hidden_values(
    client, project, create_item
):
    definition = field(client)
    key = f"custom:{definition['id']}"
    task = create_item(
        "task", data={"custom_fields": {definition["id"]: "kept"}}
    )
    view_settings = {
        **settings(),
        "list_fields": ["context", key],
        "card_fields": [key],
    }
    response = client.post(
        f"/api/projects/{project['id']}/task-views",
        json={"name": "columns", "settings": view_settings},
    )
    assert response.status_code == 201, response.text
    view = response.json()
    assert view["settings"]["list_fields"] == ["context", key]
    hidden = client.put(
        f"/api/task-views/{view['id']}",
        json={
            "name": "columns",
            "expected_revision": 1,
            "settings": {
                **view_settings,
                "list_fields": [],
                "card_fields": [],
            },
        },
    )
    assert hidden.status_code == 200
    assert client.get(f"/api/items/{task['id']}").json()["data"][
        "custom_fields"
    ] == {definition["id"]: "kept"}
    for keys in ([key, key], [f"custom:{uuid4()}"], ["bad"], ["context"] * 33):
        response = client.post(
            "/api/task-views",
            json={
                "name": "bad",
                "settings": {**view_settings, "card_fields": keys},
            },
        )
        assert response.status_code == 422, response.text


def test_record_paths_reject_unknown_and_transfer_keeps_values(engine):
    with Session(engine) as db, db.begin():
        account = Account(username="typed", password_hash="unused")
        db.add(account)
        db.flush()
        source, target = [
            Project(owner_id=account.id, name=name)
            for name in ("source", "target")
        ]
        db.add_all([source, target])
        db.flush()
        initialize_project_access(db, source)
        initialize_project_access(db, target)
        definition = TaskFieldDefinition(
            owner_id=account.id, name="Number", type="number", options=[]
        )
        db.add(definition)
        db.flush()
        db.add(
            ProjectTaskFieldDefinition(
                project_id=source.id,
                id=definition.id,
                name=definition.name,
                type=definition.type,
                options=definition.options,
            )
        )
        db.flush()
        with pytest.raises(Problem):
            create_item(
                db,
                source.id,
                "task",
                "unknown",
                "",
                {
                    "custom_fields": {str(uuid4()): "unknown"},
                },
            )
        task = create_item(
            db,
            source.id,
            "task",
            "title",
            "body",
            {"workflow": "personal", "custom_fields": {definition.id: 3}},
        )
        with pytest.raises(Problem):
            revise_item(
                db,
                task,
                1,
                "title",
                "body",
                {**task.data, "custom_fields": {definition.id: "wrong"}},
            )
        for invalid in (float("inf"), float("nan"), 10**400):
            with pytest.raises(Problem):
                revise_item(
                    db,
                    task,
                    1,
                    "title",
                    "body",
                    {
                        **task.data,
                        "custom_fields": {definition.id: invalid},
                    },
                )
        commit(db, account, request(task, target))
        assert task.project_id == target.id
        assert task.data["custom_fields"] == {definition.id: 3}


def test_archive_preserves_historical_fields_and_independent_ownership(
    engine, client, project, create_item
):
    historical, view_only = field(client, "checkbox"), field(client, "number")
    task = create_item(
        "task",
        data={
            "workflow": "personal",
            "custom_fields": {historical["id"]: False},
        },
    )
    assert (
        patch(client, task, {f"custom:{historical['id']}": None}).status_code
        == 200
    )
    saved_view = client.post(
        f"/api/projects/{project['id']}/task-views",
        json={
            "name": "only view",
            "settings": {
                **settings(),
                "list_fields": [f"custom:{view_only['id']}"],
            },
        },
    )
    assert saved_view.status_code == 201, saved_view.text
    with Session(engine) as db:
        archive = read_archive(
            base64.b64encode(
                export_project(db, db.get(Project, project["id"]))
            ).decode()
        )
    assert {row["id"] for row in archive["task_fields"]} == {
        historical["id"],
        view_only["id"],
    }
    original_revisions = archive["revisions"]
    # Delete only this fixture's source project graph, then restore as another
    # owner in the same isolated schema (definitions remain under old owner).
    with Session(engine) as db, db.begin():
        for row in db.scalars(
            select(Revision).where(Revision.item_id == task["id"])
        ):
            db.delete(row)
        db.flush()
        for table in ("task_views", "items", "projects"):
            db.execute(
                text(
                    f"DELETE FROM {table} WHERE {'id' if table == 'projects' else 'project_id'} = :id"
                ),
                {"id": project["id"]},
            )
        owner = Account(username="restore-fields", password_hash="unused")
        db.add(owner)
        db.flush()
        restored = import_project(db, owner.id, encoded(archive))
        assert restored.owner_id == owner.id
        assert (
            db.get(ProjectTaskFieldDefinition, (restored.id, historical["id"]))
            is not None
        )
        reexported = read_archive(
            base64.b64encode(export_project(db, restored)).decode()
        )
        assert reexported["revisions"] == original_revisions


@pytest.mark.parametrize("version", [1, 2])
def test_legacy_archive_absent_custom_fields_preserves_hash(
    engine, client, project, create_item, version
):
    task = create_item("task", data={"workflow": "personal"})
    archive = read_archive(
        base64.b64encode(
            client.get(f"/api/projects/{project['id']}/export").content
        ).decode()
    )
    archive["schema_version"] = version
    archive.pop("task_fields")
    for row in [*archive["items"], *archive["revisions"]]:
        row["data"].pop("custom_fields")
    original = sha256(json_bytes(archive["revisions"]))
    with Session(engine) as db, db.begin():
        for row in db.scalars(
            select(Revision).where(Revision.item_id == task["id"])
        ):
            db.delete(row)
        db.flush()
        db.delete(db.get(Item, task["id"]))
        db.flush()
        db.delete(db.get(Project, project["id"]))
        db.flush()
        owner = db.scalar(select(Account))
        restored = import_project(db, owner.id, encoded(archive))
        reexport = read_archive(
            base64.b64encode(export_project(db, restored)).decode()
        )
        assert sha256(json_bytes(reexport["revisions"])) == original


def test_archive_definition_conflict_and_missing_definition_are_atomic(
    engine, client, project, create_item
):
    definition = field(client)
    create_item("task", data={"custom_fields": {definition["id"]: "value"}})
    data = read_archive(
        base64.b64encode(
            client.get(f"/api/projects/{project['id']}/export").content
        ).decode()
    )
    candidate_id = str(uuid4())
    data["project"]["id"] = candidate_id
    extra_id = str(uuid4())
    data["task_fields"].insert(0, {**definition, "id": extra_id})
    data["task_fields"][1]["name"] = "conflict"
    result = client.post(
        "/api/projects/import", json={"archive_base64": encoded(data)}
    )
    # A definition with this ID in another project is independent. This
    # malformed archive instead fails its mismatched item project atomically.
    assert result.status_code == 422, result.text
    with Session(engine) as db:
        owner_id = db.get(Project, project["id"]).owner_id
        assert db.get(Project, candidate_id) is None
        assert (
            db.get(ProjectTaskFieldDefinition, (candidate_id, extra_id))
            is None
        )
        assert db.get(TaskFieldDefinition, (owner_id, extra_id)) is None
    data["task_fields"] = []
    result = client.post(
        "/api/projects/import", json={"archive_base64": encoded(data)}
    )
    assert result.status_code == 422, result.text


def test_task_field_migration_roundtrip_and_data_loss_guard(engine):
    with engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0008")
        assert (
            "task_field_definitions"
            not in inspect(connection).get_table_names()
        )
        command.upgrade(config, "head")
        assert inspect(connection).get_pk_constraint("task_field_definitions")[
            "constrained_columns"
        ] == ["owner_id", "id"]
    with Session(engine) as db, db.begin():
        owner = Account(username="migration-field", password_hash="unused")
        db.add(owner)
        db.flush()
        db.add(
            TaskFieldDefinition(
                owner_id=owner.id, name="keep", type="text", options=[]
            )
        )
    with pytest.raises(RuntimeError, match="사용자 필드"):
        with engine.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.downgrade(config, "0008")
    with Session(engine) as db:
        assert db.scalar(select(TaskFieldDefinition)).name == "keep"
