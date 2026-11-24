from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from projects.schemas import TaskViewSettings
from projects.task_queries import TaskQuery


def task(client, project_id, title, **data):
    response = client.post(
        f"/api/projects/{project_id}/items",
        json={
            "kind": "task",
            "title": title,
            "body": "",
            "data": {"workflow": "personal", "requires_test": False, **data},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_global_tasks_scope_search_and_owner_isolation(app, client, project):
    other_project = client.post(
        "/api/projects", json={"name": "다른 프로젝트"}
    ).json()
    overdue = task(
        client,
        project["id"],
        "지난 계획",
        planned_date="2026-11-01",
        list_name="실행",
    )
    today = task(
        client, other_project["id"], "오늘 계획", planned_date="2026-11-02"
    )
    future = task(client, project["id"], "예정", planned_date="2026-11-04")
    task(client, project["id"], "날짜 없음", list_name="언젠가")
    with TestClient(app) as outsider:
        signed = outsider.post(
            "/api/auth/register",
            json={"username": "outsider", "password": "long-enough-password"},
        ).json()
        outsider.headers["X-CSRF-Token"] = signed["csrf_token"]
        private = outsider.post(
            "/api/projects", json={"name": "비공개"}
        ).json()
        task(outsider, private["id"], "숨긴 제목", planned_date="2026-11-02")
        assert (
            client.get(
                "/api/tasks", params={"project_id": private["id"]}
            ).status_code
            == 404
        )
    response = client.get("/api/tasks", params={"date": "2026-11-02"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["total"] == 4
    assert result["scope_counts"] == {
        "all": 4,
        "today": 2,
        "inbox": 2,
        "upcoming": 1,
    }
    assert all(row["title"] != "숨긴 제목" for row in result["items"])
    assert (
        next(row for row in result["items"] if row["id"] == today["id"])[
            "project_name"
        ]
        == "다른 프로젝트"
    )
    today_rows = client.get(
        "/api/tasks", params={"date": "2026-11-02", "task_scope": "today"}
    ).json()
    assert {row["id"] for row in today_rows["items"]} == {
        overdue["id"],
        today["id"],
    }
    upcoming = client.get(
        "/api/tasks", params={"date": "2026-11-02", "task_scope": "upcoming"}
    ).json()
    assert [row["id"] for row in upcoming["items"]] == [future["id"]]
    matched = client.get(
        "/api/tasks", params={"query": "오늘", "date": "2026-11-02"}
    ).json()
    assert matched["total"] == 1
    assert matched["items"][0]["id"] == today["id"]


def test_task_pages_reject_changed_query_or_dataset(client, project):
    first = task(client, project["id"], "첫 작업")
    second = task(client, project["id"], "다음 작업")
    params = {"limit": 1, "sort": "manual", "date": "2026-11-02"}
    page = client.get("/api/tasks", params=params).json()
    assert len(page["items"]) == 1 and page["total"] == 2
    next_page = client.get(
        "/api/tasks", params={**params, "cursor": page["next_cursor"]}
    ).json()
    assert {page["items"][0]["id"], next_page["items"][0]["id"]} == {
        first["id"],
        second["id"],
    }
    assert next_page["next_cursor"] is None
    assert (
        client.get(
            "/api/tasks",
            params={**params, "query": "다음", "cursor": page["next_cursor"]},
        ).status_code
        == 422
    )
    task(client, project["id"], "새 작업")
    assert (
        client.get(
            "/api/tasks", params={**params, "cursor": page["next_cursor"]}
        ).status_code
        == 409
    )
    assert client.get("/api/tasks", params={"limit": 101}).status_code == 422
    assert (
        client.get("/api/tasks", params={"date": "잘못된 날짜"}).status_code
        == 422
    )


def test_global_saved_views_keep_personal_and_project_defaults_separate(
    client, project
):
    settings = {
        "schema_version": 2,
        "task_scope": "today",
        "mode": "simple",
        "view": "board",
        "grouping": "state",
    }
    payload = {
        "name": "오늘 보드",
        "scope": "personal",
        "is_default": True,
        "settings": settings,
    }
    created = client.post("/api/task-views", json=payload)
    assert created.status_code == 201, created.text
    global_view = created.json()
    assert (
        global_view["scope_type"] == "global"
        and global_view["project_id"] is None
    )
    local = client.post(
        f"/api/projects/{project['id']}/task-views", json=payload
    )
    assert local.status_code == 201, local.text
    assert local.json()["scope_type"] == "project"
    update = client.put(
        f"/api/task-views/{global_view['id']}",
        json={
            **payload,
            "expected_revision": global_view["revision"],
            "settings": {**settings, "view": "list"},
        },
    )
    assert update.status_code == 200, update.text
    assert (
        client.get(f"/api/projects/{project['id']}/task-views").json()[0][
            "is_default"
        ]
        is True
    )
    assert (
        client.put(
            f"/api/task-views/{global_view['id']}",
            json={**payload, "expected_revision": 1},
        ).status_code
        == 409
    )
    assert (
        client.delete(f"/api/task-views/{global_view['id']}").status_code
        == 200
    )
    assert client.get("/api/task-views").json() == []


def test_global_gtd_orders_before_paging_and_searches_context(client, project):
    task(
        client,
        project["id"],
        "시간이 많이 드는 작업",
        context="desk",
        estimated_minutes=90,
    )
    suitable = task(
        client,
        project["id"],
        "현재 가능한 작업",
        context="walk",
        estimated_minutes=15,
        energy="low",
    )
    response = client.get(
        "/api/tasks",
        params={
            "sort": "gtd",
            "minutes": 20,
            "context": "walk",
            "energy": "low",
            "limit": 1,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["id"] == suitable["id"]
    assert response.json()["total"] == 2
    matches = client.get("/api/tasks", params={"query": "walk"}).json()
    assert [row["id"] for row in matches["items"]] == [suitable["id"]]


def test_project_filter_is_applied_to_counts_pages_and_snapshot(
    client, project
):
    other = client.post("/api/projects", json={"name": "다른 프로젝트"}).json()
    first = task(client, project["id"], "선택 첫 작업")
    second = task(client, project["id"], "선택 다음 작업")
    task(client, other["id"], "선택 밖 작업")
    params = {
        "project_ids": project["id"],
        "limit": 1,
        "sort": "manual",
        "date": "2026-11-02",
    }
    response = client.get("/api/tasks", params=params)
    assert response.status_code == 200, response.text
    page = response.json()
    assert page["total"] == page["scope_counts"]["all"] == 2
    # Changes outside the selected projects do not stale a selected page.
    task(client, other["id"], "선택 밖 새 작업")
    response = client.get(
        "/api/tasks",
        params={
            **params,
            "project_ids": f"{project['id'].upper()},{project['id']}",
            "cursor": page["next_cursor"],
        },
    )
    assert response.status_code == 200, response.text
    assert {page["items"][0]["id"], response.json()["items"][0]["id"]} == {
        first["id"],
        second["id"],
    }
    assert (
        client.get(
            "/api/tasks",
            params={
                **params,
                "project_ids": other["id"],
                "cursor": page["next_cursor"],
            },
        ).status_code
        == 422
    )
    task(client, project["id"], "선택 안 새 작업")
    assert (
        client.get(
            "/api/tasks", params={**params, "cursor": page["next_cursor"]}
        ).status_code
        == 409
    )
    both = client.get(
        "/api/tasks", params={"project_ids": f"{project['id']},{other['id']}"}
    ).json()
    assert both["total"] == 5
    for invalid in (
        {"project_ids": "invalid"},
        {"project_ids": f"{project['id']},"},
        {"project_id": project["id"], "project_ids": other["id"]},
    ):
        assert client.get("/api/tasks", params=invalid).status_code == 422


def test_deadline_orders_open_before_closed_and_before_pagination(
    client, project
):
    completed = task(client, project["id"], "완료", due_date="2026-01-01")
    finished = client.patch(
        f"/api/items/{completed['id']}/task-properties",
        json={
            "expected_revision": completed["revision"],
            "values": {"state": "done"},
        },
    )
    assert finished.status_code == 200, finished.text
    undated = task(client, project["id"], "날짜 없음")
    later = task(client, project["id"], "늦은 마감", due_date="2026-11-20")
    earlier = task(client, project["id"], "빠른 마감", due_date="2026-11-10")
    cancelled = task(
        client,
        project["id"],
        "취소",
        state="cancelled",
        cancellation_reason="취소 확인",
    )
    params = {"sort": "deadline", "status": "all", "limit": 1}
    found = []
    while True:
        response = client.get("/api/tasks", params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        found.extend(row["id"] for row in page["items"])
        if not page["next_cursor"]:
            break
        params["cursor"] = page["next_cursor"]
    assert found == [
        earlier["id"],
        later["id"],
        undated["id"],
        completed["id"],
        cancelled["id"],
    ]
    legacy = client.get(
        "/api/tasks", params={"sort": "due_date", "status": "all", "limit": 1}
    ).json()
    assert legacy["items"][0]["id"] == completed["id"]


def test_list_variant_and_project_selection_saved_updated_and_duplicated(
    client, project
):
    unavailable = str(uuid4())
    settings = {
        "mode": "complex",
        "view": "list",
        "list_variant": "split",
        "project_ids": [project["id"].upper(), unavailable, project["id"]],
        "sort": "deadline",
        "layout_sorts": {"list": "deadline"},
    }
    response = client.post(
        "/api/task-views", json={"name": "나눈 목록", "settings": settings}
    )
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["settings"]["project_ids"] == sorted(
        [project["id"], unavailable]
    )
    assert saved["settings"]["list_variant"] == "split"
    updated = client.put(
        f"/api/task-views/{saved['id']}",
        json={
            "name": "마감 목록",
            "expected_revision": saved["revision"],
            "settings": {**saved["settings"], "list_variant": "deadline"},
        },
    )
    assert updated.status_code == 200, updated.text
    copied = client.post(
        "/api/task-views",
        json={"name": "목록 사본", "settings": updated.json()["settings"]},
    )
    assert copied.status_code == 201, copied.text
    assert copied.json()["settings"] == updated.json()["settings"]
    loaded = {row["id"]: row for row in client.get("/api/task-views").json()}
    assert (
        loaded[copied.json()["id"]]["settings"] == updated.json()["settings"]
    )
    legacy = TaskViewSettings(mode="complex", view="list")
    assert legacy.list_variant is None and legacy.project_ids == []


def test_project_filter_models_normalize_uuid_and_limit_selections():
    selected = str(uuid4())
    assert (
        TaskQuery(project_ids=f"{selected.upper()},{selected}").project_ids
        == selected
    )
    assert TaskQuery(project_ids="").project_ids is None
    assert TaskViewSettings(
        mode="complex", view="list", project_ids=[selected.upper(), selected]
    ).project_ids == [selected]
    for invalid in ("bad", f"{selected},", ",".join([selected] * 101)):
        with pytest.raises(ValidationError):
            TaskQuery(project_ids=invalid)
    with pytest.raises(ValidationError):
        TaskQuery(project_id=selected, project_ids=selected)
    for invalid_ids in (["bad"], [selected] * 101):
        with pytest.raises(ValidationError):
            TaskViewSettings(
                mode="complex", view="list", project_ids=invalid_ids
            )
