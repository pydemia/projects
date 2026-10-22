"""Transactional task board order and state movement."""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import Item, Project, TaskPosition
from projects.domain import Problem, validate_item_data
from projects.records import (
    check_task_completion,
    create_item,
    require_revision,
    revise_item,
)
from projects.schemas import TaskBulkChange, TaskMove, TaskQuickCreate


def board_orders(db: Session, tasks: list[Item]) -> dict[str, int]:
    """Return stable positions, including tasks created before this table existed."""
    if not tasks:
        return {}
    stored = {
        row.item_id: row.position
        for row in db.scalars(
            select(TaskPosition).where(
                TaskPosition.item_id.in_([task.id for task in tasks])
            )
        )
    }
    groups: dict[str, list[Item]] = defaultdict(list)
    for task in tasks:
        groups[task.data["state"]].append(task)
    orders: dict[str, int] = {}
    for group in groups.values():
        group.sort(
            key=lambda task: (
                stored.get(task.id, 2**31),
                task.created_at,
                task.id,
            )
        )
        for index, task in enumerate(group):
            orders[task.id] = index
    return orders


def _project_tasks(db: Session, project_id: str) -> list[Item]:
    return list(
        db.scalars(
            select(Item).where(
                Item.project_id == project_id, Item.kind == "task"
            )
        )
    )


def _write_board_order(db: Session, groups: dict[str, list[Item]]) -> None:
    task_ids = [task.id for group in groups.values() for task in group]
    positions = {
        row.item_id: row
        for row in db.scalars(
            select(TaskPosition).where(TaskPosition.item_id.in_(task_ids))
        )
    }
    for group in groups.values():
        for index, task in enumerate(group):
            position = positions.get(task.id)
            if position is None:
                db.add(TaskPosition(item_id=task.id, position=index))
            else:
                position.position = index
    db.flush()


def quick_create_task(
    db: Session, project_id: str, payload: TaskQuickCreate
) -> Item:
    """Create a personal task at the bottom of the requested state column."""
    db.scalar(
        select(Project).where(Project.id == project_id).with_for_update()
    )
    if (
        payload.state == "cancelled"
        and not payload.cancellation_reason.strip()
    ):
        raise Problem(422, "취소 열에 추가할 때는 취소 사유를 입력해 주세요.")
    tasks = _project_tasks(db, project_id)
    orders = board_orders(db, tasks)
    groups: dict[str, list[Item]] = defaultdict(list)
    for task in tasks:
        groups[task.data["state"]].append(task)
    for group in groups.values():
        group.sort(key=lambda task: orders[task.id])
    created = create_item(
        db,
        project_id,
        "task",
        payload.title,
        "",
        {
            "workflow": "personal",
            "requires_test": False,
            "state": payload.state,
            "cancellation_reason": payload.cancellation_reason,
        },
    )
    groups[payload.state].append(created)
    _write_board_order(db, groups)
    return created


def bulk_change_tasks(
    db: Session, project_id: str, payload: TaskBulkChange
) -> list[Item]:
    """Validate every requested change, then commit revisions and order together."""
    if all(
        getattr(payload, field) is None
        for field in (
            "state",
            "planned_date",
            "list_name",
            "cancellation_reason",
        )
    ):
        raise Problem(422, "변경할 작업 속성을 선택해 주세요.")
    if payload.list_name is not None and not payload.list_name.strip():
        raise Problem(422, "목록 이름을 입력해 주세요.")
    selected_ids = [entry.id for entry in payload.tasks]
    if len(selected_ids) != len(set(selected_ids)):
        raise Problem(422, "같은 작업을 중복 선택할 수 없습니다.")
    db.scalar(
        select(Project).where(Project.id == project_id).with_for_update()
    )
    tasks = _project_tasks(db, project_id)
    by_id = {task.id: task for task in tasks}
    if any(task_id not in by_id for task_id in selected_ids):
        raise Problem(404, "작업을 찾을 수 없습니다.")
    for entry in payload.tasks:
        require_revision(by_id[entry.id], entry.expected_revision)
    updated_data: dict[str, dict] = {}
    for entry in payload.tasks:
        task = by_id[entry.id]
        data = dict(task.data)
        for field in (
            "state",
            "planned_date",
            "list_name",
            "cancellation_reason",
        ):
            value = getattr(payload, field)
            if value is not None:
                data[field] = value
        updated_data[task.id] = validate_item_data("task", data)
    states = {task.id: task.data["state"] for task in tasks}
    states.update(
        {task_id: data["state"] for task_id, data in updated_data.items()}
    )
    for entry in payload.tasks:
        task = by_id[entry.id]
        data = updated_data[task.id]
        if data["state"] == "done":
            check_task_completion(db, task, data, states)
    orders = board_orders(db, tasks)
    groups: dict[str, list[Item]] = defaultdict(list)
    for task in tasks:
        groups[task.data["state"]].append(task)
    for group in groups.values():
        group.sort(key=lambda task: orders[task.id])
    moving = [
        by_id[entry.id]
        for entry in payload.tasks
        if (updated_data[entry.id]["state"] != by_id[entry.id].data["state"])
    ]
    for task in moving:
        groups[task.data["state"]].remove(task)
    for task in moving:
        groups[updated_data[task.id]["state"]].append(task)
    changed = []
    for entry in payload.tasks:
        task = by_id[entry.id]
        changed.append(
            revise_item(
                db,
                task,
                entry.expected_revision,
                task.title,
                task.body,
                updated_data[task.id],
                completion_states=states,
            )
        )
    _write_board_order(db, groups)
    return changed


def move_task(
    db: Session, task: Item, move: TaskMove
) -> tuple[int, str | None, str | None]:
    """Move one task, with its revision and every affected rank in one transaction."""
    if task.kind != "task":
        raise Problem(422, "작업만 보드에서 이동할 수 있습니다.")
    # A project row serializes competing board moves without locking unrelated projects.
    db.scalar(
        select(Project).where(Project.id == task.project_id).with_for_update()
    )
    db.refresh(task, with_for_update=True)
    require_revision(task, move.expected_revision)
    if task.data["state"] != move.source_state:
        raise Problem(
            409, "작업 상태가 변경되었습니다. 새로고침 후 다시 이동해 주세요."
        )
    tasks = list(
        db.scalars(
            select(Item).where(
                Item.project_id == task.project_id, Item.kind == "task"
            )
        )
    )
    orders = board_orders(db, tasks)
    groups: dict[str, list[Item]] = defaultdict(list)
    for candidate in tasks:
        groups[candidate.data["state"]].append(candidate)
    for group in groups.values():
        group.sort(key=lambda candidate: orders[candidate.id])
    source = groups[move.source_state]
    destination = groups[move.target_state]
    source_index = source.index(task)
    undo_before = (
        source[source_index + 1].id if source_index + 1 < len(source) else None
    )
    undo_after = (
        source[source_index - 1].id
        if undo_before is None and source_index > 0
        else None
    )
    source.remove(task)
    if source is not destination:
        destination = [
            candidate for candidate in destination if candidate.id != task.id
        ]
        groups[move.target_state] = destination
    before = next(
        (
            index
            for index, candidate in enumerate(destination)
            if candidate.id == move.before_id
        ),
        None,
    )
    after = next(
        (
            index
            for index, candidate in enumerate(destination)
            if candidate.id == move.after_id
        ),
        None,
    )
    if (
        move.before_id is not None
        and before is None
        or move.after_id is not None
        and after is None
    ):
        raise Problem(422, "대상 열의 이웃 작업을 다시 선택해 주세요.")
    if before is not None and after is not None and after + 1 != before:
        raise Problem(
            409, "대상 순서가 변경되었습니다. 새로고침 후 다시 이동해 주세요."
        )
    insertion = (
        before
        if before is not None
        else after + 1
        if after is not None
        else len(destination)
    )
    destination.insert(insertion, task)
    if move.target_state != move.source_state or insertion != orders[task.id]:
        data = {**task.data, "state": move.target_state}
        revise_item(
            db, task, move.expected_revision, task.title, task.body, data
        )
    current = {
        row.item_id: row
        for row in db.scalars(
            select(TaskPosition).where(
                TaskPosition.item_id.in_([candidate.id for candidate in tasks])
            )
        )
    }
    for group in groups.values():
        for index, candidate in enumerate(group):
            position = current.get(candidate.id)
            if position is None:
                db.add(TaskPosition(item_id=candidate.id, position=index))
            else:
                position.position = index
    db.flush()
    return insertion, undo_before, undo_after
