"""AC-157/158 against isolated, real PostgreSQL schemas."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import (
    Account,
    Baseline,
    Item,
    ProjectMembership,
    ProjectRole,
)
from projects.schedule_models import ScheduleChange, ScheduleSnapshot
from projects.schedules import detach_task_schedules


def schedule(client, project, kind="epic", title="선택적 계획", **values):
    response = client.post(
        f"/api/projects/{project['id']}/schedules",
        json={
            "kind": kind,
            "title": title,
            **values,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_optional_shared_groups_preserve_tasks(client, project, create_item):
    task = create_item(
        "task",
        "공유 Task",
        data={
            "workflow": "personal",
            "planned_date": "2026-11-10",
            "due_date": "2026-11-20",
        },
    )
    story = create_item("requirement", "Story")
    first = schedule(client, project)
    second = schedule(client, project, title="다른 Epic")
    path = f"/api/projects/{project['id']}"
    for group in (first, second):
        linked = client.put(
            f"{path}/schedules/{group['id']}/members",
            json={
                "expected_revision": 1,
                "item_ids": [task["id"], story["id"]],
            },
        )
        assert linked.status_code == 200, linked.text
        assert set(linked.json()["member_ids"]) == {task["id"], story["id"]}
    assert client.get(f"/api/items/{task['id']}").json() == task
    conflict = client.put(
        f"{path}/schedules/{first['id']}/members",
        json={"expected_revision": 1, "item_ids": []},
    )
    assert conflict.status_code == 409
    assert (
        len(
            [
                item
                for item in client.get(path + "/items").json()
                if item["kind"] == "task"
            ]
        )
        == 1
    )


def test_explicit_iteration_reassignment_keeps_dates_and_history(
    client, project, create_item
):
    task = create_item(
        "task",
        "미완료 Task",
        data={
            "workflow": "personal",
            "planned_date": "2026-11-10",
            "due_date": "2026-11-20",
        },
    )
    first = schedule(
        client,
        project,
        "iteration",
        "이전 Iteration",
        start_date="2025-01-01",
        end_date="2025-01-10",
    )
    second = schedule(
        client,
        project,
        "iteration",
        "다음 Iteration",
        start_date="2027-01-01",
        end_date="2027-01-10",
    )
    path = f"/api/projects/{project['id']}/task-iterations/{task['id']}"
    assert client.get(path).json()["revision"] == 0
    for revision, iteration in ((0, first), (1, second)):
        response = client.put(
            path,
            json={
                "expected_schedule_revision": revision,
                "iteration_id": iteration["id"],
                "reason": "명시적 재배정",
            },
        )
        assert response.status_code == 200, response.text
    assert client.get(f"/api/items/{task['id']}").json() == task
    history = client.get(path + "/history").json()
    assert [
        (row["previous_iteration_id"], row["iteration_id"]) for row in history
    ] == [(None, first["id"]), (first["id"], second["id"])]
    assert client.get(path).json()["iteration_id"] == second["id"]
    stale = client.put(
        path, json={"expected_schedule_revision": 1, "iteration_id": None}
    )
    assert stale.status_code == 409
    deletion = client.request(
        "DELETE",
        f"/api/projects/{project['id']}/schedules/{second['id']}",
        json={"expected_revision": 1},
    )
    assert deletion.status_code == 409


def test_schedule_snapshot_freezes_dates_and_separate_item_baseline(
    client, project, create_item, engine
):
    task = create_item(
        "task",
        "작업",
        data={
            "workflow": "personal",
            "planned_date": "2026-11-10",
            "due_date": "2026-11-20",
        },
    )
    phase = schedule(
        client,
        project,
        "phase",
        "설계",
        start_date="2026-11-10",
        end_date="2026-11-20",
    )
    removed = schedule(
        client, project, "milestone", "확인 예정", due_date="2026-11-20"
    )
    base = f"/api/projects/{project['id']}"
    response = client.post(
        base + "/schedule-snapshots",
        json={"title": "변경 전", "reason": "범위 확정"},
    )
    assert response.status_code == 201, response.text
    snapshot = response.json()
    updated = client.patch(
        f"{base}/schedules/{phase['id']}",
        json={
            "title": "설계",
            "expected_revision": 1,
            "start_date": "2026-11-11",
            "end_date": "2026-11-25",
            "reason": "일정 변경",
        },
    )
    assert updated.status_code == 200, updated.text
    assert (
        client.request(
            "DELETE",
            f"{base}/schedules/{removed['id']}",
            json={"expected_revision": 1},
        ).status_code
        == 200
    )
    added = schedule(client, project, "iteration", "신규 반복")
    diff = client.get(
        f"{base}/schedule-snapshots/{snapshot['id']}/diff"
    ).json()
    assert {(entry["id"], entry["change"]) for entry in diff["changes"]} == {
        (phase["id"], "changed"),
        (removed["id"], "removed"),
        (added["id"], "new"),
    }
    assert diff["snapshot"]["schedules"][0]["start_date"] == "2026-11-10"
    assert client.get(f"/api/items/{task['id']}").json() == task
    with Session(engine) as db:
        assert db.scalar(select(Baseline)) is None
        stored = db.get(ScheduleSnapshot, snapshot["id"])
        assert stored.schedules[0]["start_date"] == "2026-11-10"
        assert (
            len(
                list(
                    db.scalars(
                        select(ScheduleChange).where(
                            ScheduleChange.schedule_id == phase["id"]
                        )
                    )
                )
            )
            == 2
        )


def test_calendar_dates_and_confirmation_are_explicit(client, project):
    path = f"/api/projects/{project['id']}/schedules"
    for values in (
        {"start_date": "2026-11-10T00:00:00Z"},
        {"start_date": "2026-11-20", "end_date": "2026-11-10"},
        {"due_date": "2026-02-30"},
        {"confirmed_date": "2026-11-10"},
    ):
        assert (
            client.post(
                path, json={"kind": "milestone", "title": "검증", **values}
            ).status_code
            == 422
        )
    row = schedule(client, project, "milestone", due_date="2020-01-01")
    assert row["confirmed_date"] is None
    response = client.patch(
        f"{path}/{row['id']}",
        json={
            "title": row["title"],
            "expected_revision": 1,
            "confirmed_date": "2026-11-10",
            "evidence": "시연 확인",
        },
    )
    assert response.status_code == 200
    assert response.json()["confirmed_date"] == "2026-11-10"
    assert response.json()["due_date"] == "2020-01-01"


def test_foreign_and_moved_items_never_leak_into_plan(
    client, project, create_item, engine
):
    task = create_item(
        "task", "이동 뒤 숨겨야 할 작업", data={"workflow": "personal"}
    )
    group = schedule(client, project)
    base = f"/api/projects/{project['id']}"
    assert (
        client.put(
            f"{base}/schedules/{group['id']}/members",
            json={"expected_revision": 1, "item_ids": [task["id"]]},
        ).status_code
        == 200
    )
    snapshot = client.post(
        base + "/schedule-snapshots",
        json={"title": "이동 전", "reason": "원래 범위"},
    ).json()
    other = client.post("/api/projects", json={"name": "다른 프로젝트"}).json()
    with Session(engine) as db, db.begin():
        db.get(Item, task["id"]).project_id = other["id"]
    assert (
        client.put(
            f"{base}/schedules/{group['id']}/members",
            json={"expected_revision": 2, "item_ids": [task["id"]]},
        ).status_code
        == 404
    )
    assert client.get(base + "/schedules").json()[0]["member_ids"] == []
    assert task["id"] not in client.get(base + "/schedule-snapshots").text
    assert (
        task["title"]
        not in client.get(
            f"{base}/schedule-snapshots/{snapshot['id']}/diff"
        ).text
    )
    assert (
        task["id"]
        not in client.get(f"{base}/schedules/{group['id']}/history").text
    )


def test_current_capabilities_and_revocation_apply_to_all_schedule_reads(
    client,
    project,
    engine,
    create_item,
):
    task = create_item("task", "권한 검사 Task", data={"workflow": "personal"})
    row = schedule(client, project)
    base = f"/api/projects/{project['id']}"
    snapshot = client.post(
        base + "/schedule-snapshots", json={"title": "보존", "reason": "검사"}
    ).json()
    with Session(engine) as db, db.begin():
        actor = db.scalar(select(Account).where(Account.username == "tester"))
        membership = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.account_id == actor.id,
                ProjectMembership.project_id == project["id"],
            )
        )
        role = db.get(ProjectRole, membership.role_id)
        role.preset = "custom"
        role.permissions = ["project.read", "project.update"]
    assert (
        client.post(
            base + "/schedule-snapshots",
            json={"title": "거부", "reason": "권한 없음"},
        ).status_code
        == 403
    )
    assert (
        client.put(
            base + f"/task-iterations/{task['id']}",
            json={"expected_schedule_revision": 0, "iteration_id": None},
        ).status_code
        == 403
    )
    with Session(engine) as db, db.begin():
        membership = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"]
            )
        )
        db.delete(membership)
    for suffix in (
        "/schedules",
        f"/schedules/{row['id']}/history",
        "/schedule-snapshots",
        f"/schedule-snapshots/{snapshot['id']}/diff",
        f"/task-iterations/{task['id']}",
        f"/task-iterations/{task['id']}/history",
    ):
        response = client.get(base + suffix)
        assert response.status_code in (403, 404), response.text


def test_iteration_revision_is_monotonic_across_project_roundtrip(
    client,
    project,
    create_item,
    engine,
):
    task = create_item("task", "왕복 이동 Task", data={"workflow": "personal"})
    first = schedule(client, project, "iteration", "A 일정")
    second_project = client.post("/api/projects", json={"name": "B"}).json()
    second = schedule(client, second_project, "iteration", "B 일정")
    source_path = f"/api/projects/{project['id']}/task-iterations/{task['id']}"
    target_path = (
        f"/api/projects/{second_project['id']}/task-iterations/{task['id']}"
    )
    assert (
        client.put(
            source_path,
            json={
                "expected_schedule_revision": 0,
                "iteration_id": first["id"],
            },
        ).status_code
        == 200
    )
    for destination, path, iteration in (
        (second_project, target_path, second),
        (project, source_path, first),
    ):
        with Session(engine) as db, db.begin():
            actor = db.scalar(
                select(Account).where(Account.username == "tester")
            )
            row = db.get(Item, task["id"])
            receipt = detach_task_schedules(db, row, actor.id)
            assert receipt["iteration_detached"] is not None
            row.project_id = destination["id"]
        current = client.get(path).json()
        assert current["iteration_id"] is None
        assert current["revision"] > 1
        response = client.put(
            path,
            json={
                "expected_schedule_revision": current["revision"],
                "iteration_id": iteration["id"],
            },
        )
        assert response.status_code == 200, response.text
    stale = client.put(
        source_path,
        json={"expected_schedule_revision": 1, "iteration_id": None},
    )
    assert stale.status_code == 409
    assert client.get(source_path).json()["iteration_id"] == first["id"]
    assert (
        client.get(f"/api/items/{task['id']}").json()["revision"]
        == task["revision"]
    )


def test_snapshot_lists_current_revision_and_recheck_targets(
    client, project, create_item
):
    task = create_item(
        "task",
        "확인할 Task",
        data={"workflow": "personal", "due_date": "2026-11-10"},
    )
    group = schedule(client, project, "phase", end_date="2026-11-10")
    base = f"/api/projects/{project['id']}"
    assert (
        client.put(
            f"{base}/schedules/{group['id']}/members",
            json={"expected_revision": 1, "item_ids": [task["id"]]},
        ).status_code
        == 200
    )
    snapshot = client.post(
        base + "/schedule-snapshots",
        json={"title": "일정 확정", "reason": "합의"},
    ).json()
    assert (
        client.patch(
            f"{base}/schedules/{group['id']}",
            json={
                "title": group["title"],
                "expected_revision": 2,
                "end_date": "2026-11-20",
            },
        ).status_code
        == 200
    )
    updated = client.patch(
        f"/api/items/{task['id']}/task-properties",
        json={
            "expected_revision": task["revision"],
            "values": {"due_date": "2026-11-20"},
        },
    )
    assert updated.status_code == 200, updated.text
    changes = client.get(
        f"{base}/schedule-snapshots/{snapshot['id']}/diff"
    ).json()["changes"]
    assert len(changes) == 2
    assert all(
        change["recheck_required"]
        and change["recheck_item_ids"] == [task["id"]]
        for change in changes
    )
    item_change = next(
        change for change in changes if change["entity"] == "item"
    )
    assert item_change["before"]["revision"] == task["revision"]
    assert item_change["after"]["revision"] == task["revision"] + 1
    assert item_change["before"]["due_date"] == "2026-11-10"
    assert item_change["after"]["due_date"] == "2026-11-20"
