"""Owner-scoped inline changes retain revisions and completion rules."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from projects.database import Project


def properties(client, task, values):
    return client.patch(
        f"/api/items/{task['id']}/task-properties",
        json={"expected_revision": task["revision"], "values": values},
    )


def task_type(client, task, workflow, **extra):
    return client.patch(
        f"/api/items/{task['id']}/task-type",
        json={
            "expected_revision": task["revision"],
            "workflow": workflow,
            **extra,
        },
    )


def test_rename_preserves_project_metadata_and_checks_version(
    engine, client, project
):
    with Session(engine) as db, db.begin():
        row = db.get(Project, project["id"])
        row.sort_order = 7
        row.repository_url = "https://github.com/example/project"
        row.repository_path = "web"
        row.repository_branch = "main"
        row.repository_sha = "a" * 40
        row.repository_kind = "javascript"
        row.repository_manifest = "web/package.json"
    path = f"/api/projects/{project['id']}"
    before = client.get(path).json()
    response = client.patch(
        path, json={"expected_version": before["version"], "name": "  New  "}
    )
    assert response.status_code == 200, response.text
    after = response.json()
    assert after == {**before, "name": "New", "version": before["version"] + 1}
    assert client.get(path).json() == after
    assert (
        client.patch(
            path, json={"expected_version": before["version"], "name": "stale"}
        ).status_code
        == 409
    )
    for extra in ({"name": " "}, {"name": "New", "goal": "overwrite"}):
        assert (
            client.patch(
                path, json={"expected_version": after["version"], **extra}
            ).status_code
            == 422
        )
    assert client.get(path).json() == after


def test_inline_endpoints_enforce_owner_and_csrf(
    app, client, project, create_item
):
    task = create_item("task", data={"workflow": "personal"})
    requests = [
        (
            f"/api/projects/{project['id']}",
            {"expected_version": project["version"], "name": "foreign"},
        ),
        (
            f"/api/items/{task['id']}/task-type",
            {"expected_revision": 1, "workflow": "delivery"},
        ),
        (
            f"/api/items/{task['id']}/task-properties",
            {"expected_revision": 1, "values": {"energy": "high"}},
        ),
    ]
    with TestClient(app) as other:
        response = other.post(
            "/api/auth/register",
            json={
                "username": "inline-other",
                "password": "other-password-long",
            },
        )
        other.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        for path, payload in requests:
            assert other.patch(path, json=payload).status_code == 404
    csrf = client.headers.pop("X-CSRF-Token")
    for path, payload in requests:
        assert client.patch(path, json=payload).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    assert client.get(f"/api/items/{task['id']}").json() == task


def test_properties_merge_and_record_history(client, create_item):
    task = create_item("task", title="Title", body="# Body")
    changes = {
        "state": "in_progress",
        "energy": "high",
        "next_action": False,
        "abc_order": 8,
        "requires_test": False,
        "acceptance_criteria": ["One", "Two"],
        "result_url": "https://example.org/result",
        "target_sha": "abc123",
        "cancellation_reason": "retained reason",
    }
    response = properties(client, task, changes)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["data"] == {**task["data"], **changes}
    for key in ("id", "project_id", "title", "body", "status", "created_at"):
        assert updated[key] == task[key]
    assert updated["revision"] == 2
    assert properties(client, task, {"context": "stale"}).status_code == 409
    revisions = client.get(f"/api/items/{task['id']}/revisions").json()
    by_revision = {row["revision"]: row for row in revisions}
    assert by_revision[1]["data"] == task["data"]
    assert by_revision[2]["data"] == updated["data"]


@pytest.mark.parametrize(
    "values",
    [
        {"workflow": "personal"},
        {"title": "overwrite"},
        {"body": "overwrite"},
        {"unknown": "x"},
        {"energy": "extreme"},
        {"abc_order": -1},
        {"requires_test": "false"},
        {"acceptance_criteria": "not a list"},
        {"context": ["not a string"]},
    ],
)
def test_properties_reject_unsafe_or_invalid_values(
    client, create_item, values
):
    task = create_item("task")
    assert properties(client, task, values).status_code == 422
    assert client.get(f"/api/items/{task['id']}").json() == task


def test_properties_keep_completion_and_cancellation_gates(
    client, create_item
):
    task = create_item("task")
    assert properties(client, task, {"state": "done"}).status_code == 409
    assert properties(client, task, {"state": "cancelled"}).status_code == 422
    assert client.get(f"/api/items/{task['id']}").json() == task
    cancelled = properties(
        client,
        task,
        {"state": "cancelled", "cancellation_reason": "Duplicate"},
    ).json()
    assert cancelled["data"]["cancellation_reason"] == "Duplicate"
    assert (
        properties(client, cancelled, {"cancellation_reason": ""}).status_code
        == 422
    )
    reopened = properties(client, cancelled, {"state": "todo"}).json()
    done = properties(
        client,
        reopened,
        {
            "state": "done",
            "requires_test": False,
            "acceptance_criteria": ["Delivered"],
            "result_url": "https://example.org/result",
        },
    )
    assert done.status_code == 200, done.text
    assert (
        properties(client, done.json(), {"result_url": ""}).status_code == 409
    )


def test_type_transition_preserves_relations_content_and_history(
    client, project, create_item
):
    task = create_item(
        "task",
        title="Same task",
        body="Keep body",
        data={
            "workflow": "personal",
            "requires_test": False,
            "context": "Office",
        },
    )
    other = create_item()
    relation = client.post(
        f"/api/projects/{project['id']}/links",
        json={
            "source_id": task["id"],
            "target_id": other["id"],
            "relation": "relates_to",
        },
    ).json()
    response = task_type(client, task, "delivery")
    assert response.status_code == 200, response.text
    delivery = response.json()
    assert delivery["data"] == {
        **task["data"],
        "workflow": "delivery",
        "requires_test": True,
    }
    assert delivery["revision"] == task["revision"] + 1
    for key in (
        "id",
        "project_id",
        "kind",
        "title",
        "body",
        "status",
        "created_at",
    ):
        assert delivery[key] == task[key]
    assert task_type(client, task, "personal").status_code == 409
    assert task_type(client, delivery, "delivery").json() == delivery
    personal = task_type(client, delivery, "personal").json()
    assert personal["data"] == task["data"]
    assert personal["revision"] == delivery["revision"] + 1
    assert (
        client.get(f"/api/projects/{project['id']}/links").json()[0]["id"]
        == relation["id"]
    )
    revisions = client.get(f"/api/items/{task['id']}/revisions").json()
    assert {row["revision"]: row["data"]["workflow"] for row in revisions} == {
        1: "personal",
        2: "delivery",
        3: "personal",
    }


def test_type_change_is_explicit_and_cannot_complete_task(client, create_item):
    task = create_item("task", data={"workflow": "personal"})
    assert task_type(client, task, "delivery", state="done").status_code == 422
    assert (
        task_type(client, task, "delivery", requires_test=False).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/items/{task['id']}",
            json={
                "expected_revision": task["revision"],
                "title": task["title"],
                "body": task["body"],
                "data": {**task["data"], "workflow": "delivery"},
            },
        ).status_code
        == 409
    )
    assert client.get(f"/api/items/{task['id']}").json() == task
    artifact = create_item()
    assert task_type(client, artifact, "personal").status_code == 422
    assert properties(client, artifact, {"energy": "high"}).status_code == 422


def test_properties_and_type_changes_keep_dependency_completion_gate(
    client, project, create_item
):
    dependency = create_item("task", data={"workflow": "personal"})
    task = create_item(
        "task",
        data={
            "workflow": "personal",
            "requires_test": False,
            "acceptance_criteria": ["Delivered"],
            "result_url": "https://example.org/result",
        },
    )
    done = properties(client, task, {"state": "done"}).json()
    assert (
        client.post(
            f"/api/projects/{project['id']}/links",
            json={
                "source_id": task["id"],
                "target_id": dependency["id"],
                "relation": "depends_on",
            },
        ).status_code
        == 201
    )
    # Existing completed tasks still revalidate dependencies on any save.
    for response in (
        properties(client, done, {"energy": "low"}),
        task_type(client, done, "delivery"),
    ):
        assert response.status_code == 409
        assert "선행 작업" in response.json()["detail"]
    assert client.get(f"/api/items/{task['id']}").json() == done
    reopened = properties(client, done, {"state": "todo"}).json()
    confirmed = client.post(
        f"/api/items/{task['id']}/confirm",
        json={"expected_revision": reopened["revision"]},
    ).json()
    converted = task_type(client, confirmed, "delivery").json()
    assert converted["status"] == confirmed["status"] == "confirmed"
    assert converted["data"]["state"] == "todo"
    assert converted["revision"] == confirmed["revision"] + 1


def test_done_personal_conversion_requires_current_delivery_evidence(
    client, project, create_item
):
    task = create_item(
        "task", data={"workflow": "personal", "requires_test": False}
    )
    done = properties(client, task, {"state": "done"}).json()
    denied = task_type(client, done, "delivery")
    assert denied.status_code == 409
    assert "다시 연 뒤" in denied.json()["detail"]
    assert client.get(f"/api/items/{task['id']}").json() == done
    evidenced = properties(
        client,
        done,
        {
            "acceptance_criteria": ["Delivered"],
            "result_url": "https://example.org/result",
            "target_sha": "abc123",
        },
    ).json()
    assert task_type(client, evidenced, "delivery").status_code == 409
    case = create_item(
        "test_case", data={"steps": ["Open result"], "expected": "Delivered"}
    )
    assert (
        client.post(
            f"/api/projects/{project['id']}/links",
            json={
                "source_id": case["id"],
                "target_id": task["id"],
                "relation": "verifies",
            },
        ).status_code
        == 201
    )
    run = {
        "outcome": "passed",
        "actual": "Delivered",
        "environment": "Local",
        "target_sha": "old",
    }
    endpoint = f"/api/items/{case['id']}/test-runs"
    assert client.post(endpoint, json=run).status_code == 201
    assert task_type(client, evidenced, "delivery").status_code == 409
    assert (
        client.post(endpoint, json={**run, "target_sha": "abc123"}).status_code
        == 201
    )
    converted = task_type(client, evidenced, "delivery")
    assert converted.status_code == 200, converted.text
    assert converted.json()["data"]["state"] == "done"
    assert converted.json()["data"]["requires_test"] is True
    assert converted.json()["revision"] == evidenced["revision"] + 1
