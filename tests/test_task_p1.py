"""P1 task operations use one PostgreSQL transaction and personal view ownership."""

from fastapi.testclient import TestClient


def task(client, project, title, data=None):
    response = client.post(
        f"/api/projects/{project['id']}/items",
        json={
            "kind": "task",
            "title": title,
            "data": data or {"workflow": "personal"},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def rows(client, project):
    return {
        row["id"]: row
        for row in client.get(f"/api/projects/{project['id']}/items").json()
        if row["kind"] == "task"
    }


def bulk(client, project, tasks, **changes):
    return client.post(
        f"/api/projects/{project['id']}/tasks/bulk",
        json={
            "tasks": [
                {"id": entry["id"], "expected_revision": entry["revision"]}
                for entry in tasks
            ],
            **changes,
        },
    )


def settings(view="board", mode="complex"):
    return {
        "mode": mode,
        "view": view,
        "query": "",
        "status": "open",
        "lens": "gtd",
        "minutes": 15,
        "context": "desk",
        "energy": "any",
        "grouping": "state",
        "sort": "manual",
        "card_fields": ["due_date"],
    }


def test_quick_create_inherits_state_and_bottom_order(client, project):
    first = task(
        client,
        project,
        "existing",
        {"workflow": "personal", "state": "in_progress"},
    )
    response = client.post(
        f"/api/projects/{project['id']}/tasks/quick",
        json={"title": "from column", "state": "in_progress"},
    )
    assert response.status_code == 201, response.text
    created = response.json()
    current = rows(client, project)
    assert created["data"]["state"] == "in_progress"
    assert created["data"]["workflow"] == "personal"
    assert (
        current[created["id"]]["board_order"]
        > current[first["id"]]["board_order"]
    )
    assert current[created["id"]]["id"] == created["id"]
    assert (
        client.post(
            f"/api/projects/{project['id']}/tasks/quick",
            json={"title": "cancelled", "state": "cancelled"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/projects/{project['id']}/tasks/quick",
            json={
                "title": "cancelled",
                "state": "cancelled",
                "cancellation_reason": "not needed",
            },
        ).status_code
        == 201
    )
    completed = client.post(
        f"/api/projects/{project['id']}/tasks/quick",
        json={"title": "already complete", "state": "done"},
    )
    assert completed.status_code == 201, completed.text
    assert (
        rows(client, project)[completed.json()["id"]]["data"]["state"]
        == "done"
    )


def test_bulk_change_is_atomic_and_preserves_due_dates(client, project):
    first = task(
        client,
        project,
        "first",
        {
            "workflow": "personal",
            "due_date": "2026-11-01",
            "planned_date": "",
        },
    )
    second = task(
        client,
        project,
        "second",
        {
            "workflow": "personal",
            "due_date": "2026-11-02",
            "planned_date": "",
        },
    )
    accepted = bulk(
        client,
        project,
        [first, second],
        state="in_progress",
        planned_date="2026-10-22",
        list_name="Sprint",
    )
    assert accepted.status_code == 200, accepted.text
    current = rows(client, project)
    assert [
        current[entry["id"]]["data"]["due_date"] for entry in (first, second)
    ] == ["2026-11-01", "2026-11-02"]
    assert all(
        current[entry["id"]]["data"]["planned_date"] == "2026-10-22"
        for entry in (first, second)
    )
    assert all(
        current[entry["id"]]["data"]["list_name"] == "Sprint"
        for entry in (first, second)
    )
    stale = bulk(client, project, [first, accepted.json()[1]], state="done")
    assert stale.status_code == 409
    after = rows(client, project)
    assert after[first["id"]]["revision"] == current[first["id"]]["revision"]
    assert after[second["id"]]["revision"] == current[second["id"]]["revision"]
    assert (
        bulk(
            client,
            project,
            [after[first["id"]], after[second["id"]]],
            planned_date="",
        ).status_code
        == 200
    )
    cleared = rows(client, project)
    assert all(
        cleared[entry["id"]]["data"]["planned_date"] == ""
        for entry in (first, second)
    )
    assert cleared[first["id"]]["data"]["due_date"] == "2026-11-01"


def test_bulk_completion_gate_rejects_every_task(client, project):
    personal = task(client, project, "personal")
    delivery = task(client, project, "delivery", {"workflow": "delivery"})
    rejected = bulk(client, project, [personal, delivery], state="done")
    assert rejected.status_code == 409
    current = rows(client, project)
    assert all(
        current[entry["id"]]["data"]["state"] == "todo"
        for entry in (personal, delivery)
    )
    assert all(
        current[entry["id"]]["revision"] == 1 for entry in (personal, delivery)
    )


def test_bulk_completion_can_finish_dependent_personal_tasks_together(
    client, project
):
    predecessor = task(client, project, "predecessor")
    dependent = task(client, project, "dependent")
    linked = client.post(
        f"/api/projects/{project['id']}/links",
        json={
            "source_id": dependent["id"],
            "target_id": predecessor["id"],
            "relation": "depends_on",
        },
    )
    assert linked.status_code == 201, linked.text
    completed = bulk(client, project, [dependent, predecessor], state="done")
    assert completed.status_code == 200, completed.text
    assert all(
        rows(client, project)[entry["id"]]["data"]["state"] == "done"
        for entry in (dependent, predecessor)
    )


def test_bulk_rejects_foreign_task_and_invalid_inputs(client, project):
    own = task(client, project, "own")
    another = client.post(
        "/api/projects", json={"name": "Other project"}
    ).json()
    foreign = task(client, another, "foreign")
    assert (
        bulk(client, project, [own, foreign], state="in_progress").status_code
        == 404
    )
    assert rows(client, project)[own["id"]]["revision"] == 1
    assert (
        bulk(client, project, [own, own], state="in_progress").status_code
        == 422
    )
    assert (
        bulk(client, project, [own], planned_date="not-a-date").status_code
        == 422
    )
    assert rows(client, project)[own["id"]]["revision"] == 1


def test_personal_view_is_separate_from_tasks_and_private(
    client, project, app
):
    existing = task(client, project, "work")
    path = f"/api/projects/{project['id']}/task-views"
    created = client.post(
        path,
        json={
            "name": "My board",
            "is_default": True,
            "settings": settings(),
        },
    )
    assert created.status_code == 201, created.text
    view = created.json()
    assert view["scope"] == "personal"
    assert client.get(path).json()[0]["id"] == view["id"]
    assert rows(client, project)[existing["id"]]["revision"] == 1
    replaced = client.post(
        path,
        json={
            "name": "My list",
            "is_default": True,
            "settings": settings("list"),
        },
    )
    assert replaced.status_code == 201, replaced.text
    listed = client.get(path).json()
    assert sum(entry["is_default"] for entry in listed) == 1
    assert (
        next(entry for entry in listed if entry["id"] == view["id"])[
            "is_default"
        ]
        is False
    )
    assert (
        client.post(
            path,
            json={
                "name": "Shared",
                "scope": "shared",
                "settings": settings(),
            },
        ).status_code
        == 422
    )
    with TestClient(app) as other:
        login = other.post(
            "/api/auth/register",
            json={
                "username": "other",
                "password": "other-password-long",
            },
        )
        assert login.status_code == 201
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert other.get(path).status_code == 404
        assert (
            other.put(
                f"/api/task-views/{view['id']}",
                json={
                    "name": "stolen",
                    "settings": settings(),
                    "expected_revision": 1,
                },
            ).status_code
            == 404
        )
        assert other.delete(f"/api/task-views/{view['id']}").status_code == 404
    assert client.delete(f"/api/task-views/{view['id']}").status_code == 200
