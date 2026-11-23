"""HTTP permissions use current project roles and isolated PostgreSQL data."""

import io
import json
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_repository_import import SHA, SOURCE, RepositoryInspectorStub

from projects import project_access
from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    ProjectMembership,
    ProjectRole,
    ProjectTaskFieldDefinition,
    RepositoryActivity,
    Revision,
    SkillRun,
    TaskFieldDefinition,
)
from projects.database import (
    TestRun as StoredTestRun,
)
from projects.portable import sha256


def create_record(client, project_id, kind, title, data=None):
    response = client.post(
        f"/api/projects/{project_id}/items",
        json={
            "kind": kind,
            "title": title,
            "body": "# permission regression",
            "data": data or {},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def access_http(app, client, project):
    with TestClient(app) as actor:
        registered = actor.post(
            "/api/auth/register",
            json={
                "username": "project-member",
                "password": "test-password-long",
            },
        )
        assert registered.status_code == 201, registered.text
        identity = registered.json()
        actor.headers["X-CSRF-Token"] = identity["csrf_token"]
        projects = [project]
        for name in ("viewer project", "unshared project"):
            response = client.post("/api/projects", json={"name": name})
            assert response.status_code == 201, response.text
            projects.append(response.json())
        with Session(app.state.engine) as db, db.begin():
            for current, preset in zip(
                projects[:2], ("editor", "viewer"), strict=True
            ):
                role = db.scalar(
                    select(ProjectRole).where(
                        ProjectRole.project_id == current["id"],
                        ProjectRole.preset == preset,
                    )
                )
                assert role is not None
                db.add(
                    ProjectMembership(
                        project_id=current["id"],
                        account_id=identity["user"]["id"],
                        role_id=role.id,
                    )
                )
                db.get(Project, current["id"]).access_revision += 1
        records = []
        for current in projects:
            project_id = current["id"]
            task = create_record(
                client,
                project_id,
                "task",
                "shared-search task",
                {"workflow": "personal", "planned_date": "2026-11-07"},
            )
            document = create_record(
                client, project_id, "artifact", "Document"
            )
            case = create_record(
                client,
                project_id,
                "test_case",
                "Test case",
                {"steps": ["Check permission"], "expected": "Access checked"},
            )
            linked = client.post(
                f"/api/projects/{project_id}/links",
                json={
                    "source_id": task["id"],
                    "target_id": document["id"],
                    "relation": "relates_to",
                },
            )
            assert linked.status_code == 201, linked.text
            with Session(app.state.engine) as db, db.begin():
                runs = {}
                for status in ("queued", "failed", "review_ready"):
                    run = SkillRun(
                        project_id=project_id,
                        operation="write_document",
                        instruction="Permission test",
                        status=status,
                        result=(
                            app.state.runner.result.model_dump()
                            if status == "review_ready"
                            else None
                        ),
                    )
                    db.add(run)
                    db.flush()
                    runs[status] = run.id
            records.append(
                {
                    "task": task,
                    "document": document,
                    "case": case,
                    "link": linked.json(),
                    "runs": runs,
                }
            )
        yield {
            "owner": client,
            "actor": actor,
            "actor_id": identity["user"]["id"],
            "projects": projects,
            "records": records,
            "app": app,
        }


def graph_snapshot(app):
    with Session(app.state.engine) as db:
        return {
            model.__tablename__: [
                tuple(
                    getattr(row, column.name)
                    for column in model.__table__.columns
                )
                for row in db.scalars(
                    select(model).order_by(*model.__table__.primary_key)
                )
            ]
            for model in (
                Project,
                Item,
                Revision,
                Link,
                StoredTestRun,
                Baseline,
                SkillRun,
                ProjectTaskFieldDefinition,
                TaskFieldDefinition,
            )
        }


def test_membership_filters_lists_search_counts_and_direct_reads(access_http):
    actor = access_http["actor"]
    a, b, c = access_http["projects"]
    listed = actor.get("/api/projects")
    assert listed.status_code == 200, listed.text
    assert {row["id"] for row in listed.json()} == {a["id"], b["id"]}
    assert {row["access"]["role"]["preset"] for row in listed.json()} == {
        "editor",
        "viewer",
    }
    result = actor.get("/api/tasks", params={"date": "2026-11-07"}).json()
    assert result["total"] == 2
    assert result["scope_counts"] == {
        "all": 2,
        "today": 2,
        "inbox": 2,
        "upcoming": 0,
    }
    assert {row["project_id"] for row in result["items"]} == {a["id"], b["id"]}
    searched = actor.get(
        "/api/tasks", params={"query": "shared-search"}
    ).json()
    assert searched["total"] == 2
    hidden = access_http["records"][2]
    for path in (
        f"/api/projects/{c['id']}",
        f"/api/projects/{c['id']}/summary",
        f"/api/projects/{c['id']}/items",
        f"/api/projects/{c['id']}/trace",
        f"/api/items/{hidden['task']['id']}",
        f"/api/items/{hidden['task']['id']}/revisions",
        f"/api/runs/{hidden['runs']['queued']}",
        f"/api/tasks?project_id={c['id']}",
    ):
        response = actor.get(path)
        assert response.status_code == 404, (path, response.text)
        assert c["name"] not in response.text
    assert len(access_http["owner"].get("/api/projects").json()) == 3


def test_acl_revision_invalidates_cursor_even_when_task_rows_are_unchanged(
    access_http,
):
    actor, app = access_http["actor"], access_http["app"]
    params = {"limit": 1, "date": "2026-11-07", "sort": "manual"}
    page = actor.get("/api/tasks", params=params).json()
    assert page["next_cursor"]
    assert (
        actor.get(
            "/api/tasks", params={**params, "cursor": page["next_cursor"]}
        ).status_code
        == 200
    )
    with Session(app.state.engine) as db, db.begin():
        project = db.get(Project, access_http["projects"][0]["id"])
        project.access_revision += 1
    changed = actor.get(
        "/api/tasks", params={**params, "cursor": page["next_cursor"]}
    )
    assert changed.status_code == 409, changed.text
    assert actor.get("/api/tasks", params=params).json()["total"] == 2


@pytest.mark.parametrize(
    "project_index, expected_status", [(1, 403), (2, 404)]
)
def test_viewer_and_nonmember_cannot_mutate_any_project_data(
    access_http, project_index, expected_status
):
    actor = access_http["actor"]
    project = access_http["projects"][project_index]
    record = access_http["records"][project_index]
    task, document, case = (
        record[key] for key in ("task", "document", "case")
    )
    project_url = f"/api/projects/{project['id']}"
    task_url = f"/api/items/{task['id']}"
    document_url = f"/api/items/{document['id']}"
    requests = [
        (
            "PATCH",
            project_url,
            {"expected_version": project["version"], "name": "Denied rename"},
        ),
        (
            "POST",
            project_url + "/items",
            {
                "kind": "task",
                "title": "Denied create",
                "data": {"workflow": "personal"},
            },
        ),
        (
            "POST",
            project_url + "/items",
            {"kind": "artifact", "title": "Denied document"},
        ),
        (
            "POST",
            project_url + "/tasks/quick",
            {"title": "Denied quick", "state": "todo"},
        ),
        (
            "POST",
            project_url + "/tasks/bulk",
            {
                "tasks": [{"id": task["id"], "expected_revision": 1}],
                "state": "in_progress",
            },
        ),
        (
            "PUT",
            task_url,
            {
                "expected_revision": 1,
                "title": "Denied title",
                "body": task["body"],
                "data": task["data"],
            },
        ),
        (
            "PUT",
            document_url,
            {
                "expected_revision": 1,
                "title": "Denied document",
                "body": "Denied",
                "data": document["data"],
            },
        ),
        (
            "PATCH",
            task_url + "/task-properties",
            {"expected_revision": 1, "values": {"state": "in_progress"}},
        ),
        (
            "PATCH",
            task_url + "/task-type",
            {"expected_revision": 1, "workflow": "delivery"},
        ),
        (
            "POST",
            task_url + "/move",
            {
                "expected_revision": 1,
                "source_state": "todo",
                "target_state": "in_progress",
            },
        ),
        ("POST", document_url + "/confirm", {"expected_revision": 1}),
        (
            "POST",
            document_url + "/restore",
            {"expected_revision": 1, "revision": 1},
        ),
        (
            "POST",
            task_url + "/note-references",
            {
                "expected_revision": 1,
                "url": "https://note.pydemia.ai/#/page/access",
            },
        ),
        (
            "POST",
            f"/api/items/{case['id']}/test-runs",
            {
                "outcome": "passed",
                "actual": "Checked",
                "environment": "test",
                "target_sha": "a" * 40,
            },
        ),
        ("POST", project_url + "/baselines", {"name": "Denied baseline"}),
        (
            "POST",
            project_url + "/links",
            {
                "source_id": task["id"],
                "target_id": case["id"],
                "relation": "relates_to",
            },
        ),
        ("DELETE", f"/api/links/{record['link']['id']}", None),
        (
            "POST",
            f"/api/links/{record['link']['id']}/review",
            {
                "expected_source_revision": 1,
                "expected_target_revision": 1,
                "impact": "none",
                "reason": "Checked",
            },
        ),
        (
            "POST",
            project_url + "/runs",
            {
                "operation": "write_document",
                "instruction": "Denied run",
                "skill_ids": ["document-writing-workflow"],
            },
        ),
        ("POST", f"/api/runs/{record['runs']['queued']}/cancel", None),
        ("POST", f"/api/runs/{record['runs']['failed']}/retry", None),
        (
            "POST",
            f"/api/runs/{record['runs']['review_ready']}/apply",
            {"apply_document": True},
        ),
        (
            "POST",
            document_url + "/reconnect",
            {
                "base_revision": 1,
                "base_sha256": sha256(document["body"].encode()),
                "body": "Denied reconnect",
                "preview": False,
            },
        ),
        (
            "POST",
            "/api/task-fields",
            {
                "project_id": project["id"],
                "name": "Denied field",
                "type": "text",
            },
        ),
    ]
    before = graph_snapshot(access_http["app"])
    failures = []
    for method, path, payload in requests:
        response = actor.request(method, path, json=payload)
        if response.status_code != expected_status:
            failures.append(
                (method, path, response.status_code, response.text)
            )
    assert graph_snapshot(access_http["app"]) == before
    assert failures == []


def test_editor_can_update_and_viewer_personal_views_and_order_are_private(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    a, b, _ = access_http["projects"]
    task = access_http["records"][0]["task"]
    updated = actor.put(
        f"/api/items/{task['id']}",
        json={
            "expected_revision": task["revision"],
            "title": "Editor change",
            "body": task["body"],
            "data": task["data"],
        },
    )
    assert updated.status_code == 200, updated.text
    assert (
        owner.get(f"/api/items/{task['id']}").json()["title"]
        == "Editor change"
    )
    created = actor.post(
        f"/api/projects/{a['id']}/tasks/quick",
        json={"title": "Editor new task", "state": "todo"},
    )
    assert created.status_code == 201, created.text
    owner_order = [row["id"] for row in owner.get("/api/projects").json()]
    reordered = actor.put(
        "/api/projects/order", json={"project_ids": [b["id"], a["id"]]}
    )
    assert reordered.status_code == 200, reordered.text
    assert [row["id"] for row in actor.get("/api/projects").json()] == [
        b["id"],
        a["id"],
    ]
    assert [
        row["id"] for row in owner.get("/api/projects").json()
    ] == owner_order
    path = f"/api/projects/{b['id']}/task-views"
    settings = {
        "schema_version": 2,
        "mode": "simple",
        "view": "board",
        "task_scope": "all",
    }
    saved = actor.post(
        path, json={"name": "Viewer board", "settings": settings}
    )
    assert saved.status_code == 201, saved.text
    view = saved.json()
    assert [row["id"] for row in actor.get(path).json()] == [view["id"]]
    assert owner.get(path).json() == []
    endpoint = f"/api/task-views/{view['id']}"
    assert (
        owner.put(
            endpoint,
            json={
                "name": "Wrong account",
                "expected_revision": 1,
                "settings": settings,
            },
        ).status_code
        == 404
    )
    assert owner.delete(endpoint).status_code == 404
    assert (
        actor.put(
            endpoint,
            json={
                "name": "Viewer renamed",
                "expected_revision": 1,
                "settings": settings,
            },
        ).status_code
        == 200
    )
    assert actor.delete(endpoint).status_code == 200


def test_custom_role_checks_current_capabilities_for_update_field_export_and_run(
    access_http,
):
    actor, app = access_http["actor"], access_http["app"]
    project = access_http["projects"][0]
    task = access_http["records"][0]["task"]
    with Session(app.state.engine) as db, db.begin():
        role = ProjectRole(
            project_id=project["id"],
            name="Task editor only",
            preset="custom",
            permissions=["project.read", "task.update"],
        )
        db.add(role)
        db.flush()
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"],
                ProjectMembership.account_id == access_http["actor_id"],
            )
        )
        member.role_id = role.id
        db.get(Project, project["id"]).access_revision += 1
    current = actor.get(f"/api/projects/{project['id']}").json()
    assert set(current["access"]["capabilities"]) == {
        "project.read",
        "task.update",
    }
    response = actor.patch(
        f"/api/items/{task['id']}/task-properties",
        json={"expected_revision": 1, "values": {"context": "desk"}},
    )
    assert response.status_code == 200, response.text
    before = graph_snapshot(app)
    assert (
        actor.post(
            "/api/task-fields",
            json={
                "project_id": project["id"],
                "name": "Forbidden",
                "type": "text",
            },
        ).status_code
        == 403
    )
    assert (
        actor.post(
            f"/api/projects/{project['id']}/runs",
            json={
                "operation": "write_document",
                "instruction": "Forbidden",
                "skill_ids": ["document-writing-workflow"],
            },
        ).status_code
        == 403
    )
    assert (
        actor.get(f"/api/projects/{project['id']}/export").status_code == 403
    )
    document = access_http["records"][0]["document"]
    assert (
        actor.get(f"/api/items/{document['id']}/portable").status_code == 403
    )
    assert graph_snapshot(app) == before


def test_viewer_can_export_readable_data_without_other_members_personal_views(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    project = access_http["projects"][1]
    document = access_http["records"][1]["document"]
    private = owner.post(
        f"/api/projects/{project['id']}/task-views",
        json={
            "name": "Owner private view",
            "settings": {"mode": "complex", "view": "list"},
        },
    )
    assert private.status_code == 201, private.text
    response = actor.get(f"/api/projects/{project['id']}/export")
    assert response.status_code == 200, response.text
    with ZipFile(io.BytesIO(response.content)) as archive:
        data = json.loads(archive.read("data.json"))
    assert {row["id"] for row in data["items"]} == {
        record["id"]
        for key, record in access_http["records"][1].items()
        if key in {"task", "document", "case"}
    }
    assert data["task_views"] == []
    assert "owner_id" not in data["project"]
    assert (
        "project_memberships" not in data and "project_invitations" not in data
    )
    portable = actor.get(f"/api/items/{document['id']}/portable")
    assert portable.status_code == 200, portable.text
    with ZipFile(io.BytesIO(portable.content)) as archive:
        assert archive.read("document.md").decode() == document["body"]
    hidden = access_http["projects"][2]
    assert actor.get(f"/api/projects/{hidden['id']}/export").status_code == 404
    hidden_document = access_http["records"][2]["document"]
    assert (
        actor.get(f"/api/items/{hidden_document['id']}/portable").status_code
        == 404
    )


def test_export_blocks_provenance_to_projects_the_actor_cannot_read(
    access_http,
):
    actor, app = access_http["actor"], access_http["app"]
    visible = access_http["projects"][1]
    hidden = access_http["projects"][2]
    document = access_http["records"][1]["document"]
    with Session(app.state.engine) as db, db.begin():
        item = db.get(Item, document["id"])
        item.data = {**item.data, "source_project_id": hidden["id"]}
    for path in (
        f"/api/projects/{visible['id']}/export",
        f"/api/items/{document['id']}/portable",
    ):
        response = actor.get(path)
        assert response.status_code == 409, response.text
        assert hidden["name"] not in response.text


def access_request(owner, project_id, **values):
    response = owner.get(f"/api/projects/{project_id}/access")
    assert response.status_code == 200, response.text
    return {
        "expected_revision": response.json()["access_revision"],
        "operation_id": str(uuid4()),
        **values,
    }


def test_management_http_hides_members_and_rejects_nonowner_mutations(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    for index, expected_status in ((0, 403), (1, 403), (2, 404)):
        project_id = access_http["projects"][index]["id"]
        path = f"/api/projects/{project_id}"
        for suffix in ("members", "invitations"):
            response = actor.get(path + "/" + suffix)
            assert response.status_code == expected_status, response.text
        request = access_request(owner, project_id)
        roles = owner.get(path + "/roles").json()
        editor_role = next(row for row in roles if row["preset"] == "editor")
        for method, suffix, payload in (
            (
                "POST",
                "/roles",
                {"name": "Denied", "permissions": ["project.read"]},
            ),
            (
                "PATCH",
                f"/roles/{editor_role['id']}",
                {"name": "Denied", "permissions": ["project.read"]},
            ),
            ("DELETE", f"/roles/{editor_role['id']}", {}),
            (
                "PATCH",
                f"/members/{access_http['actor_id']}",
                {"role_id": editor_role["id"]},
            ),
            ("POST", "/invitations", {"role_id": editor_role["id"]}),
            ("POST", "/ownership", {"account_id": access_http["actor_id"]}),
            ("PATCH", "/archive", {"archived": True}),
        ):
            response = actor.request(
                method, path + suffix, json={**request, **payload}
            )
            assert response.status_code == expected_status, (
                suffix,
                response.text,
            )
        public_roles = actor.get(path + "/roles")
        if index == 2:
            assert public_roles.status_code == 404
        else:
            assert public_roles.status_code == 200
            assert len(public_roles.json()) == 1
            assert "member_count" not in public_roles.json()[0]


def test_owner_invites_target_account_then_changes_and_revokes_access_over_http(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    project_id = access_http["projects"][2]["id"]
    path = f"/api/projects/{project_id}"
    roles = owner.get(path + "/roles").json()
    viewer = next(row for row in roles if row["preset"] == "viewer")
    created_role = owner.post(
        path + "/roles",
        json=access_request(
            owner,
            project_id,
            name="Task updater",
            permissions=["project.read", "task.update"],
        ),
    )
    assert created_role.status_code == 201, created_role.text
    custom = created_role.json()
    invitation = owner.post(
        path + "/invitations",
        json=access_request(
            owner,
            project_id,
            role_id=viewer["id"],
            account_id=access_http["actor_id"],
        ),
    )
    assert invitation.status_code == 201, invitation.text
    invitation = invitation.json()
    endpoint = f"/api/project-invitations/{invitation['id']}"
    assert invitation["token"] not in owner.get(path + "/invitations").text
    preview = actor.post(
        endpoint + "/preview", json={"token": invitation["token"]}
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["project_id"] == project_id
    accept = {
        "expected_revision": invitation["access_revision"],
        "operation_id": str(uuid4()),
        "token": invitation["token"],
    }
    assert owner.post(endpoint + "/accept", json=accept).status_code == 404
    joined = actor.post(endpoint + "/accept", json=accept)
    assert joined.status_code == 200, joined.text
    assert (
        actor.post(endpoint + "/accept", json=accept).json() == joined.json()
    )
    assert (
        actor.post(
            endpoint + "/accept", json={**accept, "operation_id": str(uuid4())}
        ).status_code
        == 409
    )
    assert len(actor.get("/api/projects").json()) == 3
    task = access_http["records"][2]["task"]
    task_endpoint = f"/api/items/{task['id']}/task-properties"
    update = {"expected_revision": 1, "values": {"context": "desk"}}
    assert actor.patch(task_endpoint, json=update).status_code == 403
    promoted = owner.patch(
        path + f"/members/{access_http['actor_id']}",
        json=access_request(owner, project_id, role_id=custom["id"]),
    )
    assert promoted.status_code == 200, promoted.text
    assert actor.patch(task_endpoint, json=update).status_code == 200
    narrowed = owner.patch(
        path + f"/roles/{custom['id']}",
        json=access_request(
            owner,
            project_id,
            name="Read only now",
            permissions=["project.read"],
        ),
    )
    assert narrowed.status_code == 200, narrowed.text
    update["expected_revision"] = 2
    assert actor.patch(task_endpoint, json=update).status_code == 403
    removed = owner.request(
        "DELETE",
        path + f"/members/{access_http['actor_id']}",
        json=access_request(owner, project_id),
    )
    assert removed.status_code == 200, removed.text
    assert actor.get(path).status_code == 404
    assert actor.get(f"/api/items/{task['id']}").status_code == 404
    assert len(actor.get("/api/projects").json()) == 2
    assert len(owner.get("/api/projects").json()) == 3
    deleted = owner.request(
        "DELETE",
        path + f"/roles/{custom['id']}",
        json=access_request(owner, project_id),
    )
    assert deleted.status_code == 200, deleted.text


def test_archive_rejects_owner_and_editor_writes_but_preserves_reads_and_restore(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    project_id = access_http["projects"][0]["id"]
    path = f"/api/projects/{project_id}"
    archived = owner.patch(
        path + "/archive",
        json=access_request(owner, project_id, archived=True),
    )
    assert archived.status_code == 200, archived.text
    task = access_http["records"][0]["task"]
    endpoint = f"/api/items/{task['id']}/task-properties"
    request = {"expected_revision": 1, "values": {"context": "archive"}}
    before = graph_snapshot(access_http["app"])
    for account in (owner, actor):
        assert account.get(path).status_code == 200
        assert account.get(path + "/export").status_code == 200
        assert account.patch(endpoint, json=request).status_code == 403
        assert (
            "task.update"
            not in account.get(path + "/access").json()["capabilities"]
        )
    assert graph_snapshot(access_http["app"]) == before
    assert (
        actor.patch(
            path + "/archive",
            json=access_request(owner, project_id, archived=False),
        ).status_code
        == 403
    )
    restored = owner.patch(
        path + "/archive",
        json=access_request(owner, project_id, archived=False),
    )
    assert restored.status_code == 200, restored.text
    assert actor.patch(endpoint, json=request).status_code == 200


@pytest.mark.parametrize(
    "reference", ["source_snapshots", "target_id", "applied_ids", "result"]
)
def test_run_reads_follow_current_project_of_referenced_items(
    access_http, reference
):
    owner, actor, app = (access_http[key] for key in ("owner", "actor", "app"))
    visible = access_http["projects"][1]
    hidden = access_http["projects"][2]
    record = access_http["records"][1]
    run_id = record["runs"]["review_ready"]
    source = record["document"]
    with Session(app.state.engine) as db, db.begin():
        run = db.get(SkillRun, run_id)
        if reference == "source_snapshots":
            run.source_snapshots = [
                {**source, "body": "foreign-source-confidential-body"}
            ]
        elif reference == "result":
            run.result = {**run.result, "source_ids": [source["id"]]}
        else:
            setattr(
                run,
                reference,
                source["id"] if reference == "target_id" else [source["id"]],
            )
    endpoint = f"/api/runs/{run_id}"
    list_endpoint = f"/api/projects/{visible['id']}/runs"
    assert actor.get(endpoint).status_code == 200
    assert run_id in {row["id"] for row in actor.get(list_endpoint).json()}
    with Session(app.state.engine) as db, db.begin():
        db.get(Item, source["id"]).project_id = hidden["id"]
    direct = actor.get(endpoint)
    assert direct.status_code == 404, direct.text
    listed = actor.get(list_endpoint)
    assert listed.status_code == 200, listed.text
    assert run_id not in {row["id"] for row in listed.json()}
    assert "foreign-source-confidential-body" not in listed.text + direct.text
    assert source["id"] not in listed.text + direct.text
    assert owner.get(endpoint).status_code == 200
    assert run_id in {row["id"] for row in owner.get(list_endpoint).json()}


def test_relation_reads_hide_endpoints_moved_to_unreadable_project(
    access_http,
):
    owner, actor, app = (access_http[key] for key in ("owner", "actor", "app"))
    visible = access_http["projects"][1]
    hidden = access_http["projects"][2]
    record = access_http["records"][1]
    endpoint = f"/api/projects/{visible['id']}/links"
    assert record["link"]["id"] in {
        row["id"] for row in actor.get(endpoint).json()
    }
    with Session(app.state.engine) as db, db.begin():
        db.get(Item, record["document"]["id"]).project_id = hidden["id"]
    response = actor.get(endpoint)
    assert response.status_code == 200, response.text
    assert record["document"]["id"] not in response.text
    assert record["link"]["id"] not in {row["id"] for row in response.json()}
    assert record["link"]["id"] in {
        row["id"] for row in owner.get(endpoint).json()
    }


def test_ownership_requires_target_acceptance_and_last_owner_cannot_leave(
    access_http,
):
    owner, actor = access_http["owner"], access_http["actor"]
    project_id = access_http["projects"][1]["id"]
    path = f"/api/projects/{project_id}"
    blocked = owner.post(
        path + "/leave", json=access_request(owner, project_id)
    )
    assert blocked.status_code == 409, blocked.text
    requested = owner.post(
        path + "/ownership",
        json=access_request(
            owner, project_id, account_id=access_http["actor_id"]
        ),
    )
    assert requested.status_code == 201, requested.text
    invitation = requested.json()
    assert actor.get(path + "/access").json()["role"]["preset"] == "viewer"
    accept = {
        "expected_revision": invitation["access_revision"],
        "operation_id": str(uuid4()),
        "token": invitation["token"],
    }
    endpoint = path + f"/ownership/{invitation['id']}/accept"
    assert owner.post(endpoint, json=accept).status_code == 404
    accepted = actor.post(endpoint, json=accept)
    assert accepted.status_code == 200, accepted.text
    assert actor.get(path + "/access").json()["role"]["preset"] == "owner"
    assert owner.get(path + "/access").json()["role"]["preset"] == "editor"
    assert owner.get(path + "/members").status_code == 403
    request = access_request(actor, project_id)
    assert actor.post(path + "/leave", json=request).status_code == 409
    assert (
        actor.request(
            "DELETE",
            path + f"/members/{access_http['actor_id']}",
            json=request,
        ).status_code
        == 409
    )
    assert len(actor.get(path + "/members").json()) == 2


@pytest.mark.parametrize(
    "project_index, expected_status", [(1, 403), (2, 404)]
)
def test_note_reference_deletion_requires_current_item_write_permission(
    access_http, project_index, expected_status
):
    owner, actor = access_http["owner"], access_http["actor"]
    task = access_http["records"][project_index]["task"]
    endpoint = f"/api/items/{task['id']}/note-references"
    attached = owner.post(
        endpoint,
        json={
            "expected_revision": task["revision"],
            "url": "https://note.pydemia.ai/#/page/read-only",
        },
    )
    assert attached.status_code == 201, attached.text
    task = attached.json()
    reference = task["data"]["note_references"][0]
    before = graph_snapshot(access_http["app"])
    denied = actor.request(
        "DELETE",
        endpoint + f"/{reference['id']}",
        json={"expected_revision": task["revision"]},
    )
    assert denied.status_code == expected_status, denied.text
    assert graph_snapshot(access_http["app"]) == before
    removed = owner.request(
        "DELETE",
        endpoint + f"/{reference['id']}",
        json={"expected_revision": task["revision"]},
    )
    assert removed.status_code == 200, removed.text


def test_baseline_filters_ids_after_task_moves_to_an_unreadable_project(
    access_http,
):
    owner, actor, app = (access_http[key] for key in ("owner", "actor", "app"))
    source_project = access_http["projects"][1]
    target_project = access_http["projects"][2]
    task = access_http["records"][1]["task"]
    endpoint = f"/api/projects/{source_project['id']}/baselines"
    created = owner.post(endpoint, json={"name": "Before transfer"})
    assert created.status_code == 201, created.text
    baseline = created.json()
    assert (
        actor.get(endpoint).json()[0]["revisions"][task["id"]]
        == task["revision"]
    )
    request = {
        "tasks": [{"id": task["id"], "expected_revision": task["revision"]}],
        "target_project_id": target_project["id"],
    }
    preview = owner.post("/api/task-transfers/preview", json=request)
    assert preview.status_code == 200, preview.text
    transferred = owner.post(
        "/api/task-transfers",
        json={
            **request,
            "preview_token": preview.json()["preview_token"],
            "operation_id": str(uuid4()),
        },
    )
    assert transferred.status_code == 200, transferred.text
    hidden = actor.get(endpoint)
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()[0]["id"] == baseline["id"]
    assert task["id"] not in hidden.text
    visible_ids = {
        access_http["records"][1][key]["id"] for key in ("document", "case")
    }
    assert set(hidden.json()[0]["revisions"]) == visible_ids
    assert (
        owner.get(endpoint).json()[0]["revisions"][task["id"]]
        == task["revision"]
    )
    with Session(app.state.engine) as db:
        assert db.get(Item, task["id"]).project_id == target_project["id"]
        assert (
            db.get(Baseline, baseline["id"]).revisions == baseline["revisions"]
        )


@pytest.mark.parametrize("method", ["DELETE", "review"])
@pytest.mark.parametrize("changed", ["endpoint", "link_project"])
def test_link_mutation_rejects_project_changes_before_access_locks(
    access_http, monkeypatch, method, changed
):
    actor, app = access_http["actor"], access_http["app"]
    source_project = access_http["projects"][0]
    hidden_project = access_http["projects"][2]
    record = access_http["records"][0]
    original_lock = project_access.lock_project_access
    moved_snapshot = None
    calls = 0

    def move_before_lock(db, ids):
        nonlocal moved_snapshot, calls
        if moved_snapshot is None:
            calls += 1
            assert set(ids) == {source_project["id"]}
            with Session(app.state.engine) as other, other.begin():
                if changed == "endpoint":
                    other.get(
                        Item, record["document"]["id"]
                    ).project_id = hidden_project["id"]
                else:
                    other.get(
                        Link, record["link"]["id"]
                    ).project_id = hidden_project["id"]
            moved_snapshot = graph_snapshot(app)
        return original_lock(db, ids)

    monkeypatch.setattr(
        project_access, "lock_project_access", move_before_lock
    )
    endpoint = f"/api/links/{record['link']['id']}"
    if method == "DELETE":
        denied = actor.delete(endpoint)
    else:
        denied = actor.post(
            endpoint + "/review",
            json={
                "expected_source_revision": 1,
                "expected_target_revision": 1,
                "impact": "none",
                "reason": "Concurrent move",
            },
        )
    assert calls == 1
    assert denied.status_code == 409, denied.text
    assert graph_snapshot(app) == moved_snapshot
    with Session(app.state.engine) as db:
        link = db.get(Link, record["link"]["id"])
        assert link is not None
        assert link.review == record["link"]["review"]
        assert link.source_revision == 1 and link.target_revision == 1
        assert (
            db.get(Item, record["document"]["id"]).body
            == record["document"]["body"]
        )


def test_revoked_creator_can_import_an_independent_copy_of_same_repository(
    access_http,
):
    owner, actor, app = (access_http[key] for key in ("owner", "actor", "app"))
    app.state.github = RepositoryInspectorStub()
    payload = {
        "repository_url": SOURCE,
        "expected_sha": SHA,
        "name": "Original repository",
    }
    imported = owner.post("/api/projects/from-git", json=payload)
    assert imported.status_code == 201, imported.text
    original = imported.json()
    path = f"/api/projects/{original['id']}"
    viewer = next(
        row
        for row in owner.get(path + "/roles").json()
        if row["preset"] == "viewer"
    )
    invitation = owner.post(
        path + "/invitations",
        json=access_request(
            owner,
            original["id"],
            role_id=viewer["id"],
            account_id=access_http["actor_id"],
        ),
    )
    assert invitation.status_code == 201, invitation.text
    invitation = invitation.json()
    accepted = actor.post(
        f"/api/project-invitations/{invitation['id']}/accept",
        json={
            "expected_revision": invitation["access_revision"],
            "operation_id": str(uuid4()),
            "token": invitation["token"],
        },
    )
    assert accepted.status_code == 200, accepted.text
    before_duplicate = graph_snapshot(app)
    assert (
        actor.post("/api/projects/from-git", json=payload).status_code == 409
    )
    assert graph_snapshot(app) == before_duplicate
    ownership = owner.post(
        path + "/ownership",
        json=access_request(
            owner, original["id"], account_id=access_http["actor_id"]
        ),
    )
    assert ownership.status_code == 201, ownership.text
    ownership = ownership.json()
    accepted = actor.post(
        path + f"/ownership/{ownership['id']}/accept",
        json={
            "expected_revision": ownership["access_revision"],
            "operation_id": str(uuid4()),
            "token": ownership["token"],
        },
    )
    assert accepted.status_code == 200, accepted.text
    revoked = actor.request(
        "DELETE",
        path + f"/members/{original['owner_id']}",
        json=access_request(actor, original["id"]),
    )
    assert revoked.status_code == 200, revoked.text
    assert owner.get(path).status_code == 404
    recreated = owner.post(
        "/api/projects/from-git",
        json={**payload, "name": "Independent repository"},
    )
    assert recreated.status_code == 201, recreated.text
    independent = recreated.json()
    assert independent["id"] != original["id"]
    assert {row["id"] for row in owner.get("/api/projects").json()} == {
        project["id"] for project in access_http["projects"]
    } | {independent["id"]}
    assert actor.get(path).status_code == 200
    assert actor.get(f"/api/projects/{independent['id']}").status_code == 404
    assert (
        actor.post("/api/projects/from-git", json=payload).status_code == 409
    )
    with Session(app.state.engine) as db:
        projects = db.scalars(
            select(Project).where(Project.repository_url == SOURCE)
        ).all()
        assert {row.id for row in projects} == {
            original["id"],
            independent["id"],
        }
        assert {row.owner_id for row in projects} == {original["owner_id"]}
        for project_id in (original["id"], independent["id"]):
            assert (
                len(
                    db.scalars(
                        select(Item).where(Item.project_id == project_id)
                    ).all()
                )
                == 1
            )
            assert (
                len(
                    db.scalars(
                        select(RepositoryActivity).where(
                            RepositoryActivity.project_id == project_id
                        )
                    ).all()
                )
                == 2
            )
