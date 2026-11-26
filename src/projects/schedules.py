"""Optional grouping, explicit iteration assignments and immutable snapshots."""

import copy

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import Item, utcnow
from projects.domain import Problem
from projects.records import item_for_user, project_for_user, serialize
from projects.schedule_models import (
    ProjectSchedule,
    ScheduleChange,
    ScheduleSnapshot,
    TaskIteration,
    TaskIterationChange,
)

MAX_SCHEDULE_MEMBERS = 2000


def _items(db: Session, project_id: str) -> dict[str, Item]:
    return {
        item.id: item
        for item in db.scalars(
            select(Item).where(
                Item.project_id == project_id,
                Item.kind.in_(["task", "requirement"]),
            )
        )
    }


def schedule_for_user(
    db: Session,
    project_id: str,
    schedule_id: str,
    user_id: str,
    permission: str = "project.read",
) -> ProjectSchedule:
    writable = permission != "project.read"
    project_for_user(db, project_id, user_id, permission, lock=writable)
    statement = (
        select(ProjectSchedule)
        .where(
            ProjectSchedule.id == schedule_id,
            ProjectSchedule.project_id == project_id,
            ProjectSchedule.deleted.is_(False),
        )
        .execution_options(populate_existing=True)
    )
    if writable:
        statement = statement.with_for_update()
    row = db.scalar(statement)
    if row is None:
        raise Problem(404, "일정을 찾을 수 없습니다.")
    return row


def check_revision(revision: int, expected: int) -> None:
    if revision != expected:
        raise Problem(
            409, "일정이 변경되었습니다. 최신 계획을 다시 확인해 주세요."
        )


def _visible_schedule(data: dict, visible: dict[str, Item]) -> dict:
    data["member_ids"] = [iid for iid in data["member_ids"] if iid in visible]
    if data["kind"] == "phase":
        phase = data.setdefault(
            "phase",
            {
                "status": "not_started",
                "predecessor_id": None,
                "started_at": None,
                "closed_at": None,
                "results": [],
            },
        )
        phase["results"] = [
            entry for entry in phase["results"] if entry["task_id"] in visible
        ]
    return data


def public_schedule(db: Session, row: ProjectSchedule) -> dict:
    result = serialize(row)
    result.pop("deleted")
    visible = _items(db, row.project_id)
    phase = {
        key: result.pop(key)
        for key in ("predecessor_id", "started_at", "closed_at")
    }
    results = result.pop("phase_results")
    if row.kind == "phase":
        phase["status"] = (
            "closed"
            if row.closed_at
            else "in_progress"
            if row.started_at
            else "not_started"
        )
        phase["results"] = results or []
        result["phase"] = phase
    _visible_schedule(result, visible)
    if row.kind == "iteration":
        result["member_ids"] = list(
            db.scalars(
                select(TaskIteration.task_id)
                .join(
                    Item,
                    Item.id == TaskIteration.task_id,
                )
                .where(
                    TaskIteration.iteration_id == row.id,
                    TaskIteration.project_id == row.project_id,
                    Item.project_id == row.project_id,
                )
            )
        )
    return result


def list_schedules(db: Session, project_id: str, user_id: str) -> list[dict]:
    project_for_user(db, project_id, user_id)
    return [
        public_schedule(db, row)
        for row in db.scalars(
            select(ProjectSchedule)
            .where(
                ProjectSchedule.project_id == project_id,
                ProjectSchedule.deleted.is_(False),
            )
            .order_by(ProjectSchedule.created_at, ProjectSchedule.id)
        )
    ]


def _change(
    db: Session,
    row: ProjectSchedule,
    user_id: str,
    before: dict,
    reason: str,
) -> dict:
    db.flush()
    after = public_schedule(db, row)
    db.add(
        ScheduleChange(
            schedule_id=row.id,
            revision=row.revision,
            actor_id=user_id,
            before=before,
            after=after,
            reason=reason,
        )
    )
    db.flush()
    return after


def create_schedule(
    db: Session,
    project_id: str,
    user_id: str,
    values: dict,
) -> dict:
    project_for_user(db, project_id, user_id, "project.update", lock=True)
    row = ProjectSchedule(project_id=project_id, **values)
    _validate_predecessor(db, row, row.predecessor_id)
    db.add(row)
    return _change(db, row, user_id, {}, "일정 생성")


def update_schedule(
    db: Session,
    project_id: str,
    schedule_id: str,
    user_id: str,
    expected_revision: int,
    values: dict,
    reason: str,
) -> dict:
    row = schedule_for_user(
        db, project_id, schedule_id, user_id, "project.update"
    )
    check_revision(row.revision, expected_revision)
    before = public_schedule(db, row)
    if "predecessor_id" in values:
        _validate_predecessor(db, row, values["predecessor_id"])
    for name, value in values.items():
        setattr(row, name, value)
    if row.start_date and row.end_date and row.end_date < row.start_date:
        raise Problem(422, "종료 예정일은 시작 예정일 이후여야 합니다.")
    if row.confirmed_date and not row.evidence:
        raise Problem(422, "실제 확인일에는 확인 근거를 입력해 주세요.")
    row.revision += 1
    return _change(db, row, user_id, before, reason)


def set_members(
    db: Session,
    project_id: str,
    schedule_id: str,
    user_id: str,
    expected_revision: int,
    item_ids: list[str],
    reason: str,
) -> dict:
    row = schedule_for_user(
        db, project_id, schedule_id, user_id, "project.update"
    )
    check_revision(row.revision, expected_revision)
    if row.kind == "iteration":
        raise Problem(
            422, "Iteration 배정은 Task별 재배정 동작을 사용해 주세요."
        )
    if len(item_ids) != len(set(item_ids)):
        raise Problem(422, "중복 항목은 연결할 수 없습니다.")
    visible = _items(db, project_id)
    if any(iid not in visible for iid in item_ids):
        raise Problem(404, "현재 프로젝트에서 연결 항목을 찾을 수 없습니다.")
    before = public_schedule(db, row)
    row.member_ids = list(item_ids)
    row.revision += 1
    return _change(db, row, user_id, before, reason)


def delete_schedule(
    db: Session,
    project_id: str,
    schedule_id: str,
    user_id: str,
    expected_revision: int,
    reason: str,
) -> dict:
    row = schedule_for_user(
        db, project_id, schedule_id, user_id, "project.update"
    )
    check_revision(row.revision, expected_revision)
    if row.kind == "phase" and db.scalar(
        select(ProjectSchedule.id)
        .where(
            ProjectSchedule.predecessor_id == row.id,
            ProjectSchedule.deleted.is_(False),
        )
        .limit(1)
    ):
        raise Problem(
            409, "후속 Phase가 참조하는 선행 Phase는 삭제할 수 없습니다."
        )
    if row.kind == "iteration" and public_schedule(db, row)["member_ids"]:
        raise Problem(
            409, "현재 배정 Task를 명시적으로 해제한 후 일정을 삭제해 주세요."
        )
    before = public_schedule(db, row)
    row.deleted = True
    row.revision += 1
    _change(db, row, user_id, before, reason)
    return {"ok": True}


def _phases(db: Session, project_id: str) -> dict[str, ProjectSchedule]:
    return {
        row.id: row
        for row in db.scalars(
            select(ProjectSchedule).where(
                ProjectSchedule.project_id == project_id,
                ProjectSchedule.kind == "phase",
                ProjectSchedule.deleted.is_(False),
            )
        )
    }


def _validate_predecessor(
    db: Session, row: ProjectSchedule, predecessor_id: str | None
) -> None:
    if row.started_at and predecessor_id != row.predecessor_id:
        raise Problem(409, "시작한 Phase의 선행 Phase는 변경할 수 없습니다.")
    if predecessor_id is None:
        return
    if row.kind != "phase":
        raise Problem(422, "선행 Phase는 Phase 일정에만 지정할 수 있습니다.")
    phases = _phases(db, row.project_id)
    seen = {row.id}
    while predecessor_id is not None:
        if predecessor_id in seen:
            raise Problem(422, "Phase 선후 관계에 순환이 있습니다.")
        if predecessor_id not in phases:
            raise Problem(422, "같은 프로젝트의 선행 Phase를 선택해 주세요.")
        seen.add(predecessor_id)
        predecessor_id = phases[predecessor_id].predecessor_id


def set_task_phases(
    db: Session,
    project_id: str,
    task_id: str,
    user_id: str,
    phase_ids: list[str],
    expected_revisions: dict[str, int],
) -> dict:
    project_for_user(db, project_id, user_id, "project.update", lock=True)
    _task(db, project_id, task_id, user_id)
    phases = _phases(db, project_id)
    desired = set(phase_ids)
    if len(desired) != len(phase_ids) or not desired <= phases.keys():
        raise Problem(422, "같은 프로젝트의 Phase를 중복 없이 선택해 주세요.")
    current = {pid for pid, row in phases.items() if task_id in row.member_ids}
    changed = current ^ desired
    if not changed <= expected_revisions.keys():
        raise Problem(409, "변경된 Phase의 최신 계획을 확인해 주세요.")
    for pid, revision in expected_revisions.items():
        if pid not in phases:
            raise Problem(409, "변경된 Phase의 최신 계획을 확인해 주세요.")
        check_revision(phases[pid].revision, revision)
    if any(
        len(phases[pid].member_ids) >= MAX_SCHEDULE_MEMBERS
        for pid in desired - current
    ):
        raise Problem(422, "Phase에 연결할 수 있는 항목 수를 초과했습니다.")
    for pid in sorted(changed):
        row = phases[pid]
        before = public_schedule(db, row)
        row.member_ids = (
            [*row.member_ids, task_id]
            if pid in desired
            else [iid for iid in row.member_ids if iid != task_id]
        )
        row.revision += 1
        _change(db, row, user_id, before, "Task Phase 연결 변경")
    return {"phase_ids": phase_ids}


def _close_phase(
    db: Session,
    row: ProjectSchedule,
    user_id: str,
    carryovers: list[tuple[str, str]],
) -> None:
    if not row.started_at or row.closed_at:
        raise Problem(409, "진행 중인 Phase만 종료할 수 있습니다.")
    tasks = _items(db, row.project_id)
    members = [
        tasks[iid]
        for iid in row.member_ids
        if iid in tasks and tasks[iid].kind == "task"
    ]
    targets = dict(carryovers)
    if len(targets) != len(carryovers):
        raise Problem(422, "Task별 이월 대상은 하나만 지정해 주세요.")
    open_ids = {
        task.id
        for task in members
        if task.data.get("state") not in ("done", "closed", "cancelled")
    }
    if targets.keys() != open_ids:
        raise Problem(
            422,
            "모든 미완료 Task의 이월 대상을 지정하거나 Task를 먼저 완료 또는 종료해 주세요.",
        )
    phases = _phases(db, row.project_id)
    for pid in set(targets.values()):
        if (
            pid not in phases
            or phases[pid].predecessor_id != row.id
            or phases[pid].started_at
        ):
            raise Problem(
                422, "이월 대상으로 연결된 후속 Phase를 선택해 주세요."
            )
    results = []
    additions: dict[str, list[str]] = {}
    for task in members:
        target = targets.get(task.id)
        outcome = (
            "carryover"
            if target
            else "completed"
            if task.data.get("state") == "done"
            else "closed"
        )
        results.append(
            {
                "task_id": task.id,
                "title": task.title,
                "result": outcome,
                "reason": task.data.get("cancellation_reason", "")
                if outcome == "closed"
                else "",
                "target_phase_id": target,
            }
        )
        if target and task.id not in phases[target].member_ids:
            additions.setdefault(target, []).append(task.id)
    if any(
        len(phases[pid].member_ids) + len(ids) > MAX_SCHEDULE_MEMBERS
        for pid, ids in additions.items()
    ):
        raise Problem(422, "대상 Phase의 연결 항목 수를 초과했습니다.")
    for pid, ids in additions.items():
        successor = phases[pid]
        before = public_schedule(db, successor)
        successor.member_ids = [*successor.member_ids, *ids]
        successor.revision += 1
        _change(db, successor, user_id, before, "Phase 이월 Task 연결")
    row.phase_results = results
    row.closed_at = utcnow()


def transition_phase(
    db: Session,
    project_id: str,
    schedule_id: str,
    user_id: str,
    expected_revision: int,
    action: str,
    carryovers: list[tuple[str, str]] | None = None,
) -> dict:
    row = schedule_for_user(
        db, project_id, schedule_id, user_id, "project.update"
    )
    check_revision(row.revision, expected_revision)
    if row.kind != "phase":
        raise Problem(422, "Phase 일정을 선택해 주세요.")
    before = public_schedule(db, row)
    if action == "start":
        if row.started_at:
            raise Problem(409, "이미 시작한 Phase입니다.")
        if row.predecessor_id:
            predecessor = db.get(ProjectSchedule, row.predecessor_id)
            if not predecessor or not predecessor.closed_at:
                raise Problem(409, "선행 Phase를 먼저 종료해 주세요.")
        row.started_at = utcnow()
    elif action == "close":
        _close_phase(db, row, user_id, carryovers or [])
    elif action == "reopen":
        if not row.closed_at:
            raise Problem(409, "종료된 Phase만 다시 열 수 있습니다.")
        if db.scalar(
            select(ProjectSchedule.id)
            .where(
                ProjectSchedule.predecessor_id == row.id,
                ProjectSchedule.started_at.is_not(None),
            )
            .limit(1)
        ):
            raise Problem(409, "후속 Phase가 시작되어 다시 열 수 없습니다.")
        row.closed_at = None
        row.phase_results = []
    else:
        raise ValueError(action)
    row.revision += 1
    return _change(db, row, user_id, before, "phase_" + action)


def _task(db: Session, project_id: str, task_id: str, user_id: str) -> Item:
    project_for_user(db, project_id, user_id)
    task = item_for_user(db, task_id, user_id)
    if task.project_id != project_id or task.kind != "task":
        raise Problem(404, "현재 프로젝트에서 Task를 찾을 수 없습니다.")
    return task


def task_iteration(
    db: Session,
    project_id: str,
    task_id: str,
    user_id: str,
) -> dict:
    _task(db, project_id, task_id, user_id)
    row = db.get(TaskIteration, task_id)
    if row is None or row.project_id != project_id:
        return {
            "task_id": task_id,
            "iteration_id": None,
            "revision": row.revision if row else 0,
        }
    return {
        "task_id": task_id,
        "iteration_id": row.iteration_id,
        "revision": row.revision,
    }


def assign_iteration(
    db: Session,
    project_id: str,
    task_id: str,
    user_id: str,
    iteration_id: str | None,
    expected_revision: int,
    reason: str,
) -> dict:
    project_for_user(db, project_id, user_id, "project.update", lock=True)
    project_for_user(db, project_id, user_id, "task.update")
    _task(db, project_id, task_id, user_id)
    if iteration_id is not None:
        iteration = schedule_for_user(db, project_id, iteration_id, user_id)
        if iteration.kind != "iteration":
            raise Problem(422, "Iteration 일정을 선택해 주세요.")
    row = db.get(TaskIteration, task_id)
    current = row if row is not None and row.project_id == project_id else None
    check_revision(row.revision if row else 0, expected_revision)
    previous = current.iteration_id if current else None
    if current and previous == iteration_id:
        return task_iteration(db, project_id, task_id, user_id)
    if row is None:
        row = TaskIteration(task_id=task_id, project_id=project_id, revision=0)
        db.add(row)
    row.project_id = project_id
    row.iteration_id = iteration_id
    row.revision += 1
    db.add(
        TaskIterationChange(
            project_id=project_id,
            task_id=task_id,
            previous_iteration_id=previous,
            iteration_id=iteration_id,
            revision=row.revision,
            actor_id=user_id,
            reason=reason,
        )
    )
    db.flush()
    return task_iteration(db, project_id, task_id, user_id)


def iteration_history(
    db: Session, project_id: str, task_id: str, user_id: str
) -> list[dict]:
    _task(db, project_id, task_id, user_id)
    return [
        serialize(row)
        for row in db.scalars(
            select(TaskIterationChange)
            .where(
                TaskIterationChange.project_id == project_id,
                TaskIterationChange.task_id == task_id,
            )
            .order_by(TaskIterationChange.created_at, TaskIterationChange.id)
        )
    ]


def schedule_history(
    db: Session, project_id: str, schedule_id: str, user_id: str
) -> list[dict]:
    schedule_for_user(db, project_id, schedule_id, user_id)
    visible = _items(db, project_id)
    result = []
    for row in db.scalars(
        select(ScheduleChange)
        .where(
            ScheduleChange.schedule_id == schedule_id,
        )
        .order_by(ScheduleChange.revision)
    ):
        entry = serialize(row)
        for side in ("before", "after"):
            if entry[side]:
                _visible_schedule(entry[side], visible)
        result.append(entry)
    return result


def _item_plan(item: Item) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "kind": item.kind,
        "revision": item.revision,
        "planned_date": item.data.get("planned_date", ""),
        "due_date": item.data.get("due_date", ""),
    }


def detach_task_schedules(db: Session, task: Item, actor_id: str) -> dict:
    """Explicitly end source-project context before the caller transfers a Task.

    The transfer service owns both project ACL locks. Undo keeps the Task
    unassigned; restoring an old schedule requires a new checked user action.
    """
    removed = []
    for row in db.scalars(
        select(ProjectSchedule)
        .where(
            ProjectSchedule.project_id == task.project_id,
            ProjectSchedule.deleted.is_(False),
        )
        .with_for_update()
    ):
        if task.id not in row.member_ids:
            continue
        before = public_schedule(db, row)
        row.member_ids = [iid for iid in row.member_ids if iid != task.id]
        row.revision += 1
        _change(db, row, actor_id, before, "task_transfer")
        removed.append({"schedule_id": row.id, "revision": row.revision})
    current = db.get(TaskIteration, task.id)
    iteration_id = None
    if (
        current is not None
        and current.project_id == task.project_id
        and current.iteration_id is not None
    ):
        iteration_id = current.iteration_id
        current.iteration_id = None
        current.revision += 1
        db.add(
            TaskIterationChange(
                project_id=task.project_id,
                task_id=task.id,
                previous_iteration_id=iteration_id,
                iteration_id=None,
                revision=current.revision,
                actor_id=actor_id,
                reason="task_transfer",
            )
        )
    db.flush()
    return {
        "groups_detached": removed,
        "iteration_detached": iteration_id,
        "restoration": "이동·되돌림 후 미배정입니다. 현재 권한과 일정 상태를 확인해 명시적으로 다시 연결해 주세요.",
    }


def public_snapshot(db: Session, row: ScheduleSnapshot) -> dict:
    result = serialize(row)
    visible = _items(db, row.project_id)
    result["items"] = [
        item for item in result["items"] if item["id"] in visible
    ]
    for schedule in result["schedules"]:
        _visible_schedule(schedule, visible)
    return result


def create_snapshot(
    db: Session,
    project_id: str,
    user_id: str,
    title: str,
    reason: str,
) -> dict:
    project_for_user(db, project_id, user_id, "baseline.write", lock=True)
    row = ScheduleSnapshot(
        project_id=project_id,
        title=title.strip(),
        reason=reason,
        actor_id=user_id,
        schedules=list_schedules(db, project_id, user_id),
        items=[_item_plan(item) for item in _items(db, project_id).values()],
    )
    db.add(row)
    db.flush()
    return public_snapshot(db, row)


def list_snapshots(db: Session, project_id: str, user_id: str) -> list[dict]:
    project_for_user(db, project_id, user_id)
    return [
        public_snapshot(db, row)
        for row in db.scalars(
            select(ScheduleSnapshot)
            .where(
                ScheduleSnapshot.project_id == project_id,
            )
            .order_by(ScheduleSnapshot.created_at)
        )
    ]


def snapshot_diff(
    db: Session, project_id: str, snapshot_id: str, user_id: str
) -> dict:
    project_for_user(db, project_id, user_id)
    row = db.scalar(
        select(ScheduleSnapshot).where(
            ScheduleSnapshot.id == snapshot_id,
            ScheduleSnapshot.project_id == project_id,
        )
    )
    if row is None:
        raise Problem(404, "일정 기준선을 찾을 수 없습니다.")
    snapshot = public_snapshot(db, row)
    current_schedules = list_schedules(db, project_id, user_id)
    current_items = [
        _item_plan(item) for item in _items(db, project_id).values()
    ]
    visible_ids = {item["id"] for item in current_items}
    changes = []
    for entity, old_rows, new_rows in (
        ("schedule", snapshot["schedules"], current_schedules),
        ("item", snapshot["items"], current_items),
    ):
        old = {entry["id"]: entry for entry in old_rows}
        new = {entry["id"]: entry for entry in new_rows}
        for entity_id in sorted(old.keys() | new.keys()):
            before, after = old.get(entity_id), new.get(entity_id)
            if before != after:
                recheck_ids = (
                    [entity_id]
                    if entity == "item"
                    else sorted(
                        (
                            set((before or {}).get("member_ids", []))
                            | set((after or {}).get("member_ids", []))
                        )
                        & visible_ids
                    )
                )
                changes.append(
                    {
                        "entity": entity,
                        "id": entity_id,
                        "change": "new"
                        if before is None
                        else "removed"
                        if after is None
                        else "changed",
                        "before": copy.deepcopy(before),
                        "after": copy.deepcopy(after),
                        "recheck_required": bool(recheck_ids)
                        or bool(before and after),
                        "recheck_item_ids": recheck_ids,
                    }
                )
    return {
        "snapshot": snapshot,
        "changes": changes,
        "scope": "현재 접근 가능한 프로젝트 항목",
    }
