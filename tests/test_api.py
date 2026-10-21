import base64
import io
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from zipfile import ZipFile

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    Revision,
    SkillRun,
    utcnow,
)
from projects.database import TestRun as StoredTestRun
from projects.jobs import process_next_run
from projects.runtime import RunResult


def update(client, item, **changes):
    payload = {key: item[key] for key in ("title", "body", "data")}
    payload["expected_revision"] = item["revision"]
    payload.update(changes)
    return client.put(f"/api/items/{item['id']}", json=payload)


def link(client, project, source, target, relation="relates_to"):
    return client.post(
        f"/api/projects/{project['id']}/links",
        json={
            "source_id": source["id"],
            "target_id": target["id"],
            "relation": relation,
        },
    )


def enqueue(client, project, target=None, operation="write_document", **extra):
    payload = {
        "operation": operation,
        "instruction": "원문을 보존하고 문서를 작성한다.",
        "target_id": target["id"] if target else None,
        "skill_ids": ["document-writing-workflow"],
        "source_ids": [],
        "reference_manifest": {},
    }
    payload.update(extra)
    response = client.post(f"/api/projects/{project['id']}/runs", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_accounts_csrf_and_project_isolation(
    app, client, project, create_item
):
    item = create_item()
    assert client.get("/api/session").json()["user"]["username"] == "tester"
    csrf = client.headers.pop("X-CSRF-Token")
    assert (
        client.post("/api/projects", json={"name": "차단"}).status_code == 403
    )
    client.headers["X-CSRF-Token"] = csrf
    assert (
        client.post(
            "/api/projects",
            json={"name": "차단"},
            headers={"Origin": "https://external.invalid"},
        ).status_code
        == 403
    )
    with TestClient(app) as other:
        response = other.post(
            "/api/auth/register",
            json={"username": "other", "password": "other-password-long"},
        )
        other.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        assert other.get(f"/api/items/{item['id']}").status_code == 404
        assert (
            other.get(
                f"/api/projects/{project['id']}/items?q=원문"
            ).status_code
            == 404
        )
        assert (
            other.get(f"/api/items/{item['id']}/portable").status_code == 404
        )
        assert (
            other.get(f"/api/projects/{project['id']}/export").status_code
            == 404
        )
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/projects").status_code == 401
    response = client.post(
        "/api/auth/login",
        json={"username": "tester", "password": "test-password-long"},
    )
    assert response.status_code == 200
    assert len(client.get("/api/projects").json()) == 1


def test_task_cancellation_preserves_reason_and_summary_denominator(
    client, project, create_item
):
    task = create_item("task", "취소할 작업")
    data = {**task["data"], "state": "cancelled"}
    assert update(client, task, data=data).status_code == 422
    assert client.get(f"/api/items/{task['id']}").json()["revision"] == 1
    cancelled = update(
        client,
        task,
        data={**data, "cancellation_reason": "중복 기능으로 범위 제외"},
    ).json()
    assert (
        cancelled["data"]["cancellation_reason"] == "중복 기능으로 범위 제외"
    )
    summary = client.get(f"/api/projects/{project['id']}/summary").json()
    assert summary["tasks"] == {"done": 0, "total": 0, "cancelled": 1}
    baseline = client.post(
        f"/api/projects/{project['id']}/baselines",
        json={"name": "범위 제외 기록"},
    ).json()
    assert baseline["revisions"][task["id"]] == 2


def test_private_sources_cannot_enter_other_users_llm_run(
    app, client, project, create_item
):
    private = create_item(body="private-project-source")
    with TestClient(app) as other:
        response = other.post(
            "/api/auth/register",
            json={"username": "another", "password": "another-password-long"},
        )
        other.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        own = other.post(
            "/api/projects", json={"name": "개인 프로젝트"}
        ).json()
        payload = {
            "operation": "write_document",
            "instruction": "읽을 수 없는 자료 사용 시도",
            "skill_ids": ["document-writing-workflow"],
        }
        for changes in (
            {"source_ids": [private["id"]]},
            {"target_id": private["id"]},
            {"reference_manifest": {"project_source_refs": [private["id"]]}},
        ):
            response = other.post(
                f"/api/projects/{own['id']}/runs", json={**payload, **changes}
            )
            assert response.status_code == 404
            assert private["body"] not in response.text
        assert other.get(f"/api/projects/{own['id']}/runs").json() == []


def test_persistence_revisions_restore_and_conflict(client, create_item):
    original = create_item(body="# 확정할 원문")
    confirmed = client.post(
        f"/api/items/{original['id']}/confirm", json={"expected_revision": 1}
    ).json()
    assert confirmed["status"] == "confirmed"
    changed = update(client, confirmed, body="# 새 초안").json()
    assert changed["status"] == "draft"
    assert update(client, confirmed, body="오래된 수정").status_code == 409
    assert (
        client.get(f"/api/items/{original['id']}").json()["body"]
        == "# 새 초안"
    )
    restored = client.post(
        f"/api/items/{original['id']}/restore",
        json={
            "expected_revision": changed["revision"],
            "revision": confirmed["revision"],
        },
    ).json()
    assert (
        restored["body"] == original["body"] and restored["status"] == "draft"
    )
    history = client.get(f"/api/items/{original['id']}/revisions").json()
    assert len(history) == 4
    assert history[-2]["status"] == "confirmed"


def test_concurrent_save_has_one_winner(client, create_item):
    item = create_item()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda body: update(client, item, body=body),
                ["첫 수정", "둘째 수정"],
            )
        )
    assert sorted(x.status_code for x in results) == [200, 409]
    assert client.get(f"/api/items/{item['id']}").json()["revision"] == 2


def test_cross_project_links_and_dependency_cycles(
    client, project, create_item
):
    first = create_item("task", "작업 A")
    second = create_item("task", "작업 B")
    assert (
        link(client, project, first, second, "depends_on").status_code == 201
    )
    assert (
        link(client, project, second, first, "depends_on").status_code == 409
    )
    assert link(client, project, first, second).status_code == 201
    assert link(client, project, second, first).status_code == 201
    elsewhere = client.post("/api/projects", json={"name": "별도"}).json()
    wrong = client.post(
        f"/api/projects/{elsewhere['id']}/items",
        json={"kind": "idea", "title": "외부 프로젝트", "data": {}},
    ).json()
    assert link(client, project, first, wrong).status_code == 422
    assert (
        client.get(f"/api/projects/{project['id']}/trace").status_code == 200
    )


def test_task_completion_needs_current_case_and_same_commit(
    client, project, create_item
):
    task = create_item(
        "task",
        "구현",
        data={
            "acceptance_criteria": ["보존"],
            "result_url": "https://example.com/result",
            "target_sha": "abc",
        },
    )
    case = create_item(
        "test_case", "회귀", data={"steps": ["복원"], "expected": "원문 보존"}
    )
    assert link(client, project, case, task, "verifies").status_code == 201
    done = {**task["data"], "state": "done"}
    assert update(client, task, data=done).status_code == 409
    endpoint = f"/api/items/{case['id']}/test-runs"
    payload = {
        "outcome": "failed",
        "actual": "내용 손실",
        "environment": "테스트",
        "target_sha": "abc",
    }
    assert client.post(endpoint, json=payload).status_code == 201
    assert update(client, task, data=done).status_code == 409
    assert (
        client.post(
            endpoint,
            json={
                **payload,
                "outcome": "passed",
                "actual": "보존",
                "target_sha": "old",
            },
        ).status_code
        == 201
    )
    assert update(client, task, data=done).status_code == 409
    assert (
        client.post(
            endpoint, json={**payload, "outcome": "passed", "actual": "보존"}
        ).status_code
        == 201
    )
    assert update(client, task, data=done).status_code == 200
    assert (
        len(client.get(f"/api/projects/{project['id']}/test-runs").json()) == 3
    )
    update(client, case, body="기대 추가")
    summary = client.get(f"/api/projects/{project['id']}/summary").json()
    assert summary["tests"] == {"passed": 0, "total": 1}


def test_personal_task_completion_keeps_delivery_gate(
    client, project, create_item
):
    personal = create_item(
        "task",
        "짧은 개인 할 일",
        data={
            "workflow": "personal",
            "estimated_minutes": 15,
            "context": "desk",
            "abc_priority": "A",
            "abc_order": 1,
            "planned_date": "2026-10-21",
            "github_issue_url": "https://github.com/pydemia/projects/issues/12",
        },
    )
    assert personal["data"]["workflow"] == "personal"
    assert personal["data"]["estimated_minutes"] == 15
    completed = update(
        client, personal, data={**personal["data"], "state": "done"}
    )
    assert completed.status_code == 200, completed.text
    completed_task = completed.json()
    reopened = update(
        client,
        completed_task,
        data={**completed_task["data"], "state": "todo"},
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["state"] == "todo"
    delivery = create_item("task", "구현 근거 필요")
    assert (
        update(
            client, delivery, data={**delivery["data"], "state": "done"}
        ).status_code
        == 409
    )
    assert (
        update(
            client, delivery, data={**delivery["data"], "workflow": "personal"}
        ).status_code
        == 409
    )


def test_task_planning_fields_reject_invalid_values(
    client, project, create_item
):
    for data in (
        {"workflow": "personal", "due_date": "2026-02-30"},
        {"workflow": "personal", "estimated_minutes": -1},
        {"workflow": "personal", "abc_priority": "D"},
        {
            "workflow": "personal",
            "github_issue_url": "https://evil.example/issues/1",
        },
    ):
        response = client.post(
            f"/api/projects/{project['id']}/items",
            json={"kind": "task", "title": "유효성 검사", "data": data},
        )
        assert response.status_code == 422, response.text


def test_baseline_snapshot_and_change_review(client, project, create_item):
    req = create_item("requirement", "요구")
    artifact = create_item()
    edge = link(client, project, artifact, req, "implements").json()
    baseline = client.post(
        f"/api/projects/{project['id']}/baselines", json={"name": "v1"}
    ).json()
    changed = update(client, req, body="수용 조건 변경").json()
    trace = client.get(f"/api/projects/{project['id']}/trace").json()
    assert len(trace["stale_links"]) == 1
    assert trace["requirements"][0]["needs_review"] is True
    assert baseline["revisions"][req["id"]] == 1
    assert (
        client.post(
            f"/api/links/{edge['id']}/review",
            json={
                "expected_source_revision": 1,
                "expected_target_revision": changed["revision"],
                "impact": "none",
                "reason": "본문만 보완되어 구현 영향 없음",
            },
        ).status_code
        == 200
    )
    assert (
        client.get(f"/api/projects/{project['id']}/trace").json()[
            "stale_links"
        ]
        == []
    )


def test_catalog_and_manifest_validation(client, project):
    registry = client.get("/api/catalog").json()
    assert registry["source_document_type_count"] == 35
    assert (
        client.post(
            f"/api/projects/{project['id']}/items",
            json={
                "kind": "artifact",
                "title": "잘못된 참조",
                "data": {"template_ref": "missing"},
            },
        ).status_code
        == 422
    )
    info = client.get("/api/runtime").json()
    assert set(info) == {"configured", "provider", "model", "capabilities"}
    assert "api_key" not in json.dumps(info)


def test_document_run_apply_is_explicit_conflict_safe_and_idempotent(
    app, client, project, create_item
):
    item = create_item()
    run = enqueue(client, project, item)
    assert (
        client.get(f"/api/items/{item['id']}").json()["body"] == item["body"]
    )
    assert process_next_run(app.state)
    ready = client.get(f"/api/runs/{run['id']}").json()
    assert ready["status"] == "review_ready"
    assert "원문 스킬" in json.dumps(
        app.state.runner.messages, ensure_ascii=False
    )
    apply_url = f"/api/runs/{run['id']}/apply"
    first = client.post(
        apply_url, json={"selected_indices": [], "apply_document": True}
    )
    second = client.post(
        apply_url, json={"selected_indices": [], "apply_document": True}
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["applied_ids"] == second.json()["applied_ids"]
    assert client.get(f"/api/items/{item['id']}").json()["revision"] == 2
    run2 = enqueue(
        client,
        project,
        client.get(f"/api/items/{item['id']}").json(),
        "revise_document",
    )
    assert process_next_run(app.state)
    current = client.get(f"/api/items/{item['id']}").json()
    assert (
        update(client, current, body="사용자가 편집한 새 원문").status_code
        == 200
    )
    assert (
        client.post(
            f"/api/runs/{run2['id']}/apply",
            json={"selected_indices": [], "apply_document": True},
        ).status_code
        == 409
    )


def test_idea_bundle_connects_selected_requirement_design_task_and_regression(
    app, client, project, create_item
):
    idea = create_item("idea", "부분 복원", "기존 기능에 비교 화면 추가")
    feature = create_item(
        "feature", "문서 복원", data={"current_behavior": "전체 복원"}
    )
    artifact = create_item(title="설" * 300)
    app.state.runner.result = RunResult.model_validate(
        {
            "document": None,
            "review": "설계 수정 제안",
            "assumptions": [],
            "questions": [],
            "source_ids": [idea["id"]],
            "requirements": [
                {
                    "title": "선택 복원",
                    "body": "변경할 절 선택",
                    "acceptance_criteria": ["나머지 절 보존"],
                    "feature_ids": [feature["id"]],
                    "disposition": "extend",
                    "rationale": "전체 복원 확장",
                    "design_changes": [
                        {
                            "artifact_id": artifact["id"],
                            "instruction": "비교 설계 보완",
                        }
                    ],
                    "tasks": [
                        {
                            "title": "선택 처리",
                            "body": "구현",
                            "acceptance_criteria": ["선택 구간만 수정"],
                        }
                    ],
                    "tests": [
                        {
                            "title": "원문 보존 회귀",
                            "steps": ["일부 복원"],
                            "expected": "다른 절 동일",
                        }
                    ],
                }
            ],
        }
    )
    run = enqueue(
        client, project, idea, "analyze_idea", source_ids=[artifact["id"]]
    )
    assert process_next_run(app.state)
    ready = client.get(f"/api/runs/{run['id']}").json()
    assert ready["status"] == "review_ready", ready
    applied = client.post(
        f"/api/runs/{run['id']}/apply", json={"selected_indices": [0]}
    )
    assert applied.status_code == 200, applied.text
    items = client.get(f"/api/projects/{project['id']}/items").json()
    assert len([x for x in items if x["kind"] == "requirement"]) == 1
    assert len([x for x in items if x["kind"] == "task"]) == 2
    assert all(len(x["title"]) <= 300 for x in items)
    assert len([x for x in items if x["kind"] == "test_case"]) == 1
    assert client.get(f"/api/items/{artifact['id']}").json()["revision"] == 1
    assert len(client.get(f"/api/projects/{project['id']}/links").json()) >= 7


def test_idea_dispositions_preserve_conflicts_and_apply_selection_once(
    app, client, project, create_item
):
    idea = create_item("idea", "한 메모의 여러 제안", "기존 동작은 유지한다.")
    feature = create_item("feature", "기존 기능", "기존 기능 원문")
    original = client.get(f"/api/items/{feature['id']}").json()
    candidates = []
    for disposition in ("new", "extend", "duplicate", "conflict", "defer"):
        candidates.append(
            {
                "title": disposition,
                "body": f"{disposition} 후보의 원문",
                "acceptance_criteria": ["결정 전 기존 동작 보존"],
                "feature_ids": [feature["id"]] if disposition != "new" else [],
                "disposition": disposition,
                "rationale": "원문과 기존 기능 대조 결과",
                "design_changes": [],
                "tasks": [
                    {
                        "title": "중복 생성 금지",
                        "body": "채택 범위",
                        "acceptance_criteria": ["한 번만 생성"],
                    }
                ],
                "tests": [],
            }
        )
    app.state.runner.result = RunResult(
        document=None,
        review="검토 결과",
        requirements=candidates,
        assumptions=[],
        questions=[],
        source_ids=[idea["id"], feature["id"]],
    )
    run = enqueue(client, project, idea, "analyze_idea")
    assert process_next_run(app.state)
    selected = {"selected_indices": [1, 2, 3, 4], "apply_document": False}
    response = client.post(f"/api/runs/{run['id']}/apply", json=selected)
    assert response.status_code == 200, response.text
    before = client.get(f"/api/projects/{project['id']}/items").json()
    assert Counter(row["kind"] for row in before) == {
        "idea": 1,
        "feature": 1,
        "requirement": 1,
        "task": 1,
        "decision": 4,
    }
    assert {
        row["data"]["disposition"]
        for row in before
        if row["kind"] == "requirement"
    } == {"extend"}
    assert {row["title"] for row in before if row["kind"] == "decision"} >= {
        "duplicate",
        "conflict",
        "defer",
    }
    assert client.get(f"/api/items/{feature['id']}").json() == original
    assert (
        client.post(f"/api/runs/{run['id']}/apply", json=selected).status_code
        == 200
    )
    assert client.get(f"/api/projects/{project['id']}/items").json() == before


def test_failure_retry_keeps_inputs_rules_and_events(app, client, project):
    run = enqueue(client, project)
    app.state.runner.result = RunResult(
        document="fake",
        review="",
        requirements=[],
        assumptions=[],
        questions=[],
        source_ids=["hallucinated"],
    )
    assert process_next_run(app.state)
    failed = client.get(f"/api/runs/{run['id']}").json()
    assert failed["status"] == "failed"
    assert client.post(f"/api/runs/{run['id']}/retry").status_code == 200
    app.state.runner.result = RunResult(
        document="회복",
        review="",
        requirements=[],
        assumptions=[],
        questions=[],
        source_ids=[],
    )
    assert process_next_run(app.state)
    ready = client.get(f"/api/runs/{run['id']}").json()
    assert ready["status"] == "review_ready"
    assert ready["skills_lock"] == failed["skills_lock"]
    assert any(x["status"] == "failed" for x in ready["events"])


def test_expired_lease_recovers_without_duplicate_apply(app, client, project):
    run = enqueue(client, project)
    with Session(app.state.engine) as db, db.begin():
        row = db.get(SkillRun, run["id"])
        row.status = "running"
        row.attempt = 1
        row.lease_until = utcnow() - timedelta(seconds=1)
    assert process_next_run(app.state)
    restored = client.get(f"/api/runs/{run['id']}").json()
    assert restored["status"] == "review_ready"
    assert restored["attempt"] == 2
    assert any(x["status"] == "interrupted" for x in restored["events"])


def test_cancelled_run_does_not_apply(app, client, project):
    run = enqueue(client, project)
    assert (
        client.post(f"/api/runs/{run['id']}/cancel").json()["status"]
        == "cancelled"
    )
    assert not process_next_run(app.state)
    assert (
        client.post(
            f"/api/runs/{run['id']}/apply", json={"selected_indices": []}
        ).status_code
        == 409
    )


def test_standalone_export_preserves_body_skill_and_reference_manifest(
    client, create_item
):
    item = create_item(
        data={
            "template_ref": "ARC42",
            "template_version": "v1",
            "inspection_status": "inaccessible",
        }
    )
    response = client.get(f"/api/items/{item['id']}/portable")
    assert response.status_code == 200
    with ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.read("document.md").decode() == item["body"]
        assert (
            "원문 스킬"
            in archive.read(
                "skills/document-writing-workflow/SKILL.md"
            ).decode()
        )
        assert (
            json.loads(archive.read("references.json"))["inspection_status"]
            == "inaccessible"
        )
        assert not any(
            "auth" in name or "config" in name for name in archive.namelist()
        )
        base = json.loads(archive.read("base.json"))
    body = "# 외부 편집"
    payload = {
        "base_revision": base["revision"],
        "base_sha256": base["sha256"],
        "body": body,
    }
    preview = client.post(
        f"/api/items/{item['id']}/reconnect", json=payload
    ).json()
    assert preview["conflict"] is False and "external.md" in preview["diff"]
    assert (
        client.get(f"/api/items/{item['id']}").json()["body"] == item["body"]
    )
    assert (
        client.post(
            f"/api/items/{item['id']}/reconnect",
            json={**payload, "preview": False},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/items/{item['id']}/reconnect",
            json={**payload, "body": "충돌", "preview": False},
        ).status_code
        == 409
    )


def test_archive_import_hash_and_identity_collision(
    client, project, create_item
):
    create_item("requirement", "근거")
    archive = client.get(f"/api/projects/{project['id']}/export")
    encoded = base64.b64encode(archive.content).decode()
    assert (
        client.post(
            "/api/projects/import", json={"archive_base64": encoded}
        ).status_code
        == 409
    )
    bad = base64.b64encode(b"not zip").decode()
    assert (
        client.post(
            "/api/projects/import", json={"archive_base64": bad}
        ).status_code
        == 422
    )
    with ZipFile(io.BytesIO(archive.content)) as zipped:
        data = json.loads(zipped.read("data.json"))
        assert "owner_id" not in data["project"]
        assert "accounts" not in data and "login_sessions" not in data


def test_authentication_and_request_size_do_not_echo_secret(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "tester", "password": "wrong-password-secret"},
    )
    assert response.status_code == 401
    assert "wrong-password-secret" not in response.text
    response = client.post(
        "/api/projects",
        content="{}",
        headers={"Content-Length": str(20 * 1024 * 1024)},
    )
    assert response.status_code == 413


def test_archive_restores_revision_links_and_baseline(
    app, client, project, create_item
):
    requirement = create_item("requirement", "원안", body="변경 전")
    artifact = create_item()
    assert (
        link(client, project, artifact, requirement, "implements").status_code
        == 201
    )
    assert update(client, requirement, body="변경 후").status_code == 200
    baseline = client.post(
        f"/api/projects/{project['id']}/baselines", json={"name": "복구 기준"}
    ).json()
    original_items = client.get(f"/api/projects/{project['id']}/items").json()
    original_links = client.get(f"/api/projects/{project['id']}/links").json()
    archive = client.get(f"/api/projects/{project['id']}/export").content
    # Only records created by this test in its isolated schema are removed.
    with Session(app.state.engine) as db, db.begin():
        for model in (SkillRun, StoredTestRun, Baseline, Link):
            db.execute(delete(model).where(model.project_id == project["id"]))
        db.execute(
            delete(Revision).where(
                Revision.item_id.in_([x["id"] for x in original_items])
            )
        )
        db.execute(delete(Item).where(Item.project_id == project["id"]))
        db.execute(delete(Project).where(Project.id == project["id"]))
    response = client.post(
        "/api/projects/import",
        json={"archive_base64": base64.b64encode(archive).decode()},
    )
    assert response.status_code == 201, response.text
    restored = client.get(f"/api/projects/{project['id']}/items").json()
    assert restored == original_items
    assert (
        client.get(f"/api/projects/{project['id']}/links").json()
        == original_links
    )
    assert (
        client.get(f"/api/projects/{project['id']}/baselines").json()[0]
        == baseline
    )
    revisions = client.get(f"/api/items/{requirement['id']}/revisions").json()
    assert [x["body"] for x in revisions] == ["변경 후", "변경 전"]


def test_review_can_be_recorded_without_rewriting_document(
    app, client, project, create_item
):
    document = create_item()
    app.state.runner.result = RunResult(
        document="적용하지 않을 검수용 본문",
        review="검수 소견",
        requirements=[],
        assumptions=[],
        questions=[],
        source_ids=[],
    )
    run = enqueue(client, project, document, "review_document")
    assert process_next_run(app.state)
    response = client.post(
        f"/api/runs/{run['id']}/apply",
        json={"selected_indices": [], "apply_document": False},
    )
    assert response.status_code == 200
    assert client.get(f"/api/items/{document['id']}").json() == document
    records = client.get(
        f"/api/projects/{project['id']}/items?kind=decision"
    ).json()
    assert records[0]["body"] == "검수 소견"


def test_unselected_document_is_not_created_with_selected_requirement(
    app, client, project, create_item
):
    idea = create_item("idea", "선택할 원안")
    app.state.runner.result = RunResult.model_validate(
        {
            "document": "선택하지 않은 부가 문서",
            "review": "초안 제안",
            "assumptions": [],
            "questions": [],
            "source_ids": [],
            "requirements": [
                {
                    "title": "선택 요건",
                    "body": "요건 내용",
                    "acceptance_criteria": ["조건"],
                    "feature_ids": [],
                    "disposition": "new",
                    "rationale": "근거",
                    "design_changes": [],
                    "tasks": [],
                    "tests": [],
                }
            ],
        }
    )
    run = enqueue(client, project, idea, "analyze_idea")
    assert process_next_run(app.state)
    response = client.post(
        f"/api/runs/{run['id']}/apply",
        json={"selected_indices": [0], "apply_document": False},
    )
    assert response.status_code == 200
    items = client.get(f"/api/projects/{project['id']}/items").json()
    assert not any(x["kind"] == "artifact" for x in items)
    assert len([x for x in items if x["kind"] == "requirement"]) == 1


def test_document_apply_requires_explicit_selection(app, client, project):
    run = enqueue(client, project)
    assert process_next_run(app.state)
    response = client.post(
        f"/api/runs/{run['id']}/apply", json={"selected_indices": []}
    )
    assert response.status_code == 422
    assert (
        client.get(f"/api/runs/{run['id']}").json()["status"] == "review_ready"
    )
