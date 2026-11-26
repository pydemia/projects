"""Phase lifecycle, revision conflicts, and immutable close-time outcomes."""

from sqlalchemy.orm import Session
from test_schedules import schedule
from test_task_board import move

from projects import schedules
from projects.database import Item


def test_phase_member_limit_cannot_be_bypassed_by_task_or_carryover(
    client, project, create_item, monkeypatch
):
    monkeypatch.setattr(schedules, "MAX_SCHEDULE_MEMBERS", 1)
    base = f"/api/projects/{project['id']}"
    first = schedule(client, project, "phase")
    second = schedule(client, project, "phase", predecessor_id=first["id"])
    task = create_item("task", "source")
    other = create_item("task", "target")
    for phase, member in ((first, task), (second, other)):
        assigned = client.put(
            f"{base}/task-phases/{member['id']}",
            json={
                "phase_ids": [phase["id"]],
                "expected_revisions": {phase["id"]: 1},
            },
        )
        assert assigned.status_code == 200
    too_many = client.put(
        f"{base}/task-phases/{task['id']}",
        json={
            "phase_ids": [first["id"], second["id"]],
            "expected_revisions": {second["id"]: 2},
        },
    )
    assert too_many.status_code == 422
    source = f"{base}/schedules/{first['id']}"
    started = client.post(source + "/start", json={"expected_revision": 2})
    assert started.status_code == 200
    refused = client.post(
        source + "/close",
        json={
            "expected_revision": 3,
            "carryovers": [
                {"task_id": task["id"], "target_phase_id": second["id"]}
            ],
        },
    )
    assert refused.status_code == 422
    current = {
        row["id"]: row for row in client.get(f"{base}/schedules").json()
    }
    assert current[first["id"]]["phase"]["status"] == "in_progress"
    assert current[first["id"]]["member_ids"] == [task["id"]]
    assert current[second["id"]]["member_ids"] == [other["id"]]
    assert current[second["id"]]["revision"] == 2


def test_phase_dependencies_and_irreversible_successor_start(client, project):
    base = f"/api/projects/{project['id']}/schedules"
    first = schedule(client, project, "phase")
    second = schedule(
        client,
        project,
        "phase",
        predecessor_id=first["id"],
        start_date="2020-01-01",
    )
    assert second["phase"]["status"] == "not_started"
    epic = schedule(client, project)
    assert "phase" not in epic
    first_path = f"{base}/{first['id']}"
    second_path = f"{base}/{second['id']}"
    for invalid in (first["id"], second["id"], epic["id"], "unknown"):
        response = client.patch(
            first_path,
            json={
                "expected_revision": 1,
                "title": "first",
                "predecessor_id": invalid,
            },
        )
        assert response.status_code == 422
    assert (
        client.request(
            "DELETE", first_path, json={"expected_revision": 1}
        ).status_code
        == 409
    )
    assert (
        client.post(
            second_path + "/start", json={"expected_revision": 1}
        ).status_code
        == 409
    )
    started = client.post(first_path + "/start", json={"expected_revision": 1})
    assert started.json()["phase"]["started_at"]
    assert (
        client.patch(
            first_path,
            json={
                "title": "first",
                "expected_revision": 2,
                "predecessor_id": second["id"],
            },
        ).status_code
        == 409
    )
    assert client.post(
        first_path + "/close", json={"expected_revision": 2}
    ).json()["phase"]["closed_at"]
    assert (
        client.post(
            first_path + "/reopen", json={"expected_revision": 3}
        ).json()["phase"]["status"]
        == "in_progress"
    )
    assert (
        client.post(
            first_path + "/close", json={"expected_revision": 4}
        ).status_code
        == 200
    )
    assert (
        client.post(
            second_path + "/start", json={"expected_revision": 1}
        ).status_code
        == 200
    )
    assert (
        client.post(
            first_path + "/reopen", json={"expected_revision": 5}
        ).status_code
        == 409
    )
    assert (
        client.post(
            second_path + "/close", json={"expected_revision": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(
            first_path + "/reopen", json={"expected_revision": 5}
        ).status_code
        == 409
    )
    assert (
        client.request(
            "DELETE", second_path, json={"expected_revision": 3}
        ).status_code
        == 200
    )
    assert (
        client.post(
            first_path + "/reopen", json={"expected_revision": 5}
        ).status_code
        == 409
    )


def test_close_snapshots_task_results_and_reuses_successor_membership(
    client, project, create_item, engine
):
    base = f"/api/projects/{project['id']}"
    first = schedule(client, project, "phase")
    second = schedule(client, project, "phase", predecessor_id=first["id"])
    current_path = f"{base}/schedules/{first['id']}"
    next_path = f"{base}/schedules/{second['id']}"
    story = create_item("requirement", "Story")
    legacy = create_item(
        "task", "legacy closed", data={"workflow": "personal"}
    )
    with Session(engine) as db, db.begin():
        stored = db.get(Item, legacy["id"])
        stored.data = {
            **stored.data,
            "state": "cancelled",
            "cancellation_reason": "historical reason",
        }
    work = []
    for title in ("already linked", "newly linked", "completed"):
        task = create_item("task", title, data={"workflow": "personal"})
        work.append(move(client, task, "in_progress").json())
    assert move(client, work[-1], "done").status_code == 200
    members = [story["id"], legacy["id"], *(task["id"] for task in work)]
    assert (
        client.put(
            current_path + "/members",
            json={"expected_revision": 1, "item_ids": members},
        ).status_code
        == 200
    )
    assert (
        client.put(
            next_path + "/members",
            json={
                "expected_revision": 1,
                "item_ids": [work[0]["id"], story["id"]],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            current_path + "/start", json={"expected_revision": 2}
        ).status_code
        == 200
    )
    carry = [
        {"task_id": task["id"], "target_phase_id": second["id"]}
        for task in work[:2]
    ]
    for invalid in (
        [],
        carry[:1],
        [carry[0], carry[0]],
        [carry[0], {**carry[1], "target_phase_id": first["id"]}],
    ):
        assert (
            client.post(
                current_path + "/close",
                json={"expected_revision": 3, "carryovers": invalid},
            ).status_code
            == 422
        )
    closed = client.post(
        current_path + "/close",
        json={"expected_revision": 3, "carryovers": carry},
    ).json()
    outcomes = {
        entry["task_id"]: entry for entry in closed["phase"]["results"]
    }
    assert set(outcomes) == set(members) - {story["id"]}
    assert closed["member_ids"] == members
    assert outcomes[legacy["id"]]["result"] == "closed"
    assert outcomes[legacy["id"]]["reason"] == "historical reason"
    assert outcomes[work[2]["id"]]["result"] == "completed"
    for task in work[:2]:
        assert outcomes[task["id"]]["target_phase_id"] == second["id"]
        assert outcomes[task["id"]]["result"] == "carryover"
        assert (
            client.get(f"/api/items/{task['id']}").json()["data"]["state"]
            == "in_progress"
        )
    schedules = {
        row["id"]: row for row in client.get(base + "/schedules").json()
    }
    assert schedules[second["id"]]["member_ids"] == [
        work[0]["id"],
        story["id"],
        work[1]["id"],
    ]
    assert move(client, work[0], "done").status_code == 200
    assert (
        client.get(current_path + "/history").json()[-1]["after"]["phase"][
            "results"
        ]
        == closed["phase"]["results"]
    )
    reopened = client.post(
        current_path + "/reopen", json={"expected_revision": 4}
    ).json()
    assert reopened["phase"]["status"] == "in_progress"
    assert (
        client.post(
            current_path + "/close",
            json={"expected_revision": 5, "carryovers": carry[1:]},
        ).status_code
        == 200
    )
    history = client.get(current_path + "/history").json()
    closures = [
        entry["after"]["phase"]["results"]
        for entry in history
        if entry["reason"] == "phase_close"
    ]
    assert closures[0] == closed["phase"]["results"]
    assert any(
        row["task_id"] == work[0]["id"] and row["result"] == "completed"
        for row in closures[1]
    )
    current = {
        row["id"]: row for row in client.get(base + "/schedules").json()
    }
    assert (
        current[second["id"]]["member_ids"]
        == schedules[second["id"]]["member_ids"]
    )


def test_task_phase_multiselect_preserves_story_and_checks_all_revisions(
    client, project, create_item
):
    base = f"/api/projects/{project['id']}"
    story = create_item("requirement", "story")
    task = create_item("task", "task")
    first, second = [
        schedule(client, project, "phase")["id"] for _ in range(2)
    ]
    assert (
        client.put(
            f"{base}/schedules/{first}/members",
            json={"expected_revision": 1, "item_ids": [story["id"]]},
        ).status_code
        == 200
    )
    path = f"{base}/task-phases/{task['id']}"
    body = {
        "phase_ids": [first, second],
        "expected_revisions": {first: 2, second: 1},
    }
    assert (
        client.put(
            path, json={**body, "expected_revisions": {first: 2, second: 5}}
        ).status_code
        == 409
    )
    assert client.put(path, json=body).json()["phase_ids"] == [first, second]
    assert (
        client.put(
            path, json={**body, "expected_revisions": {first: 3, second: 2}}
        ).status_code
        == 200
    )
    assert (
        client.put(
            path, json={"phase_ids": [second], "expected_revisions": {}}
        ).status_code
        == 409
    )
    assert (
        client.put(
            path,
            json={"phase_ids": [second], "expected_revisions": {first: 3}},
        ).status_code
        == 200
    )
    schedules = {
        row["id"]: row for row in client.get(base + "/schedules").json()
    }
    assert schedules[first]["member_ids"] == [story["id"]]
    assert schedules[second]["member_ids"] == [task["id"]]
    assert schedules[second]["revision"] == 2
