"""Transfer integrity against isolated real PostgreSQL schemas."""

import base64
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import (
    Account,
    Item,
    Link,
    Project,
    ProjectArchiveReferences,
    Revision,
    SkillRun,
    TaskPosition,
    TaskTransfer,
)
from projects.database import (
    TestRun as CaseRun,
)
from projects.domain import Problem
from projects.jobs import apply_result
from projects.portable import export_project, import_project, read_archive
from projects.project_access import initialize_project_access
from projects.records import (
    add_link,
    check_task_completion,
    create_baseline,
    create_item,
    is_stale,
)
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


def seed(db):
    user = Account(username="transfer", password_hash="unused")
    db.add(user)
    db.flush()
    source = Project(owner_id=user.id, name="source")
    target = Project(owner_id=user.id, name="target")
    db.add_all([source, target])
    db.flush()
    initialize_project_access(db, source)
    initialize_project_access(db, target)
    task = create_item(
        db,
        source.id,
        "task",
        "task",
        "body",
        {
            "workflow": "personal",
            "planned_date": "2026-11-02",
            "list_name": "Inbox",
        },
    )
    db.add(TaskPosition(item_id=task.id, position=0))
    db.flush()
    return user, source, target, task


def request(task, target, **kwargs):
    return TransferPreview(
        tasks=[{"id": task.id, "expected_revision": task.revision}],
        target_project_id=target.id,
        **kwargs,
    )


def commit(db, user, payload, operation="move"):
    preview = preview_transfer(db, user.id, payload)
    return commit_transfer(
        db,
        user.id,
        TransferCommit(
            **payload.model_dump(),
            preview_token=preview["preview_token"],
            operation_id=operation,
        ),
    )


def test_transfer_preserves_fields_history_and_idempotency(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        original_data = dict(task.data)
        payload = request(task, target)
        preview = preview_transfer(db, user.id, payload)
        command = TransferCommit(
            **payload.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="move",
        )
        result = commit_transfer(db, user.id, command)
        assert task.project_id == target.id
        assert task.data == original_data
        assert task.body == "body" and task.revision == 2
        assert db.get(Revision, (task.id, 1)).data == original_data
        assert commit_transfer(db, user.id, command) == result
        assert operation_result(db, user.id, "move") == result
        assert len(list(db.scalars(select(TaskTransfer)))) == 1
        with pytest.raises(Problem):
            commit_transfer(
                db,
                user.id,
                command.model_copy(update={"target_list_name": "other"}),
            )
        undone = undo_transfer(
            db,
            user.id,
            result["transfer_id"],
            TransferUndo(operation_id="undo"),
        )
        assert task.project_id == source.id and task.revision == 3
        assert undone["undo_of"] == result["transfer_id"]
        assert task.data == original_data


def test_preview_rechecks_links_and_active_runs_atomically(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        second = create_item(
            db, source.id, "task", "dependency", "", {"workflow": "personal"}
        )
        payload = TransferPreview(
            tasks=[
                {"id": row.id, "expected_revision": row.revision}
                for row in (task, second)
            ],
            target_project_id=target.id,
        )
        preview = preview_transfer(db, user.id, payload)
        add_link(db, source.id, task, second, "depends_on")
        command = TransferCommit(
            **payload.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="stale",
        )
        with pytest.raises(Problem):
            commit_transfer(db, user.id, command)
        assert task.project_id == source.id and second.project_id == source.id
        run = SkillRun(
            project_id=source.id,
            operation="plan",
            instruction="",
            target_id=task.id,
            target_revision=1,
            status="queued",
        )
        db.add(run)
        db.flush()
        assert preview_transfer(db, user.id, payload)["blockers"] == [
            {"id": task.id, "reason": "active_run"}
        ]
        with pytest.raises(Problem):
            commit(db, user, payload)
        assert task.revision == second.revision == 1


def test_relationship_completion_and_stale_content(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        dependency = create_item(
            db, source.id, "task", "dependency", "", {"workflow": "personal"}
        )
        link = add_link(db, source.id, task, dependency, "depends_on")
        commit(db, user, request(task, target))
        assert not is_stale(link, {task.id: task, dependency.id: dependency})
        with pytest.raises(Problem):
            check_task_completion(db, task, {**task.data, "state": "done"})
        dependency.data = {**dependency.data, "state": "done"}
        check_task_completion(db, task, {**task.data, "state": "done"})
        task.body = "changed"
        assert is_stale(link, {task.id: task, dependency.id: dependency})


def test_owner_isolation_and_conditional_undo(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        stranger = Account(username="stranger", password_hash="unused")
        db.add(stranger)
        db.flush()
        with pytest.raises(Problem):
            preview_transfer(db, stranger.id, request(task, target))
        result = commit(db, user, request(task, target))
        with pytest.raises(Problem):
            operation_result(db, stranger.id, "move")
        task.revision += 1
        with pytest.raises(Problem):
            undo_transfer(
                db,
                user.id,
                result["transfer_id"],
                TransferUndo(operation_id="undo"),
            )
        assert task.project_id == target.id


def test_archives_keep_baseline_external_snapshot_and_transfer(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        dependency = create_item(
            db, source.id, "task", "dependency", "", {"workflow": "personal"}
        )
        add_link(db, source.id, task, dependency, "depends_on")
        create_baseline(db, source.id, "before")
        db.add(
            SkillRun(
                project_id=source.id,
                operation="plan",
                instruction="",
                target_id=task.id,
                target_revision=1,
                status="review_ready",
                result={},
            )
        )
        db.flush()
        commit(db, user, request(task, target))
        source_zip = export_project(db, source)
        target_zip = export_project(db, target)
        source_data = read_archive(base64.b64encode(source_zip).decode())
        target_data = read_archive(base64.b64encode(target_zip).decode())
        assert task.id in source_data["baselines"][0]["revisions"]
        assert task.id in {
            row["id"] for row in source_data["external_references"]["items"]
        }
        assert source_data["skill_runs"][0]["target_id"] == task.id
        assert target_data["transfers"][0]["changes"][0]["id"] == task.id
        # Delete only this fixture's own schema rows to test independent restore.
        db.rollback()
    for archive in (source_zip, target_zip):
        with Session(engine) as db, db.begin():
            user = Account(username="restore", password_hash="unused")
            db.add(user)
            db.flush()
            restored = import_project(
                db, user.id, base64.b64encode(archive).decode()
            )
            refs = db.get(ProjectArchiveReferences, restored.id)
            assert refs is not None and refs.data["missing_item_ids"]
            assert refs.data["transfers"]
            db.rollback()


def test_concurrent_retries_produce_one_revision_and_event(engine):
    with Session(engine) as db, db.begin():
        user, source, target, task = seed(db)
        user_id, task_id = user.id, task.id
        payload = request(task, target)
        preview = preview_transfer(db, user_id, payload)
        command = TransferCommit(
            **payload.model_dump(),
            preview_token=preview["preview_token"],
            operation_id="retry",
        )
    ready = Barrier(2)

    def execute():
        with Session(engine) as db, db.begin():
            ready.wait(timeout=10)
            return commit_transfer(db, user_id, command)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: execute(), range(2)))
    assert results[0] == results[1]
    with Session(engine) as db:
        assert db.get(Item, task_id).revision == 2
        assert len(list(db.scalars(select(TaskTransfer)))) == 1


def test_delivery_keeps_original_test_evidence_and_rejects_old_run_apply(
    engine,
):
    with Session(engine) as db, db.begin():
        user, source, target, _ = seed(db)
        task = create_item(
            db,
            source.id,
            "task",
            "delivery",
            "",
            {
                "acceptance_criteria": ["preserve"],
                "result_url": "https://example.com/result",
                "target_sha": "abc",
            },
        )
        case = create_item(
            db,
            source.id,
            "test_case",
            "case",
            "",
            {"steps": ["check"], "expected": "preserved"},
        )
        add_link(db, source.id, case, task, "verifies")
        db.add(
            CaseRun(
                project_id=source.id,
                case_id=case.id,
                case_revision=case.revision,
                outcome="passed",
                actual="ok",
                environment="isolated",
                target_sha="abc",
            )
        )
        run = SkillRun(
            project_id=source.id,
            operation="write_document",
            instruction="",
            target_id=task.id,
            target_revision=task.revision,
            status="review_ready",
            result={
                "document": "new",
                "review": "",
                "requirements": [],
                "assumptions": [],
                "questions": [],
                "source_ids": [],
            },
        )
        db.add(run)
        db.flush()
        commit(db, user, request(task, target))
        check_task_completion(db, task, {**task.data, "state": "done"})
        assert case.project_id == source.id
        with pytest.raises(Problem):
            apply_result(db, run, user.id, [], apply_document=True)
        assert run.status == "review_ready"


def test_bulk_restore_preserves_live_relation_and_missing_gate(engine):
    with Session(engine) as db, db.begin():
        user, source, target, first = seed(db)
        second = create_item(
            db, source.id, "task", "second", "", {"workflow": "personal"}
        )
        add_link(db, source.id, first, second, "depends_on")
        commit(
            db,
            user,
            TransferPreview(
                tasks=[
                    {"id": task.id, "expected_revision": task.revision}
                    for task in (first, second)
                ],
                target_project_id=target.id,
            ),
        )
        task_id = first.id
        archive = export_project(db, target)
        db.rollback()
    with Session(engine) as db, db.begin():
        user = Account(username="restore", password_hash="unused")
        db.add(user)
        db.flush()
        restored = import_project(
            db, user.id, base64.b64encode(archive).decode()
        )
        task = db.get(Item, task_id)
        assert task.project_id == restored.id
        assert len(list(db.scalars(select(Link)))) == 1
        with pytest.raises(Problem):
            check_task_completion(db, task, {**task.data, "state": "done"})
