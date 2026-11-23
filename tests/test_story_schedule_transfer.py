"""Transfers detach optional plans without losing dates or accepting stale previews."""

import pytest
from sqlalchemy.orm import Session
from test_task_transfers import commit, request, seed

from projects.domain import Problem
from projects.schedules import (
    assign_iteration,
    create_schedule,
    iteration_history,
    list_schedules,
    set_members,
    task_iteration,
    update_schedule,
)
from projects.task_transfers import preview_transfer, undo_transfer
from projects.transfer_schemas import TransferUndo


def test_transfer_preview_tracks_schedule_changes_and_detaches_atomically(
    engine,
):
    with Session(engine) as db, db.begin():
        actor, source, target, task = seed(db)
        epic = create_schedule(
            db, source.id, actor.id, {"title": "분기 목표", "kind": "epic"}
        )
        epic = set_members(
            db,
            source.id,
            epic["id"],
            actor.id,
            epic["revision"],
            [task.id],
            "계획",
        )
        iteration = create_schedule(
            db, source.id, actor.id, {"title": "첫 주", "kind": "iteration"}
        )
        assign_iteration(
            db, source.id, task.id, actor.id, iteration["id"], 0, "배정"
        )
        original_data = dict(task.data)
        preview = preview_transfer(db, actor.id, request(task, target))
        assert preview["impact"]["schedule_memberships"] == 1
        assert preview["impact"]["iteration_assignments"] == 1
        epic = update_schedule(
            db,
            source.id,
            epic["id"],
            actor.id,
            epic["revision"],
            {"title": "수정한 목표"},
            "정정",
        )
        fresh = preview_transfer(db, actor.id, request(task, target))
        assert fresh["preview_token"] != preview["preview_token"]
        moved = commit(db, actor, request(task, target))
        assert task.data == original_data
        assert task.project_id == target.id
        assert not next(
            row
            for row in list_schedules(db, source.id, actor.id)
            if row["id"] == epic["id"]
        )["member_ids"]
        assert (
            task_iteration(db, target.id, task.id, actor.id)["iteration_id"]
            is None
        )
        undone = undo_transfer(
            db,
            actor.id,
            moved["transfer_id"],
            TransferUndo(operation_id="restore-without-plan"),
        )
        assert undone["undo_of"] == moved["transfer_id"]
        assert task.project_id == source.id and task.data == original_data
        assignment = task_iteration(db, source.id, task.id, actor.id)
        assert assignment["iteration_id"] is None
        assert any(
            row["reason"] == "task_transfer"
            for row in iteration_history(db, source.id, task.id, actor.id)
        )
        with pytest.raises(Problem) as rejected:
            assign_iteration(
                db,
                source.id,
                task.id,
                actor.id,
                iteration["id"],
                1,
                "오래된 폼",
            )
        assert rejected.value.status == 409
