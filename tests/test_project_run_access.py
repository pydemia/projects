"""Queued run grants are rechecked against isolated real PostgreSQL schemas."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects import project_access as access_policy
from projects.codex_runner import CodexLoginRunner
from projects.database import (
    Account,
    Item,
    Project,
    ProjectMembership,
    ProjectRole,
    SkillRun,
)
from projects.domain import Problem
from projects.jobs import (
    apply_result,
    authorize_run_request,
    enqueue_run,
    process_next_run,
    run_is_readable,
)
from projects.runtime import RunResult
from projects.schemas import RunInput
from projects.task_transfers import commit_transfer, preview_transfer
from projects.transfer_schemas import TransferCommit, TransferPreview


def enqueue_editor_run(app, project, source_ids=None):
    with Session(app.state.engine) as db, db.begin():
        editor = Account(username="run-editor", password_hash="unused")
        db.add(editor)
        db.flush()
        role = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == project["id"],
                ProjectRole.preset == "editor",
            )
        )
        assert role is not None
        member = ProjectMembership(
            project_id=project["id"], account_id=editor.id, role_id=role.id
        )
        db.add(member)
        db.flush()
        run = enqueue_run(
            db,
            app.state,
            project["id"],
            editor.id,
            RunInput(
                operation="write_document",
                instruction="검증 문서 작성",
                skill_ids=["document-writing-workflow"],
                source_ids=source_ids or [],
            ),
        )
        assert run.requested_by == editor.id
        assert run.requested_membership_id == member.id
        return run.id, editor.id, member.id


@pytest.mark.parametrize("target_access", ["readable", "hidden", "missing"])
def test_enqueue_rejects_foreign_or_missing_target_without_foreign_lock(
    app, client, project, monkeypatch, target_access
):
    destination = client.post(
        "/api/projects", json={"name": "다른 실행 대상"}
    ).json()
    response = client.post(
        f"/api/projects/{destination['id']}/items",
        json={
            "kind": "artifact",
            "title": "외부 문서",
            "body": "",
            "data": {},
        },
    )
    assert response.status_code == 201, response.text
    target_id = response.json()["id"]
    if target_access == "missing":
        target_id = "missing-run-target"
    elif target_access == "hidden":
        with Session(app.state.engine) as db, db.begin():
            row = db.get(Project, destination["id"])
            outsider = Account(
                username="private-target-owner", password_hash="unused"
            )
            db.add(outsider)
            db.flush()
            owner = db.scalar(
                select(ProjectMembership).where(
                    ProjectMembership.project_id == row.id,
                    ProjectMembership.account_id == row.owner_id,
                )
            )
            # Keep an actual owner, but remove the enqueuing actor's grant.
            owner.account_id = outsider.id
    locked_projects = []
    original = access_policy.lock_project_access

    def record_project_locks(db, ids):
        current_ids = list(ids)
        locked_projects.extend(current_ids)
        original(db, current_ids)

    monkeypatch.setattr(
        access_policy, "lock_project_access", record_project_locks
    )
    with Session(app.state.engine) as db:
        owner_id = db.get(Project, project["id"]).owner_id
        with pytest.raises(Problem) as error:
            enqueue_run(
                db,
                app.state,
                project["id"],
                owner_id,
                RunInput(
                    operation="revise_document",
                    instruction="범위 검사",
                    target_id=target_id,
                    skill_ids=["document-writing-workflow"],
                ),
            )
        assert error.value.status == (
            422 if target_access == "readable" else 404
        )
    assert project["id"] in locked_projects
    assert destination["id"] not in locked_projects


def change_grant(app, project_id, actor_id, change):
    with Session(app.state.engine) as db, db.begin():
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project_id,
                ProjectMembership.account_id == actor_id,
            )
        )
        assert member is not None
        if change == "archive":
            row = db.get(Project, project_id)
            row.archived = True
        elif change == "role_permissions":
            role = db.get(ProjectRole, member.role_id)
            role.permissions = [
                value for value in role.permissions if value != "run.execute"
            ]
            role.revision += 1
        elif change == "downgrade":
            viewer = db.scalar(
                select(ProjectRole).where(
                    ProjectRole.project_id == project_id,
                    ProjectRole.preset == "viewer",
                )
            )
            assert viewer is not None
            member.role_id = viewer.id
        else:
            role_id = member.role_id
            db.delete(member)
            db.flush()
            if change == "rejoin":
                db.add(
                    ProjectMembership(
                        project_id=project_id,
                        account_id=actor_id,
                        role_id=role_id,
                    )
                )
        row = db.get(Project, project_id)
        assert row is not None
        row.access_revision += 1


@pytest.mark.parametrize(
    "change", ["remove", "downgrade", "rejoin", "archive", "role_permissions"]
)
@pytest.mark.parametrize("checkpoint", ["claim", "before_send"])
def test_worker_never_sends_after_request_grant_changes(
    app, project, monkeypatch, change, checkpoint
):
    run_id, actor_id, membership_id = enqueue_editor_run(app, project)
    if checkpoint == "claim":
        change_grant(app, project["id"], actor_id, change)
    else:
        original = app.state.resolver.read_bundle

        def read_and_revoke(cache_key):
            bundle = original(cache_key)
            change_grant(app, project["id"], actor_id, change)
            return bundle

        monkeypatch.setattr(app.state.resolver, "read_bundle", read_and_revoke)
    assert process_next_run(app.state)
    assert app.state.runner.messages == []
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run.status == "failed"
        assert run.requested_by == actor_id
        assert run.requested_membership_id == membership_id
        assert run.result is None
        assert "권한" in run.error


def test_explicit_retry_binds_current_rejoined_membership(app, project):
    run_id, actor_id, previous_membership = enqueue_editor_run(app, project)
    change_grant(app, project["id"], actor_id, "rejoin")
    assert process_next_run(app.state)
    assert app.state.runner.messages == []
    with Session(app.state.engine) as db, db.begin():
        run = db.get(SkillRun, run_id)
        assert run.status == "failed"
        original_locks = run.skills_lock
        authorize_run_request(db, run, actor_id)
        assert run.requested_membership_id != previous_membership
        run.status = "queued"
        run.error = None
    assert process_next_run(app.state)
    assert app.state.runner.messages
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run.status == "review_ready"
        assert run.skills_lock == original_locks


def test_retry_cannot_restore_a_downgraded_actor(app, project):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    change_grant(app, project["id"], actor_id, "downgrade")
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        with pytest.raises(Problem) as error:
            authorize_run_request(db, run, actor_id)
        assert error.value.status == 403
    assert app.state.runner.messages == []


def test_retry_endpoint_rebinds_to_the_current_requesting_editor(
    app, client, project
):
    run_id, actor_id, previous_membership = enqueue_editor_run(app, project)
    change_grant(app, project["id"], actor_id, "remove")
    assert process_next_run(app.state)
    response = client.post(f"/api/runs/{run_id}/retry")
    assert response.status_code == 200, response.text
    with Session(app.state.engine) as db:
        row = db.get(Project, project["id"])
        run = db.get(SkillRun, run_id)
        assert run.requested_by == row.owner_id
        assert run.requested_membership_id != previous_membership
    assert process_next_run(app.state)
    assert app.state.runner.messages


def test_codex_rechecks_grant_after_waiting_for_runner_lock(
    app, project, monkeypatch
):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    runner = CodexLoginRunner(app.state.settings)
    original_run = runner.run

    def revoke_then_enter_runner(messages, *, cancelled=None):
        change_grant(app, project["id"], actor_id, "remove")
        return original_run(messages, cancelled=cancelled)

    def reject_external_command():
        pytest.fail("권한 철회 후 Codex 외부 명령을 시작했습니다.")

    monkeypatch.setattr(runner, "run", revoke_then_enter_runner)
    monkeypatch.setattr(
        "projects.codex_runner._command", reject_external_command
    )
    app.state.runner = runner
    assert process_next_run(app.state)
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run.status == "failed"
        assert run.result is None


def test_legacy_run_binds_only_actual_owner_membership(app, project):
    with Session(app.state.engine) as db, db.begin():
        row = db.get(Project, project["id"])
        run = SkillRun(
            project_id=row.id,
            operation="write_document",
            instruction="기존 대기 실행",
        )
        db.add(run)
        db.flush()
        run_id = run.id
        owner_id = row.owner_id
    assert process_next_run(app.state)
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        owner_member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"],
                ProjectMembership.account_id == owner_id,
            )
        )
        assert run.status == "review_ready"
        assert run.requested_by == owner_id
        assert run.requested_membership_id == owner_member.id


def test_legacy_owner_id_does_not_restore_removed_membership(app, project):
    with Session(app.state.engine) as db, db.begin():
        row = db.get(Project, project["id"])
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == row.id,
                ProjectMembership.account_id == row.owner_id,
            )
        )
        db.delete(member)
        run = SkillRun(
            project_id=row.id,
            operation="write_document",
            instruction="이관 전 실행",
        )
        db.add(run)
        db.flush()
        run_id = run.id
    assert process_next_run(app.state)
    assert app.state.runner.messages == []
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run.status == "failed"
        assert run.requested_by is None


def test_current_owner_can_apply_result_after_requester_removed(app, project):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    assert process_next_run(app.state)
    change_grant(app, project["id"], actor_id, "remove")
    with Session(app.state.engine) as db, db.begin():
        row = db.get(Project, project["id"])
        run = db.get(SkillRun, run_id)
        apply_result(db, run, row.owner_id, [], apply_document=True)
        assert run.status == "applied"
        assert run.requested_by == actor_id


def test_run_apply_also_requires_the_actual_output_write_grant(app, project):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    assert process_next_run(app.state)
    with Session(app.state.engine) as db, db.begin():
        role = ProjectRole(
            project_id=project["id"],
            name="문서 쓰기 없는 적용",
            preset="custom",
            permissions=["project.read", "run.apply", "task.create"],
        )
        db.add(role)
        db.flush()
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"],
                ProjectMembership.account_id == actor_id,
            )
        )
        member.role_id = role.id
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        before = list(db.scalars(select(Item.id)))
        with pytest.raises(Problem) as error:
            apply_result(db, run, actor_id, [], apply_document=True)
        assert error.value.status == 403
        assert run.status == "review_ready"
        assert list(db.scalars(select(Item.id))) == before


def move_run_input_to_readable_project(app, client, project, create_item):
    source = create_item(
        "task", "이동할 실행 입력", data={"workflow": "personal"}
    )
    run_id, actor_id, _ = enqueue_editor_run(app, project, [source["id"]])
    assert process_next_run(app.state)
    app.state.runner.messages = []
    response = client.post("/api/projects", json={"name": "입력 이동 대상"})
    assert response.status_code == 201, response.text
    target_project = response.json()
    with Session(app.state.engine) as db, db.begin():
        viewer = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == target_project["id"],
                ProjectRole.preset == "viewer",
            )
        )
        db.add(
            ProjectMembership(
                project_id=target_project["id"],
                account_id=actor_id,
                role_id=viewer.id,
            )
        )
        db.flush()
        owner_id = db.get(Project, project["id"]).owner_id
        payload = TransferPreview(
            tasks=[
                {"id": source["id"], "expected_revision": source["revision"]}
            ],
            target_project_id=target_project["id"],
        )
        preview = preview_transfer(db, owner_id, payload)
        commit_transfer(
            db,
            owner_id,
            TransferCommit(
                **payload.model_dump(),
                preview_token=preview["preview_token"],
                operation_id="move-run-source",
            ),
        )
        # Completed historical inputs may move. An explicit new request must
        # bind current grants before those same locked inputs are queued again.
        run = db.get(SkillRun, run_id)
        assert run.status == "review_ready"
        run.status = "cancelled"
        authorize_run_request(db, run, actor_id)
        run.status = "queued"
    return run_id, actor_id, target_project["id"], source["id"]


@pytest.mark.parametrize("checkpoint", ["claim", "before_send"])
def test_worker_never_sends_moved_source_after_destination_read_revoked(
    app, client, project, create_item, monkeypatch, checkpoint
):
    run_id, actor_id, destination, source_id = (
        move_run_input_to_readable_project(app, client, project, create_item)
    )
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run_is_readable(db, run, actor_id)
        assert run.source_snapshots[0]["project_id"] == project["id"]
        assert db.get(Item, source_id).project_id == destination
    if checkpoint == "claim":
        change_grant(app, destination, actor_id, "remove")
    else:
        original = app.state.resolver.read_bundle

        def read_and_revoke(cache_key):
            bundle = original(cache_key)
            change_grant(app, destination, actor_id, "remove")
            return bundle

        monkeypatch.setattr(app.state.resolver, "read_bundle", read_and_revoke)
    assert process_next_run(app.state)
    assert app.state.runner.messages == []
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        assert run.status == "failed"
        assert not run_is_readable(db, run, actor_id)
        assert destination not in run.error
        assert source_id not in run.error


def test_apply_denies_result_when_a_source_moves_outside_current_read_access(
    app, client, project, create_item
):
    run_id, actor_id, destination, _ = move_run_input_to_readable_project(
        app, client, project, create_item
    )
    assert process_next_run(app.state)
    change_grant(app, destination, actor_id, "remove")
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        with pytest.raises(Problem) as error:
            apply_result(db, run, actor_id, [], apply_document=True)
        assert error.value.status == 404
        assert destination not in error.value.detail
        assert run.status == "review_ready"


@pytest.mark.parametrize("reference", ["target", "applied", "source"])
def test_full_run_read_requires_current_project_of_every_referenced_item(
    app, client, project, create_item, reference
):
    run_id, actor_id, destination, source_id = (
        move_run_input_to_readable_project(app, client, project, create_item)
    )
    change_grant(app, destination, actor_id, "remove")
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        snapshot = run.source_snapshots[0]
        run.source_snapshots = []
        if reference == "target":
            run.target_id = source_id
        elif reference == "applied":
            run.applied_ids = [source_id]
        else:
            run.source_snapshots = [snapshot]
        assert not run_is_readable(db, run, actor_id)


@pytest.mark.parametrize("known_project", [True, False])
def test_missing_historical_source_requires_a_readable_snapshot_project(
    app, project, known_project
):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        snapshot = {"id": "missing-historical-source"}
        if known_project:
            snapshot["project_id"] = project["id"]
        run.source_snapshots = [snapshot]
        assert run_is_readable(db, run, actor_id) is known_project


@pytest.mark.parametrize(
    "reference",
    [
        "source_ids",
        "feature_ids",
        "artifact_id",
        "manifest",
        "requirement_ids",
    ],
)
def test_run_read_resolves_structured_result_and_manifest_references(
    app, client, project, create_item, reference
):
    run_id, actor_id, destination, source_id = (
        move_run_input_to_readable_project(app, client, project, create_item)
    )
    change_grant(app, destination, actor_id, "remove")
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        run.source_snapshots = []
        if reference == "manifest":
            run.reference_manifest = {"project_source_refs": [source_id]}
        elif reference == "artifact_id":
            run.result = {
                "requirements": [
                    {"design_changes": [{"artifact_id": source_id}]}
                ]
            }
        else:
            run.result = {"requirements": [{reference: [source_id]}]}
        assert not run_is_readable(db, run, actor_id)


def test_run_read_does_not_interpret_generated_ids_or_freeform_text(
    app, client, project, create_item
):
    run_id, actor_id, destination, source_id = (
        move_run_input_to_readable_project(app, client, project, create_item)
    )
    change_grant(app, destination, actor_id, "remove")
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        run.source_snapshots = []
        run.result = {
            "requirements": [{"id": source_id}],
            "document": source_id,
            "review": '{"source_ids": ["' + source_id + '"]}',
        }
        assert run_is_readable(db, run, actor_id)


@pytest.mark.parametrize(
    "missing", ["task.create", "test.write", "relation.write"]
)
def test_apply_checks_selected_task_test_and_relation_outputs(
    app, project, missing
):
    run_id, actor_id, _ = enqueue_editor_run(app, project)
    app.state.runner.result = RunResult.model_validate(
        {
            "document": None,
            "review": "업무 후보",
            "requirements": [
                {
                    "title": "권한별 결과",
                    "body": "본문",
                    "acceptance_criteria": ["통과"],
                    "feature_ids": [],
                    "disposition": "new",
                    "rationale": "검증",
                    "design_changes": [],
                    "tasks": [
                        {
                            "title": "작업",
                            "body": "본문",
                            "acceptance_criteria": ["통과"],
                        }
                    ],
                    "tests": [
                        {
                            "title": "시험",
                            "steps": ["실행"],
                            "expected": "통과",
                        }
                    ],
                }
            ],
            "assumptions": [],
            "questions": [],
            "source_ids": [],
        }
    )
    assert process_next_run(app.state)
    with Session(app.state.engine) as db, db.begin():
        role = ProjectRole(
            project_id=project["id"],
            name="출력 일부 제한",
            preset="custom",
            permissions=[
                value
                for value in (
                    "project.read",
                    "run.apply",
                    "item.write",
                    "task.create",
                    "test.write",
                    "relation.write",
                )
                if value != missing
            ],
        )
        db.add(role)
        db.flush()
        member = db.scalar(
            select(ProjectMembership).where(
                ProjectMembership.project_id == project["id"],
                ProjectMembership.account_id == actor_id,
            )
        )
        member.role_id = role.id
    with Session(app.state.engine) as db:
        run = db.get(SkillRun, run_id)
        before = list(db.scalars(select(Item.id)))
        with pytest.raises(Problem) as error:
            apply_result(db, run, actor_id, [0])
        assert error.value.status == 403
        assert run.status == "review_ready"
        assert list(db.scalars(select(Item.id))) == before
