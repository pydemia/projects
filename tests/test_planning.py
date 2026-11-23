"""Planning draft/application boundaries on real isolated PostgreSQL schemas."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from projects.access_schemas import AccessRequest
from projects.database import (
    Account,
    Item,
    Project,
    ProjectMembership,
    ProjectRole,
    SkillRun,
)
from projects.planning import PlanningApply, apply_draft, draft_for_actor
from projects.planning_models import PlanningApplication, PlanningDraft
from projects.project_access import initialize_project_access, remove_member
from projects.records import serialize


def make_draft(client, project, proposals, **kwargs):
    response = client.post(
        f"/api/projects/{project['id']}/planning-drafts",
        json={"proposals": proposals, **kwargs},
    )
    assert response.status_code == 201, response.text
    return response.json()


def selection(draft, ids, **kwargs):
    return {
        "expected_version": draft["version"],
        "selected_proposal_ids": ids,
        **kwargs,
    }


def item_count(engine):
    with Session(engine) as db:
        return db.scalar(select(func.count()).select_from(Item))


def test_draft_preview_cancel_and_apply_are_separate(client, project, engine):
    draft = make_draft(
        client,
        project,
        [
            {"id": "story", "kind": "create_story", "title": "결과 확인"},
            {"id": "task", "kind": "create_task", "title": "조사"},
            {
                "id": "edge",
                "kind": "link",
                "source": "task",
                "target": "story",
            },
        ],
        intent="요청 원문",
        mode="initial",
    )
    assert item_count(engine) == 0
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/preview",
        json=selection(draft, ["story", "task", "edge"]),
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["changes"]) == 3
    assert response.json()["source"]["body"] == "요청 원문"
    assert item_count(engine) == 0
    response = client.patch(
        f"/api/planning-drafts/{draft['id']}",
        json={"expected_version": 1, "status": "cancelled"},
    )
    assert response.status_code == 200
    cancelled = response.json()
    assert cancelled["intent"] == "요청 원문"
    assert item_count(engine) == 0
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(cancelled, ["story"], operation_id=str(uuid4())),
    )
    assert response.status_code == 409
    response = client.patch(
        f"/api/planning-drafts/{draft['id']}",
        json={"expected_version": cancelled["version"], "status": "draft"},
    )
    resumed = response.json()
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(
            resumed, ["story", "task", "edge"], operation_id=str(uuid4())
        ),
    )
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert len(receipt["created_items"]) == 2
    assert len(receipt["links"]) == 1
    task = next(
        value for value in receipt["created_items"] if value["kind"] == "task"
    )
    assert task["data"]["workflow"] == "personal"
    assert task["data"]["state"] == "todo"
    assert item_count(engine) == 3  # Separate preserved Idea source.
    with Session(engine) as db:
        source = db.get(Item, receipt["source_item_id"])
        assert source.kind == "idea" and source.body == "요청 원문"


def test_partial_selection_requires_explicit_dependencies_and_no_unselected_updates(
    client, project, create_item, engine
):
    existing = create_item("task", "기존 작업", data={"workflow": "personal"})
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "story",
                "kind": "create_story",
                "title": "선택하지 않은 Story",
            },
            {"id": "task", "kind": "create_task", "title": "독립 Task"},
            {
                "id": "edge",
                "kind": "link",
                "source": "task",
                "target": "story",
            },
            {
                "id": "edit",
                "kind": "update_item",
                "item_id": existing["id"],
                "title": "몰래 바뀌면 안 됨",
            },
        ],
    )
    assert (
        next(value for value in draft["proposals"] if value["id"] == "edit")[
            "default_selected"
        ]
        is False
    )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["task", "edge"], operation_id=str(uuid4())),
    )
    assert response.status_code == 422
    assert item_count(engine) == 1
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["task"], operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["created_items"]) == 1
    assert response.json()["links"] == []
    assert (
        client.get(f"/api/items/{existing['id']}").json()["title"]
        == "기존 작업"
    )


def test_stale_revision_and_explicit_reference_refresh(
    client, project, create_item, engine
):
    existing = create_item("requirement", "기존 Story")
    draft = make_draft(
        client,
        project,
        [
            {"id": "task", "kind": "create_task", "title": "새 작업"},
            {
                "id": "edge",
                "kind": "link",
                "source": "task",
                "target": existing["id"],
            },
        ],
    )
    response = client.put(
        f"/api/items/{existing['id']}",
        json={
            "expected_revision": 1,
            "title": "최신 Story",
            "body": "",
            "data": existing["data"],
        },
    )
    assert response.status_code == 200
    request = selection(draft, ["task", "edge"], operation_id=str(uuid4()))
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert response.status_code == 409
    assert item_count(engine) == 1
    with Session(engine) as db:
        assert db.get(PlanningDraft, draft["id"]).status == "draft"
    response = client.patch(
        f"/api/planning-drafts/{draft['id']}",
        json={"expected_version": 1, "intent": "초안 내용 보완"},
    )
    assert response.status_code == 200
    assert response.json()["references"][0]["revision"] == 1
    response = client.patch(
        f"/api/planning-drafts/{draft['id']}",
        json={"expected_version": 2, "reference_ids": [existing["id"]]},
    )
    refreshed = response.json()
    assert refreshed["references"][0]["revision"] == 2
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(refreshed, ["task", "edge"], operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text


def test_atomic_cycle_failure_does_not_create_items_or_receipt(
    client, project, engine
):
    draft = make_draft(
        client,
        project,
        [
            {"id": "a", "kind": "create_task", "title": "A"},
            {"id": "b", "kind": "create_task", "title": "B"},
            {
                "id": "ab",
                "kind": "link",
                "source": "a",
                "target": "b",
                "relation": "depends_on",
            },
            {
                "id": "ba",
                "kind": "link",
                "source": "b",
                "target": "a",
                "relation": "depends_on",
            },
        ],
        intent="순환도 함께 검사",
    )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(
            draft, ["a", "b", "ab", "ba"], operation_id=str(uuid4())
        ),
    )
    assert response.status_code == 409, response.text
    assert item_count(engine) == 0
    with Session(engine) as db:
        assert db.get(PlanningDraft, draft["id"]).status == "draft"
        assert (
            db.scalar(select(func.count()).select_from(PlanningApplication))
            == 0
        )


def test_idempotent_receipt_rechecks_content_actor_and_current_permissions(
    client, project, engine
):
    draft = make_draft(
        client,
        project,
        [{"id": "task", "kind": "create_task", "title": "재시도"}],
    )
    request = selection(draft, ["task"], operation_id=str(uuid4()))
    first = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert first.status_code == 200, first.text
    retry = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert retry.status_code == 200 and retry.json() == first.json()
    assert item_count(engine) == 1
    assert (
        client.get(f"/api/planning-drafts/{draft['id']}").json()["receipt"]
        == first.json()
    )
    changed = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json={**request, "selected_proposal_ids": []},
    )
    assert changed.status_code == 409
    with Session(engine) as db:
        membership = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"]
            )
        )
        viewer = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == project["id"],
                ProjectRole.preset == "viewer",
            )
        )
        membership.role_id = viewer.id
        db.commit()
    retry = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert retry.status_code == 403
    assert item_count(engine) == 1


def test_done_task_reopening_requires_explicit_opt_in(
    client, project, create_item
):
    task = create_item("task", "완료 보존", data={"workflow": "personal"})
    completed = client.put(
        f"/api/items/{task['id']}",
        json={
            "expected_revision": task["revision"],
            "title": task["title"],
            "body": task["body"],
            "data": {**task["data"], "state": "done"},
        },
    )
    assert completed.status_code == 200, completed.text
    task = completed.json()
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "edit",
                "kind": "update_item",
                "item_id": task["id"],
                "data": {"state": "todo"},
            }
        ],
    )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["edit"], operation_id=str(uuid4())),
    )
    assert response.status_code == 409
    assert (
        client.get(f"/api/items/{task['id']}").json()["data"]["state"]
        == "done"
    )
    response = client.patch(
        f"/api/planning-drafts/{draft['id']}",
        json={
            "expected_version": 1,
            "proposals": [
                {
                    "id": "edit",
                    "kind": "update_item",
                    "item_id": task["id"],
                    "reopen": True,
                    "data": {"state": "todo"},
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(response.json(), ["edit"], operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    assert response.json()["updated_items"][0]["data"]["state"] == "todo"


def test_completion_checks_final_selected_graph_and_combined_states(
    client, project, create_item, engine
):
    task = create_item("task", "완료 시도", data={"workflow": "personal"})
    draft = make_draft(
        client,
        project,
        [
            {"id": "new", "kind": "create_task", "title": "아직 열림"},
            {
                "id": "finish",
                "kind": "update_item",
                "item_id": task["id"],
                "data": {"state": "done"},
            },
            {
                "id": "dep",
                "kind": "link",
                "source": task["id"],
                "target": "new",
                "relation": "depends_on",
            },
        ],
    )
    for action in ("preview", "apply"):
        payload = selection(draft, ["new", "finish", "dep"])
        if action == "apply":
            payload["operation_id"] = str(uuid4())
        response = client.post(
            f"/api/planning-drafts/{draft['id']}/{action}", json=payload
        )
        assert response.status_code == 409, response.text
        assert item_count(engine) == 1
        assert (
            client.get(f"/api/items/{task['id']}").json()["data"]["state"]
            == "todo"
        )
    prior = create_item(
        "task", "동시 완료 선행", data={"workflow": "personal"}
    )
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "finish",
                "kind": "update_item",
                "item_id": task["id"],
                "data": {"state": "done"},
            },
            {
                "id": "finish-prior",
                "kind": "update_item",
                "item_id": prior["id"],
                "data": {"state": "done"},
            },
            {
                "id": "dep",
                "kind": "link",
                "source": task["id"],
                "target": prior["id"],
                "relation": "depends_on",
            },
        ],
    )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(
            draft, ["finish", "finish-prior", "dep"], operation_id=str(uuid4())
        ),
    )
    assert response.status_code == 200, response.text
    assert all(
        value["data"]["state"] == "done"
        for value in response.json()["updated_items"]
    )
    assert response.json()["links"][0]["source_revision"] == 2
    assert response.json()["links"][0]["target_revision"] == 2


def test_title_only_task_permissions_and_intent_source_gate(
    client, project, engine
):
    draft = make_draft(
        client,
        project,
        [{"id": "task", "kind": "create_task", "title": "제목만"}],
    )
    intent_draft = make_draft(
        client,
        project,
        [{"id": "task", "kind": "create_task", "title": "원문 보존 필요"}],
        intent="반드시 Idea로 보존",
    )
    with Session(engine) as db:
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"]
            )
        )
        role = ProjectRole(
            project_id=project["id"],
            name="Task만 추가",
            preset="custom",
            permissions=["project.read", "task.create"],
        )
        db.add(role)
        db.flush()
        member.role_id = role.id
        db.commit()
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["task"], operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    assert response.json()["source_item_id"] is None
    response = client.post(
        f"/api/planning-drafts/{intent_draft['id']}/apply",
        json=selection(intent_draft, ["task"], operation_id=str(uuid4())),
    )
    assert response.status_code == 403
    assert item_count(engine) == 1


def test_skill_result_seeds_independent_candidates_and_preserves_provenance(
    client, project, create_item, engine
):
    source = create_item("idea", "선택한 원문")
    result = {
        "document": None,
        "review": "모사 결과 검토",
        "assumptions": [],
        "questions": [],
        "source_ids": [source["id"]],
        "requirements": [
            {
                "title": "새 요구",
                "body": "기대 결과",
                "acceptance_criteria": ["확인 조건"],
                "feature_ids": [],
                "disposition": "extend",
                "rationale": "개선 이유",
                "design_changes": [],
                "tasks": [
                    {
                        "title": "실행 작업",
                        "body": "수행",
                        "acceptance_criteria": ["작업 조건"],
                    }
                ],
                "tests": [],
            },
            {
                "title": "중복 후보",
                "body": "동일 근거",
                "acceptance_criteria": [],
                "feature_ids": [],
                "disposition": "duplicate",
                "rationale": "기존 있음",
                "design_changes": [],
                "tasks": [],
                "tests": [],
            },
        ],
    }
    locks = [
        {
            "id": "skill",
            "source_revision": "a" * 40,
            "sha256": "b" * 64,
            "raw_source": "# 원문 스킬",
        }
    ]
    with Session(engine) as db:
        run = SkillRun(
            project_id=project["id"],
            requested_by=project["owner_id"],
            operation="plan",
            instruction="선택 범위만",
            status="review_ready",
            skills_lock=locks,
            source_snapshots=[serialize(db.get(Item, source["id"]))],
            result=result,
        )
        db.add(run)
        db.commit()
        run_id = run.id
    response = client.post(
        f"/api/projects/{project['id']}/planning-drafts",
        json={"source_run_id": run_id},
    )
    assert response.status_code == 201, response.text
    draft = response.json()
    assert len(draft["proposals"]) == 4
    assert draft["provenance"]["skills_lock"] == locks
    assert draft["provenance"]["result"] == result
    duplicate = next(
        value for value in draft["proposals"] if value["title"] == "중복 후보"
    )
    assert (
        duplicate["kind"] == "record_decision"
        and duplicate["default_selected"] is False
    )
    selected = [
        value["id"]
        for value in draft["proposals"]
        if value["default_selected"]
    ]
    preview = client.post(
        f"/api/planning-drafts/{draft['id']}/preview",
        json=selection(draft, selected),
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["audit"]["kind"] == "decision"
    assert item_count(engine) == 1
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, selected, operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert len(receipt["created_items"]) == 2
    assert len(receipt["links"]) == 1
    with Session(engine) as db:
        assert db.get(Item, receipt["audit_item_id"]).kind == "decision"
        assert db.get(SkillRun, run_id).skills_lock == locks
        assert db.get(SkillRun, run_id).status == "review_ready"


@pytest.mark.parametrize("task_count,design_count", [(0, 1), (1, 2)])
def test_skill_design_seeds_have_unique_ids_and_all_task_story_links(
    client, project, create_item, engine, task_count, design_count
):
    artifact = create_item("artifact", "설계 원문")
    result = {
        "document": None,
        "review": "합성 결과",
        "assumptions": [],
        "questions": [],
        "source_ids": [artifact["id"]],
        "requirements": [
            {
                "title": "요구",
                "body": "변경",
                "acceptance_criteria": [],
                "feature_ids": [],
                "disposition": "new",
                "rationale": "분리",
                "design_changes": [
                    {
                        "artifact_id": artifact["id"],
                        "instruction": f"변경 {index}",
                    }
                    for index in range(design_count)
                ],
                "tasks": [
                    {
                        "title": f"작업 {index}",
                        "body": "",
                        "acceptance_criteria": [],
                    }
                    for index in range(task_count)
                ],
                "tests": [],
            },
        ],
    }
    with Session(engine) as db:
        run = SkillRun(
            project_id=project["id"],
            requested_by=project["owner_id"],
            operation="plan",
            instruction="설계 수정",
            status="review_ready",
            source_snapshots=[serialize(db.get(Item, artifact["id"]))],
            result=result,
        )
        db.add(run)
        db.commit()
        run_id = run.id
    draft = make_draft(client, project, [], source_run_id=run_id)
    ids = [value["id"] for value in draft["proposals"]]
    assert len(ids) == len(set(ids))
    tasks = [
        value for value in draft["proposals"] if value["kind"] == "create_task"
    ]
    assert len(tasks) == task_count + design_count
    for task in tasks:
        assert any(
            value["kind"] == "link"
            and value["source"] == task["id"]
            and value["target"] == "run-story-0"
            for value in draft["proposals"]
        )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ids, operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    assert (
        len(response.json()["created_items"]) == 1 + task_count + design_count
    )


def test_actor_isolation_and_other_draft_operation_reuse(
    client, project, engine, app
):
    first = make_draft(
        client,
        project,
        [{"id": "a", "kind": "create_task", "title": "첫 기획"}],
    )
    operation_id = str(uuid4())
    response = client.post(
        f"/api/planning-drafts/{first['id']}/apply",
        json=selection(first, ["a"], operation_id=operation_id),
    )
    assert response.status_code == 200
    second = make_draft(
        client,
        project,
        [{"id": "b", "kind": "create_task", "title": "둘째 기획"}],
    )
    response = client.post(
        f"/api/planning-drafts/{second['id']}/apply",
        json=selection(second, ["b"], operation_id=operation_id),
    )
    assert response.status_code == 409
    assert item_count(engine) == 1
    with TestClient(app) as other:
        registration = other.post(
            "/api/auth/register",
            json={
                "username": "another-planner",
                "password": "test-password-long",
            },
        )
        other.headers["X-CSRF-Token"] = registration.json()["csrf_token"]
        assert (
            other.get(f"/api/planning-drafts/{first['id']}").status_code == 404
        )
        retry = other.post(
            f"/api/planning-drafts/{first['id']}/apply",
            json=selection(first, ["a"], operation_id=operation_id),
        )
        assert retry.status_code == 404


def test_source_move_conflict_and_relationship_permission_on_both_projects(
    client, project, create_item, engine
):
    source = create_item("task", "기존 작업", data={"workflow": "personal"})
    other_project = client.post(
        "/api/projects", json={"name": "별도 프로젝트"}
    ).json()
    foreign = client.post(
        f"/api/projects/{other_project['id']}/items",
        json={
            "kind": "requirement",
            "title": "다른 범위",
            "body": "",
            "data": {},
        },
    ).json()
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "edge",
                "kind": "link",
                "source": source["id"],
                "target": foreign["id"],
            }
        ],
    )
    with Session(engine) as db:
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == other_project["id"]
            )
        )
        viewer = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == other_project["id"],
                ProjectRole.preset == "viewer",
            )
        )
        owner = member.role_id
        member.role_id = viewer.id
        db.commit()
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["edge"], operation_id=str(uuid4())),
    )
    assert response.status_code == 403
    with Session(engine) as db:
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == other_project["id"]
            )
        )
        member.role_id = owner
        task = db.get(Item, source["id"])
        task.project_id = other_project["id"]
        task.revision += 1
        db.commit()
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["edge"], operation_id=str(uuid4())),
    )
    assert response.status_code == 409
    with Session(engine) as db:
        assert db.get(PlanningDraft, draft["id"]).status == "draft"


def test_source_membership_removal_and_rejoin_cannot_reuse_draft(
    client, project, create_item, engine
):
    source = create_item("requirement", "멤버십 경계")
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "task",
                "kind": "create_task",
                "title": "새 멤버십은 별도 검토",
            }
        ],
        reference_ids=[source["id"]],
    )
    with Session(engine) as db:
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"]
            )
        )
        account_id, role_id = member.account_id, member.role_id
        db.delete(member)
        db.flush()
        db.add(
            ProjectMembership(
                project_id=project["id"],
                account_id=account_id,
                role_id=role_id,
            )
        )
        db.commit()
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["task"], operation_id=str(uuid4())),
    )
    assert response.status_code == 409
    assert item_count(engine) == 1


@pytest.mark.parametrize(
    "relation,target_kind",
    [("relates_to", "task"), ("implements", "requirement")],
)
def test_nondependency_link_preserves_historical_done_with_reopened_predecessor(
    client, project, create_item, relation, target_kind
):
    prior = create_item("task", "선행 작업", data={"workflow": "personal"})
    done = create_item("task", "기존 완료", data={"workflow": "personal"})
    for task in (prior, done):
        response = client.put(
            f"/api/items/{task['id']}",
            json={
                "expected_revision": task["revision"],
                "title": task["title"],
                "body": task["body"],
                "data": {**task["data"], "state": "done"},
            },
        )
        assert response.status_code == 200, response.text
    response = client.post(
        f"/api/projects/{project['id']}/links",
        json={
            "source_id": done["id"],
            "target_id": prior["id"],
            "relation": "depends_on",
        },
    )
    assert response.status_code == 201
    response = client.put(
        f"/api/items/{prior['id']}",
        json={
            "expected_revision": 2,
            "title": prior["title"],
            "body": prior["body"],
            "data": {**prior["data"], "state": "todo"},
        },
    )
    assert response.status_code == 200
    target = create_item(
        target_kind,
        "새 연결",
        data={"workflow": "personal"} if target_kind == "task" else {},
    )
    before = client.get(f"/api/items/{done['id']}").json()
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "edge",
                "kind": "link",
                "source": done["id"],
                "target": target["id"],
                "relation": relation,
            }
        ],
    )
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/preview",
        json=selection(draft, ["edge"]),
    )
    assert response.status_code == 200, response.text
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply",
        json=selection(draft, ["edge"], operation_id=str(uuid4())),
    )
    assert response.status_code == 200, response.text
    assert client.get(f"/api/items/{done['id']}").json() == before


@pytest.mark.parametrize("first", ["receipt", "revocation"])
def test_moved_receipt_destination_acl_serializes_with_membership_revocation(
    client, project, engine, first
):
    draft = make_draft(
        client,
        project,
        [
            {
                "id": "task",
                "kind": "create_task",
                "title": "이동 후에도 영수증 보호",
            }
        ],
    )
    request = selection(draft, ["task"], operation_id=str(uuid4()))
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert response.status_code == 200, response.text
    receipt = response.json()
    actor = project["owner_id"]
    with Session(engine) as db, db.begin():
        owner = Account(username="destination-owner", password_hash="unused")
        db.add(owner)
        db.flush()
        destination = Project(owner_id=owner.id, name="이동 대상")
        db.add(destination)
        initialize_project_access(db, destination)
        editor = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == destination.id,
                ProjectRole.preset == "editor",
            )
        )
        db.add(
            ProjectMembership(
                project_id=destination.id, account_id=actor, role_id=editor.id
            )
        )
        task = db.get(Item, receipt["created_items"][0]["id"])
        task.project_id = destination.id
        task.revision += 1
        destination_id, owner_id = destination.id, owner.id

    def revoke(timeout=False):
        with Session(engine) as db, db.begin():
            if timeout:
                db.execute(text("SET LOCAL lock_timeout = '150ms'"))
            return remove_member(
                db,
                destination_id,
                owner_id,
                actor,
                AccessRequest(expected_revision=1, operation_id=str(uuid4())),
            )

    def retry_with_lock_timeout():
        with Session(engine) as db, db.begin():
            db.execute(text("SET LOCAL lock_timeout = '150ms'"))
            guarded = draft_for_actor(db, draft["id"], actor, lock=True)
            return apply_draft(
                db, guarded, actor, PlanningApply.model_validate(request)
            )

    with ThreadPoolExecutor(max_workers=1) as pool:
        if first == "receipt":
            with Session(engine) as db, db.begin():
                guarded = draft_for_actor(db, draft["id"], actor, lock=True)
                with pytest.raises(OperationalError) as blocked:
                    pool.submit(revoke, True).result(timeout=5)
                assert blocked.value.orig.sqlstate == "55P03"
                assert (
                    apply_draft(
                        db,
                        guarded,
                        actor,
                        PlanningApply.model_validate(request),
                    )
                    == receipt
                )
            revoke()
        else:
            with Session(engine) as db, db.begin():
                remove_member(
                    db,
                    destination_id,
                    owner_id,
                    actor,
                    AccessRequest(
                        expected_revision=1, operation_id=str(uuid4())
                    ),
                )
                with pytest.raises(OperationalError) as blocked:
                    pool.submit(retry_with_lock_timeout).result(timeout=5)
                assert blocked.value.orig.sqlstate == "55P03"
    response = client.post(
        f"/api/planning-drafts/{draft['id']}/apply", json=request
    )
    assert response.status_code == 404, response.text
