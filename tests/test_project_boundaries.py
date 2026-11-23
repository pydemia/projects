"""Project sharing, provenance and transfers on isolated PostgreSQL schemas."""

import base64
import json

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from projects.database import (
    Account,
    Project,
    ProjectMembership,
    ProjectRole,
    ProjectTaskFieldDefinition,
    SkillRun,
    TaskFieldDefinition,
    TaskView,
)
from projects.domain import Problem
from projects.portable import export_project, import_project, read_archive
from projects.project_access import initialize_project_access
from projects.records import (
    add_link,
    check_task_completion,
    create_item,
    item_for_user,
    project_for_user,
    serialize,
    trace,
)
from projects.task_context import task_context
from projects.task_transfers import (
    commit_transfer,
    operation_result,
    preview_transfer,
    undo_transfer,
)
from projects.transfer_schemas import (
    TransferCommit,
    TransferPreview,
    TransferUndo,
)


def membership(db, project, account, preset):
    role = db.scalar(
        select(ProjectRole).where(
            ProjectRole.project_id == project.id, ProjectRole.preset == preset
        )
    )
    row = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project.id,
            ProjectMembership.account_id == account.id,
        )
    )
    if row is None:
        row = ProjectMembership(
            project_id=project.id, account_id=account.id, role_id=role.id
        )
        db.add(row)
    else:
        row.role_id = role.id
    project.access_revision += 1
    db.flush()
    return row


@pytest.fixture
def shared(engine):
    with Session(engine) as db, db.begin():
        owner, editor, viewer, outsider = [
            Account(username=name, password_hash="unused")
            for name in ("owner", "A-editor", "B-viewer", "C-outsider")
        ]
        db.add_all([owner, editor, viewer, outsider])
        db.flush()
        source, target = [
            Project(owner_id=owner.id, name=name)
            for name in ("source", "private-target")
        ]
        db.add_all([source, target])
        db.flush()
        for project in (source, target):
            initialize_project_access(db, project)
            membership(db, project, editor, "editor")
        membership(db, source, viewer, "viewer")
        task = create_item(
            db,
            source.id,
            "task",
            "shared task",
            "body",
            {"workflow": "personal"},
        )
        yield db, owner, editor, viewer, outsider, source, target, task


def transfer_request(task, target):
    return TransferPreview(
        tasks=[{"id": task.id, "expected_revision": task.revision}],
        target_project_id=target.id,
    )


def test_shared_read_uses_membership_and_viewer_cannot_write(shared):
    db, _, editor, viewer, outsider, source, _, task = shared
    assert item_for_user(db, task.id, editor.id).id == task.id
    assert item_for_user(db, task.id, viewer.id).id == task.id
    with pytest.raises(Problem) as forbidden:
        project_for_user(db, source.id, viewer.id, "task.create")
    assert forbidden.value.status == 403
    with pytest.raises(Problem) as missing:
        item_for_user(db, task.id, outsider.id)
    assert missing.value.status == 404


def test_trace_hides_foreign_endpoints_and_completion_fails_closed(shared):
    db, _, editor, viewer, _, source, target, task = shared
    dependency = create_item(
        db,
        target.id,
        "task",
        "private task",
        "secret",
        {"workflow": "personal"},
    )
    add_link(db, source.id, task, dependency, "depends_on", actor_id=editor.id)
    visible = json.dumps(trace(db, source.id, actor_id=viewer.id))
    assert target.id not in visible and dependency.id not in visible
    assert "private task" not in visible
    with pytest.raises(Problem) as blocked:
        check_task_completion(
            db, task, {**task.data, "state": "done"}, actor_id=viewer.id
        )
    assert blocked.value.status == 409
    assert target.id not in str(blocked.value)


def test_export_includes_only_requesting_actors_personal_views(shared):
    db, owner, editor, viewer, _, source, _, _ = shared
    for account in (owner, editor, viewer):
        db.add(
            TaskView(
                owner_id=account.id,
                project_id=source.id,
                name=account.username,
                scope="personal",
                settings={},
            )
        )
    db.flush()
    archive = read_archive(
        base64.b64encode(
            export_project(db, source, actor_id=viewer.id)
        ).decode()
    )
    assert [row["name"] for row in archive["task_views"]] == [viewer.username]
    assert "owner_id" not in archive["project"]
    assert "access_revision" not in archive["project"]


def test_full_export_rejects_inaccessible_provenance(shared):
    db, _, editor, viewer, _, source, target, task = shared
    foreign = create_item(
        db,
        target.id,
        "task",
        "private task",
        "secret",
        {"workflow": "personal"},
    )
    add_link(db, source.id, task, foreign, "relates_to", actor_id=editor.id)
    with pytest.raises(Problem) as blocked:
        export_project(db, source, actor_id=viewer.id)
    assert blocked.value.status == 409
    allowed = read_archive(
        base64.b64encode(
            export_project(db, source, actor_id=editor.id)
        ).decode()
    )
    assert foreign.id in {
        row["id"] for row in allowed["external_references"]["items"]
    }


def test_transfer_preview_invalidates_on_audience_change(shared):
    db, _, editor, viewer, _, _, target, task = shared
    request = transfer_request(task, target)
    preview = preview_transfer(db, editor.id, request)
    assert preview["audience_changes"] == [
        {
            "id": task.id,
            "audience_changed": True,
            "new_reader_count": 0,
            "removed_reader_count": 1,
        }
    ]
    membership(db, target, viewer, "viewer")
    with pytest.raises(Problem) as stale:
        commit_transfer(
            db,
            editor.id,
            TransferCommit(
                **request.model_dump(),
                preview_token=preview["preview_token"],
                operation_id="stale-acl",
            ),
        )
    assert stale.value.status == 409
    assert task.project_id != target.id and task.revision == 1


def test_transfer_receipts_retry_and_undo_recheck_current_permissions(shared):
    db, _, editor, _, _, _, target, task = shared
    request = transfer_request(task, target)
    preview = preview_transfer(db, editor.id, request)
    command = TransferCommit(
        **request.model_dump(),
        preview_token=preview["preview_token"],
        operation_id="move",
    )
    result = commit_transfer(db, editor.id, command)
    membership(db, target, editor, "viewer")
    for operation in (
        lambda: operation_result(db, editor.id, "move"),
        lambda: commit_transfer(db, editor.id, command),
        lambda: undo_transfer(
            db,
            editor.id,
            result["transfer_id"],
            TransferUndo(operation_id="undo"),
        ),
    ):
        with pytest.raises(Problem) as forbidden:
            operation()
        assert forbidden.value.status == 403
    assert task.project_id == target.id and task.revision == 2


def test_task_context_omits_revoked_transfer_and_original_run(shared):
    db, _, editor, viewer, _, source, target, task = shared
    db.add(
        SkillRun(
            project_id=source.id,
            applied_ids=[task.id],
            operation="plan",
            instruction="",
            status="review_ready",
        )
    )
    db.flush()
    assert len(task_context(db, editor.id, task.id)["origin_runs"]) == 1
    request = transfer_request(task, target)
    preview = preview_transfer(db, editor.id, request)
    commit_transfer(
        db,
        editor.id,
        TransferCommit(
            **request.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="move-context",
        ),
    )
    membership(db, target, viewer, "viewer")
    source_member = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == source.id,
            ProjectMembership.account_id == viewer.id,
        )
    )
    db.delete(source_member)
    source.access_revision += 1
    db.flush()
    context = task_context(db, viewer.id, task.id)
    assert context["transfers"] == [] and context["origin_runs"] == []
    assert source.id not in json.dumps(
        context
    ) and source.name not in json.dumps(context)
    with pytest.raises(Problem) as incomplete_export:
        export_project(db, target, actor_id=viewer.id)
    assert incomplete_export.value.status == 409


def test_import_initializes_fresh_owner_membership(shared):
    db, owner, _, _, outsider, source, _, _ = shared
    empty = Project(owner_id=owner.id, name="empty archive")
    db.add(empty)
    db.flush()
    initialize_project_access(db, empty)
    archive = export_project(db, empty, actor_id=owner.id)
    db.delete(empty)
    db.flush()
    restored = import_project(
        db, outsider.id, base64.b64encode(archive).decode()
    )
    assert restored.owner_id == outsider.id
    assert (
        project_for_user(db, restored.id, outsider.id, "member.manage").id
        == restored.id
    )
    with pytest.raises(Problem) as denied:
        project_for_user(db, restored.id, owner.id)
    assert denied.value.status == 404


def test_import_does_not_restore_requester_or_publish_personal_library(shared):
    db, owner, _, _, outsider, _, _, _ = shared
    empty = Project(owner_id=owner.id, name="run archive")
    db.add(empty)
    db.flush()
    initialize_project_access(db, empty)
    owner_membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == empty.id,
            ProjectMembership.account_id == owner.id,
        )
    )
    run = SkillRun(
        project_id=empty.id,
        operation="plan",
        instruction="",
        status="queued",
        requested_by=owner.id,
        requested_membership_id=owner_membership.id,
    )
    private_field = TaskFieldDefinition(
        owner_id=outsider.id, name="private", type="text", options=[]
    )
    db.add_all([run, private_field])
    db.flush()
    archive = export_project(db, empty, actor_id=owner.id)
    run_id = run.id
    db.delete(run)
    db.flush()
    db.delete(empty)
    db.flush()
    restored = import_project(
        db, outsider.id, base64.b64encode(archive).decode()
    )
    restored_run = db.get(SkillRun, run_id)
    assert restored_run.status == "failed"
    assert restored_run.requested_by is None
    assert restored_run.requested_membership_id is None
    assert (
        db.get(ProjectTaskFieldDefinition, (restored.id, private_field.id))
        is None
    )


def test_portable_http_rejects_source_snapshot_moved_to_hidden_project(
    app, client, project, create_item
):
    source = create_item(
        "task",
        title="consumed source",
        body="private consumed body",
        data={"workflow": "personal"},
    )
    document = create_item("artifact", title="generated document")
    with Session(app.state.engine) as db, db.begin():
        actor_id = db.get(Project, project["id"]).owner_id
        other_owner = Account(username="private-owner", password_hash="unused")
        db.add(other_owner)
        db.flush()
        destination = Project(
            owner_id=other_owner.id, name="hidden destination"
        )
        db.add(destination)
        db.flush()
        initialize_project_access(db, destination)
        actor = db.get(Account, actor_id)
        grant = membership(db, destination, actor, "editor")
        consumed = item_for_user(db, source["id"], actor_id)
        run = SkillRun(
            project_id=project["id"],
            target_id=document["id"],
            target_revision=1,
            applied_ids=[document["id"]],
            operation="write_document",
            instruction="",
            status="review_ready",
            source_snapshots=[serialize(consumed)],
        )
        db.add(run)
        db.flush()
        run_id = run.id
        request = transfer_request(consumed, destination)
        preview = preview_transfer(db, actor_id, request)
        commit_transfer(
            db,
            actor_id,
            TransferCommit(
                **request.model_dump(),
                preview_token=preview["preview_token"],
                operation_id="hide-source",
            ),
        )
        db.delete(grant)
        destination.access_revision += 1
    assert client.get(f"/api/runs/{run_id}").status_code == 404
    for url in (
        f"/api/items/{document['id']}/portable",
        f"/api/projects/{project['id']}/export",
    ):
        response = client.get(url)
        assert response.status_code == 409, response.text
        assert "zip" not in response.headers.get("content-type", "")
        assert "private consumed body" not in response.text
        assert source["id"] not in response.text


def test_context_hides_run_when_another_consumed_source_is_private(shared):
    db, _, editor, viewer, _, source, target, task = shared
    consumed = create_item(
        db,
        source.id,
        "task",
        "another source",
        "private source",
        {"workflow": "personal"},
    )
    run = SkillRun(
        project_id=source.id,
        applied_ids=[task.id],
        operation="plan",
        instruction="",
        status="review_ready",
        source_snapshots=[serialize(consumed)],
    )
    db.add(run)
    db.flush()
    assert (
        task_context(db, viewer.id, task.id)["origin_runs"][0]["id"] == run.id
    )
    request = transfer_request(consumed, target)
    preview = preview_transfer(db, editor.id, request)
    commit_transfer(
        db,
        editor.id,
        TransferCommit(
            **request.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="private-context-source",
        ),
    )
    context = task_context(db, viewer.id, task.id)
    assert context["origin_runs"] == []
    assert run.id not in json.dumps(context)
    assert target.id not in json.dumps(context)


def test_transfer_rejects_run_with_another_input_in_hidden_project(shared):
    db, owner, editor, _, _, source, private, task = shared
    destination = Project(owner_id=owner.id, name="allowed destination")
    db.add(destination)
    db.flush()
    initialize_project_access(db, destination)
    membership(db, destination, editor, "editor")
    consumed = create_item(
        db,
        source.id,
        "task",
        "consumed input",
        "private body",
        {"workflow": "personal"},
    )
    run = SkillRun(
        project_id=source.id,
        applied_ids=[task.id],
        source_snapshots=[serialize(consumed)],
        operation="plan",
        instruction="",
        status="review_ready",
    )
    db.add(run)
    db.flush()
    request = transfer_request(consumed, private)
    preview = preview_transfer(db, editor.id, request)
    commit_transfer(
        db,
        editor.id,
        TransferCommit(
            **request.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="move-other-input",
        ),
    )
    grant = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == private.id,
            ProjectMembership.account_id == editor.id,
        )
    )
    db.delete(grant)
    private.access_revision += 1
    db.flush()
    with pytest.raises(Problem) as hidden:
        preview_transfer(db, editor.id, transfer_request(task, destination))
    assert hidden.value.status == 404
    assert run.id not in str(hidden.value) and private.id not in str(
        hidden.value
    )
    assert task.project_id == source.id and task.revision == 1


def test_active_input_run_blocks_move_and_invalidates_ready_preview(shared):
    db, _, editor, _, _, source, target, task = shared
    run = SkillRun(
        project_id=source.id,
        source_snapshots=[serialize(task)],
        operation="plan",
        instruction="",
        status="review_ready",
    )
    db.add(run)
    db.flush()
    request = transfer_request(task, target)
    ready = preview_transfer(db, editor.id, request)
    assert ready["impact"]["skill_runs"] == 1
    run.status = "queued"
    db.flush()
    blocked = preview_transfer(db, editor.id, request)
    assert blocked["blockers"] == [{"id": task.id, "reason": "active_run"}]
    with pytest.raises(Problem) as active:
        commit_transfer(
            db,
            editor.id,
            TransferCommit(
                **request.model_dump(),
                preview_token=ready["preview_token"],
                operation_id="active-input-move",
            ),
        )
    assert active.value.status == 409
    assert task.project_id == source.id and task.revision == 1


def test_transfer_rechecks_other_run_input_projects_after_lock_wait(
    app, client, project, create_item, monkeypatch
):
    from projects import task_transfers as transfer_module

    consumed = create_item(
        "task", title="other input", data={"workflow": "personal"}
    )
    task = create_item(
        "task", title="moving output", data={"workflow": "personal"}
    )
    destination = client.post(
        "/api/projects", json={"name": "transfer target"}
    ).json()
    private = client.post(
        "/api/projects", json={"name": "other input target"}
    ).json()
    with Session(app.state.engine) as db, db.begin():
        actor_id = db.get(Project, project["id"]).owner_id
        concurrent_actor = Account(
            username="concurrent-input-mover", password_hash="unused"
        )
        db.add(concurrent_actor)
        db.flush()
        concurrent_actor_id = concurrent_actor.id
        membership(
            db, db.get(Project, project["id"]), concurrent_actor, "editor"
        )
        membership(
            db, db.get(Project, private["id"]), concurrent_actor, "editor"
        )
        source = item_for_user(db, consumed["id"], actor_id)
        db.add(
            SkillRun(
                project_id=project["id"],
                applied_ids=[task["id"]],
                source_snapshots=[serialize(source)],
                operation="plan",
                instruction="",
                status="review_ready",
            )
        )
    original_lock = transfer_module.lock_project_access
    raced = False

    def move_other_input_before_lock(db, project_ids):
        nonlocal raced
        if not raced:
            raced = True
            with Session(app.state.engine) as mover, mover.begin():
                mover.execute(text("SET LOCAL lock_timeout = '3s'"))
                source = item_for_user(
                    mover, consumed["id"], concurrent_actor_id
                )
                target = mover.get(Project, private["id"])
                request = transfer_request(source, target)
                preview = preview_transfer(mover, concurrent_actor_id, request)
                commit_transfer(
                    mover,
                    concurrent_actor_id,
                    TransferCommit(
                        **request.model_dump(),
                        preview_token=preview["preview_token"],
                        operation_id="run-input-lock-race",
                    ),
                )
        original_lock(db, project_ids)

    monkeypatch.setattr(
        transfer_module, "lock_project_access", move_other_input_before_lock
    )
    response = client.post(
        "/api/task-transfers/preview",
        json={
            "tasks": [
                {"id": task["id"], "expected_revision": task["revision"]}
            ],
            "target_project_id": destination["id"],
        },
    )
    assert raced and response.status_code == 409, response.text
    assert (
        response.json()["detail"]
        == "참조 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
    )
    with Session(app.state.engine) as db:
        assert (
            item_for_user(db, consumed["id"], actor_id).project_id
            == private["id"]
        )
        assert (
            item_for_user(db, task["id"], actor_id).project_id == project["id"]
        )


@pytest.mark.parametrize("bundle", ["document", "project"])
def test_export_rechecks_item_projects_after_waiting_for_locks(
    app, client, project, create_item, monkeypatch, bundle
):
    from projects import portable as portable_module

    source = create_item(
        "task",
        title="race source",
        body="source body",
        data={"workflow": "personal"},
    )
    document = create_item("artifact", title="race document")
    destination = client.post(
        "/api/projects", json={"name": "race destination"}
    ).json()
    with Session(app.state.engine) as db, db.begin():
        actor_id = db.get(Project, project["id"]).owner_id
        consumed = item_for_user(db, source["id"], actor_id)
        db.add(
            SkillRun(
                project_id=project["id"],
                target_id=document["id"],
                target_revision=1,
                applied_ids=[document["id"]],
                operation="write_document",
                instruction="",
                status="review_ready",
                source_snapshots=[serialize(consumed)],
            )
        )
    original_lock = portable_module.lock_project_access
    raced = False

    def move_before_lock(db, project_ids):
        nonlocal raced
        if not raced:
            raced = True
            # A second real transaction wins the source project lock just
            # before the exporter can obtain its previously discovered set.
            with Session(app.state.engine) as mover, mover.begin():
                task = item_for_user(mover, source["id"], actor_id)
                target = mover.get(Project, destination["id"])
                request = transfer_request(task, target)
                preview = preview_transfer(mover, actor_id, request)
                commit_transfer(
                    mover,
                    actor_id,
                    TransferCommit(
                        **request.model_dump(),
                        preview_token=preview["preview_token"],
                        operation_id="export-lock-race",
                    ),
                )
        original_lock(db, project_ids)

    monkeypatch.setattr(
        portable_module, "lock_project_access", move_before_lock
    )
    path = (
        f"/api/items/{document['id']}/portable"
        if bundle == "document"
        else f"/api/projects/{project['id']}/export"
    )
    response = client.get(path)
    assert raced
    assert response.status_code == 409, response.text
    assert (
        response.json()["detail"]
        == "반출 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
    )
    with Session(app.state.engine) as db:
        assert (
            item_for_user(db, source["id"], actor_id).project_id
            == destination["id"]
        )
