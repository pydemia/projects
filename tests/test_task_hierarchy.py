"""Task hierarchy invariants run against isolated PostgreSQL schemas."""

import base64
import copy
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_task_discovery import task
from test_task_transfers import commit, seed

from projects.database import (
    Account,
    Item,
    Link,
    ProjectMembership,
    ProjectRole,
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
from projects.records import add_link, create_item, set_task_parent
from projects.task_transfers import preview_transfer, undo_transfer
from projects.transfer_schemas import TransferPreview, TransferUndo


def parent(client, child, selected, expected=None):
    return client.put(
        f"/api/items/{child['id']}/task-parent",
        json={"parent_task_id": selected, "expected_parent_id": expected},
    )


def hierarchy(client, project_id):
    response = client.get(f"/api/projects/{project_id}/links")
    assert response.status_code == 200, response.text
    return [row for row in response.json() if row["relation"] == "subtask_of"]


def test_atomic_task_parent_reparent_stale_cycle_and_unlink(client, project):
    child, first, second = [
        task(client, project["id"], title)
        for title in ("child", "first", "second")
    ]
    response = parent(client, child, first["id"])
    assert response.status_code == 200 and response.json() == {"ok": True}
    assert parent(client, child, first["id"], first["id"]).status_code == 200
    assert parent(client, child, second["id"]).status_code == 409
    assert parent(client, child, second["id"], first["id"]).status_code == 200
    assert parent(client, first, child["id"]).status_code == 200
    before = hierarchy(client, project["id"])
    # Failed reparent must restore its previous edge as one transaction.
    assert parent(client, child, first["id"], second["id"]).status_code == 409
    assert hierarchy(client, project["id"]) == before
    assert parent(client, second, first["id"]).status_code == 409
    assert parent(client, child, child["id"], second["id"]).status_code == 422
    assert hierarchy(client, project["id"]) == before
    assert parent(client, child, None, second["id"]).status_code == 200
    assert [row["source_id"] for row in hierarchy(client, project["id"])] == [
        first["id"]
    ]
    assert (
        client.get(f"/api/items/{child['id']}").json()["revision"]
        == child["revision"]
    )


def test_generic_links_cannot_bypass_task_hierarchy_validation(
    client, project, create_item
):
    child, first, second = [
        task(client, project["id"], title)
        for title in ("child", "first", "second")
    ]
    artifact = create_item()
    other_project = client.post("/api/projects", json={"name": "other"}).json()
    foreign = task(client, other_project["id"], "foreign")
    endpoint = f"/api/projects/{project['id']}/links"

    def link(source, target):
        return client.post(
            endpoint,
            json={
                "source_id": source["id"],
                "target_id": target["id"],
                "relation": "subtask_of",
            },
        )

    assert link(child, first).status_code == 201
    assert link(child, first).status_code == 201
    assert link(child, second).status_code == 409
    assert link(first, child).status_code == 409
    assert link(second, second).status_code == 422
    assert link(second, artifact).status_code == 422
    assert link(second, foreign).status_code == 422
    assert parent(client, child, foreign["id"], first["id"]).status_code == 422
    assert parent(client, child, str(uuid4()), first["id"]).status_code == 404
    assert (
        parent(client, child, artifact["id"], first["id"]).status_code == 422
    )
    assert parent(client, artifact, second["id"]).status_code == 422
    assert len(hierarchy(client, project["id"])) == 1


@pytest.mark.parametrize("permission", ["relation.write", "task.update"])
def test_parent_and_generic_link_writes_require_both_permissions(
    app, client, project, permission
):
    child = task(client, project["id"], "child")
    first = task(client, project["id"], "parent")
    with TestClient(app) as actor:
        registered = actor.post(
            "/api/auth/register",
            json={"username": "limited", "password": "long-enough-password"},
        ).json()
        actor.headers["X-CSRF-Token"] = registered["csrf_token"]
        with Session(app.state.engine) as db, db.begin():
            role = ProjectRole(
                project_id=project["id"],
                name="limited",
                preset="custom",
                permissions=["project.read", permission],
            )
            db.add(role)
            db.flush()
            db.add(
                ProjectMembership(
                    project_id=project["id"],
                    account_id=registered["user"]["id"],
                    role_id=role.id,
                )
            )
        assert parent(actor, child, first["id"]).status_code == 403
        assert (
            actor.post(
                f"/api/projects/{project['id']}/links",
                json={
                    "source_id": child["id"],
                    "target_id": first["id"],
                    "relation": "subtask_of",
                },
            ).status_code
            == 403
        )
        assert parent(client, child, first["id"]).status_code == 200
        edge = hierarchy(client, project["id"])[0]
        assert actor.delete(f"/api/links/{edge['id']}").status_code == 403
        assert parent(actor, child, None, first["id"]).status_code == 403
        assert hierarchy(client, project["id"])[0]["id"] == edge["id"]


def test_concurrent_parent_selection_has_one_winner(engine):
    with Session(engine) as db, db.begin():
        user, project, _, child = seed(db)
        first, second = [
            create_item(
                db, project.id, "task", title, "", {"workflow": "personal"}
            )
            for title in ("first", "second")
        ]
        actor, child_id, choices = user.id, child.id, [first.id, second.id]
    barrier = Barrier(2)

    def select_parent(parent_id):
        barrier.wait(timeout=10)
        try:
            with Session(engine) as db, db.begin():
                set_task_parent(db, actor, child_id, parent_id, None)
            return 200
        except Problem as exc:
            return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(select_parent, choices)) == [200, 409]
    with Session(engine) as db:
        edges = list(
            db.scalars(select(Link).where(Link.relation == "subtask_of"))
        )
        assert len(edges) == 1 and edges[0].source_id == child_id


def test_invalid_reparent_rolls_back_even_when_caller_handles_error(engine):
    with Session(engine) as db, db.begin():
        user, project, _, child = seed(db)
        parent_task, descendant = [
            create_item(
                db, project.id, "task", title, "", {"workflow": "personal"}
            )
            for title in ("parent", "descendant")
        ]
        original = add_link(db, project.id, child, parent_task, "subtask_of")
        add_link(db, project.id, descendant, child, "subtask_of")
        original_id = original.id
        with pytest.raises(Problem) as conflict:
            set_task_parent(
                db, user.id, child.id, descendant.id, parent_task.id
            )
        assert conflict.value.status == 409
        current = db.scalar(
            select(Link).where(
                Link.source_id == child.id, Link.relation == "subtask_of"
            )
        )
        assert current is not None
        assert (current.id, current.target_id) == (original_id, parent_task.id)


def test_hierarchy_transfer_requires_complete_tree_and_undo_keeps_local_edges(
    engine,
):
    with Session(engine) as db, db.begin():
        user, source, target, child = seed(db)
        parent_task = create_item(
            db, source.id, "task", "parent", "", {"workflow": "personal"}
        )
        edge = add_link(db, source.id, child, parent_task, "subtask_of")
        partial = TransferPreview(
            tasks=[{"id": child.id, "expected_revision": child.revision}],
            target_project_id=target.id,
        )
        preview = preview_transfer(db, user.id, partial)
        assert preview["blockers"] == [
            {"id": child.id, "reason": "task_hierarchy"}
        ]
        with pytest.raises(Problem) as conflict:
            commit(db, user, partial, operation="partial")
        assert conflict.value.status == 409
        assert (
            child.project_id
            == parent_task.project_id
            == edge.project_id
            == source.id
        )
        selected = TransferPreview(
            tasks=[
                {"id": row.id, "expected_revision": row.revision}
                for row in (child, parent_task)
            ],
            target_project_id=target.id,
        )
        moved = commit(db, user, selected, operation="complete")
        assert (
            child.project_id
            == parent_task.project_id
            == edge.project_id
            == target.id
        )
        extra = create_item(
            db, target.id, "task", "new child", "", {"workflow": "personal"}
        )
        extra_edge = add_link(db, target.id, extra, parent_task, "subtask_of")
        with pytest.raises(Problem) as conflict:
            undo_transfer(
                db,
                user.id,
                moved["transfer_id"],
                TransferUndo(operation_id="blocked-undo"),
            )
        assert conflict.value.status == 409
        assert (
            child.project_id
            == parent_task.project_id
            == edge.project_id
            == target.id
        )
        db.delete(extra_edge)
        db.flush()
        undo_transfer(
            db,
            user.id,
            moved["transfer_id"],
            TransferUndo(operation_id="undo"),
        )
        assert (
            child.project_id
            == parent_task.project_id
            == edge.project_id
            == source.id
        )


def pack(data):
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


def test_hierarchy_archive_roundtrip_and_invalid_graphs_rollback(engine):
    with Session(engine) as db, db.begin():
        user, source, target, child = seed(db)
        parent_task = create_item(
            db, source.id, "task", "parent", "", {"workflow": "personal"}
        )
        other = create_item(
            db, target.id, "task", "other", "", {"workflow": "personal"}
        )
        artifact = create_item(db, target.id, "artifact", "artifact", "", {})
        add_link(db, source.id, child, parent_task, "subtask_of")
        commit(
            db,
            user,
            TransferPreview(
                tasks=[
                    {"id": row.id, "expected_revision": row.revision}
                    for row in (child, parent_task)
                ],
                target_project_id=target.id,
            ),
        )
        data = read_archive(
            base64.b64encode(export_project(db, target)).decode()
        )
        ids = child.id, parent_task.id, other.id, artifact.id
        db.rollback()
    child_id, parent_id, other_id, artifact_id = ids
    cases = []
    for source_id, target_id in (
        (parent_id, child_id),
        (child_id, other_id),
        (other_id, other_id),
        (other_id, artifact_id),
    ):
        changed = copy.deepcopy(data)
        changed["links"].append(
            {
                **changed["links"][0],
                "id": str(uuid4()),
                "source_id": source_id,
                "target_id": target_id,
            }
        )
        cases.append(changed)
    with Session(engine) as db, db.begin():
        receiver = Account(username="restore", password_hash="unused")
        db.add(receiver)
        db.flush()
        for changed in cases:
            with pytest.raises(Problem) as invalid, db.begin_nested():
                import_project(db, receiver.id, pack(changed))
            assert invalid.value.status == 422
            assert db.get(Item, child_id) is None
        restored = import_project(db, receiver.id, pack(data))
        edges = list(
            db.scalars(select(Link).where(Link.relation == "subtask_of"))
        )
        assert len(edges) == 1
        assert (
            edges[0].source_id,
            edges[0].target_id,
            edges[0].project_id,
        ) == (child_id, parent_id, restored.id)


def test_graph_saved_view_uses_version_two(client):
    settings = {
        "schema_version": 2,
        "mode": "complex",
        "view": "graph",
        "task_scope": "all",
    }
    response = client.post(
        "/api/task-views", json={"name": "graph", "settings": settings}
    )
    assert response.status_code == 201, response.text
    assert response.json()["settings"]["view"] == "graph"
    assert (
        client.post(
            "/api/task-views",
            json={
                "name": "legacy graph",
                "settings": {"mode": "complex", "view": "graph"},
            },
        ).status_code
        == 422
    )
