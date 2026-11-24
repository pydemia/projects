"""Project-authorized, revision-checked atomic task project transfers."""

import copy
import hashlib
import json

from sqlalchemy import cast, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from projects.database import (
    Account,
    Baseline,
    Item,
    Link,
    Project,
    ProjectArchiveReferences,
    ProjectMembership,
    ProjectRole,
    ProjectTaskFieldDefinition,
    SkillRun,
    TaskPosition,
    TaskTransfer,
    new_id,
    utcnow,
)
from projects.domain import Problem
from projects.project_access import (
    access_fingerprint,
    accessible_project_ids,
    lock_project_access,
)
from projects.records import (
    item_for_user,
    project_for_user,
    serialize,
    store_revision,
)
from projects.transfer_schemas import (
    TransferCommit,
    TransferPreview,
    TransferUndo,
)


def _hash(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def _lock_owner(db: Session, user_id: str) -> None:
    # The actor owns operation IDs, regardless of project ownership.
    db.scalar(select(Account).where(Account.id == user_id).with_for_update())


def _related_runs(db: Session, item_ids: list[str]) -> list[SkillRun]:
    return list(
        db.scalars(
            select(SkillRun)
            .where(
                or_(
                    SkillRun.target_id.in_(item_ids),
                    *(
                        cast(SkillRun.applied_ids, JSONB).contains([item_id])
                        for item_id in item_ids
                    ),
                    *(
                        cast(SkillRun.source_snapshots, JSONB).contains(
                            [{"id": item_id}]
                        )
                        for item_id in item_ids
                    ),
                )
            )
            .order_by(SkillRun.id)
            .execution_options(populate_existing=True)
        )
    )


def _lock_references(
    db: Session, user_id: str, item_ids: list[str], extra: set[str]
) -> None:
    from projects.jobs import run_read_projects

    projects = set(extra)
    reference_ids = set(item_ids)
    for link in db.scalars(
        select(Link).where(
            or_(Link.source_id.in_(item_ids), Link.target_id.in_(item_ids))
        )
    ):
        projects.add(link.project_id)
        reference_ids.update((link.source_id, link.target_id))
    original_projects = {
        item_id: project_id
        for item_id, project_id in db.execute(
            select(Item.id, Item.project_id).where(Item.id.in_(reference_ids))
        ).all()
    }
    projects.update(original_projects.values())
    for run in _related_runs(db, item_ids):
        run_projects = run_read_projects(db, run)
        if run_projects is None:
            raise Problem(404, "참조 자료를 찾을 수 없습니다.")
        projects.update(run_projects)
    lock_project_access(db, projects)
    current_projects = {
        item_id: project_id
        for item_id, project_id in db.execute(
            select(Item.id, Item.project_id).where(Item.id.in_(reference_ids))
        ).all()
    }
    if current_projects != original_projects:
        raise Problem(
            409, "참조 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
        )
    for run in _related_runs(db, item_ids):
        current_run_projects = run_read_projects(db, run)
        if (
            current_run_projects is None
            or not current_run_projects <= projects
        ):
            raise Problem(
                409, "참조 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
            )
    for project_id in projects:
        project_for_user(db, project_id, user_id)
    list(
        db.scalars(
            select(Item)
            .where(Item.id.in_(reference_ids))
            .execution_options(populate_existing=True)
        )
    )


def _require_receipt_access(
    db: Session, user_id: str, row: TaskTransfer
) -> None:
    projects = {
        change[key]
        for change in row.changes
        for key in ("source_project_id", "target_project_id")
    }
    _lock_references(
        db, user_id, [change["id"] for change in row.changes], projects
    )
    for change in row.changes:
        project_for_user(db, change["source_project_id"], user_id, "task.move")
        project_for_user(db, change["target_project_id"], user_id, "task.move")
        project_for_user(
            db, change["target_project_id"], user_id, "task.create"
        )
        item_for_user(db, change["id"], user_id, "task.move")


def _inspect(db: Session, user_id: str, payload: TransferPreview) -> dict:
    from projects.jobs import run_is_readable

    _lock_references(
        db,
        user_id,
        [task.id for task in payload.tasks],
        {payload.target_project_id},
    )
    project_for_user(db, payload.target_project_id, user_id, "task.move")
    project_for_user(db, payload.target_project_id, user_id, "task.create")
    tasks = [
        item_for_user(db, task.id, user_id, "task.move")
        for task in payload.tasks
    ]
    blockers = []
    for task, expected in zip(tasks, payload.tasks, strict=True):
        if task.kind != "task":
            blockers.append({"id": task.id, "reason": "not_task"})
        if task.revision != expected.expected_revision:
            blockers.append({"id": task.id, "reason": "revision_conflict"})
        if task.project_id == payload.target_project_id:
            blockers.append({"id": task.id, "reason": "same_project"})
        references = db.get(ProjectArchiveReferences, task.project_id)
        if references is not None and any(
            task.id in (link["source_id"], link["target_id"])
            and (
                link["source_id"]
                in references.data.get("missing_item_ids", [])
                or link["target_id"]
                in references.data.get("missing_item_ids", [])
            )
            for link in references.data.get("links", [])
        ):
            blockers.append(
                {"id": task.id, "reason": "missing_external_reference"}
            )
    ids = [task.id for task in tasks]
    from projects.schedule_models import ProjectSchedule, TaskIteration

    schedules = [
        serialize(row)
        for row in db.scalars(
            select(ProjectSchedule)
            .where(
                ProjectSchedule.project_id.in_(
                    {task.project_id for task in tasks}
                ),
                ProjectSchedule.deleted.is_(False),
            )
            .order_by(ProjectSchedule.id)
        )
        if set(row.member_ids).intersection(ids)
    ]
    iterations = [
        serialize(row)
        for row in db.scalars(
            select(TaskIteration)
            .where(
                TaskIteration.task_id.in_(ids),
                TaskIteration.iteration_id.is_not(None),
            )
            .order_by(TaskIteration.task_id)
        )
    ]
    links = list(
        db.scalars(
            select(Link)
            .where(or_(Link.source_id.in_(ids), Link.target_id.in_(ids)))
            .order_by(Link.id)
        )
    )
    for link in links:
        project_for_user(db, link.project_id, user_id)
        item_for_user(db, link.source_id, user_id)
        item_for_user(db, link.target_id, user_id)
        if link.relation == "subtask_of" and not {
            link.source_id,
            link.target_id,
        } <= set(ids):
            blockers.extend(
                {"id": item_id, "reason": "task_hierarchy"}
                for item_id in sorted(
                    {link.source_id, link.target_id}.intersection(ids)
                )
            )
    runs = _related_runs(db, ids)
    for run in runs:
        project_for_user(db, run.project_id, user_id)
        if not run_is_readable(db, run, user_id):
            raise Problem(404, "참조 자료를 찾을 수 없습니다.")
        if run.status in ("queued", "running"):
            for item_id in sorted(
                item_id
                for item_id in ids
                if item_id == run.target_id
                or item_id in run.applied_ids
                or any(
                    snapshot.get("id") == item_id
                    for snapshot in run.source_snapshots
                )
            ):
                blockers.append({"id": item_id, "reason": "active_run"})
    baselines = [
        serialize(row)
        for row in db.scalars(
            select(Baseline)
            .join(Project, Project.id == Baseline.project_id)
            .where(Project.id.in_(accessible_project_ids(db, user_id)))
            .order_by(Baseline.id)
        )
        if set(row.revisions).intersection(ids)
    ]
    positions = [
        serialize(row)
        for row in db.scalars(
            select(TaskPosition)
            .join(Item, Item.id == TaskPosition.item_id)
            .where(
                Item.project_id.in_(
                    {
                        payload.target_project_id,
                        *(task.project_id for task in tasks),
                    }
                )
            )
            .order_by(TaskPosition.item_id)
        )
    ]
    audience = {
        project_id: set(
            db.scalars(
                select(ProjectMembership.account_id)
                .join(ProjectRole, ProjectRole.id == ProjectMembership.role_id)
                .where(
                    ProjectMembership.project_id == project_id,
                    cast(ProjectRole.permissions, JSONB).contains(
                        ["project.read"]
                    ),
                )
            )
        )
        for project_id in {
            payload.target_project_id,
            *(task.project_id for task in tasks),
        }
    }
    audience_changes = [
        {
            "id": task.id,
            "audience_changed": audience[task.project_id]
            != audience[payload.target_project_id],
            "new_reader_count": len(
                audience[payload.target_project_id] - audience[task.project_id]
            ),
            "removed_reader_count": len(
                audience[task.project_id] - audience[payload.target_project_id]
            ),
        }
        for task in tasks
    ]
    fingerprint = {
        "access": access_fingerprint(db, user_id),
        "audience_changes": audience_changes,
        "owner": user_id,
        "input": payload.model_dump(
            include={"tasks", "target_project_id", "target_list_name"}
        ),
        "tasks": [serialize(task) for task in tasks],
        "links": [serialize(link) for link in links],
        "related_items": [
            serialize(item_for_user(db, item_id, user_id))
            for item_id in sorted(
                {
                    endpoint
                    for link in links
                    for endpoint in (link.source_id, link.target_id)
                }
            )
        ],
        "runs": [serialize(run) for run in runs],
        "baselines": baselines,
        "positions": positions,
        "schedules": schedules,
        "iterations": iterations,
        "board_tasks": [
            serialize(row)
            for row in db.scalars(
                select(Item)
                .where(
                    Item.kind == "task",
                    Item.project_id.in_(
                        {
                            payload.target_project_id,
                            *(task.project_id for task in tasks),
                        }
                    ),
                )
                .order_by(Item.id)
            )
        ],
    }
    return {
        "preview_token": _hash(fingerprint),
        "tasks": [serialize(task) for task in tasks],
        "target_project_id": payload.target_project_id,
        "blockers": blockers,
        "audience_changes": audience_changes,
        "impact": {
            "tasks": len(tasks),
            "links": len(links),
            "baselines": len(baselines),
            "skill_runs": len(runs),
            "schedule_memberships": len(schedules),
            "iteration_assignments": len(iterations),
        },
    }


def preview_transfer(
    db: Session, user_id: str, payload: TransferPreview
) -> dict:
    return _inspect(db, user_id, payload)


def operation_result(db: Session, user_id: str, operation_id: str) -> dict:
    transfer = db.scalar(
        select(TaskTransfer).where(
            TaskTransfer.owner_id == user_id,
            TaskTransfer.operation_id == operation_id,
        )
    )
    if transfer is None:
        raise Problem(404, "이동 결과를 찾을 수 없습니다.")
    _require_receipt_access(db, user_id, transfer)
    return copy.deepcopy(transfer.result)


def _existing(
    db: Session, user_id: str, operation_id: str, payload_hash: str
) -> dict | None:
    row = db.scalar(
        select(TaskTransfer).where(
            TaskTransfer.owner_id == user_id,
            TaskTransfer.operation_id == operation_id,
        )
    )
    if row is None:
        return None
    if row.payload_hash != payload_hash:
        raise Problem(
            409, "같은 operation ID에 다른 이동 요청을 사용할 수 없습니다."
        )
    _require_receipt_access(db, user_id, row)
    return copy.deepcopy(row.result)


def _positions(db: Session, project_ids: set[str]) -> None:
    for project_id in sorted(project_ids):
        tasks = list(
            db.scalars(
                select(Item)
                .where(Item.project_id == project_id, Item.kind == "task")
                .order_by(Item.created_at, Item.id)
            )
        )
        positions = {
            row.item_id: row
            for row in db.scalars(
                select(TaskPosition).where(
                    TaskPosition.item_id.in_([task.id for task in tasks])
                )
            )
        }
        states = sorted({task.data["state"] for task in tasks})
        for state in states:
            group = sorted(
                (task for task in tasks if task.data["state"] == state),
                key=lambda task: (
                    positions[task.id].position
                    if task.id in positions
                    else 2**31,
                    task.created_at,
                    task.id,
                ),
            )
            for index, task in enumerate(group):
                if task.id in positions:
                    positions[task.id].position = index
                else:
                    db.add(TaskPosition(item_id=task.id, position=index))


def _move(
    db: Session,
    user_id: str,
    moves: list[tuple[Item, str, str | None]],
    operation_id: str,
    payload_hash: str,
    *,
    undo_of: str | None = None,
) -> dict:
    destinations = {task.id: target_id for task, target_id, _ in moves}
    hierarchy = list(
        db.scalars(
            select(Link).where(
                Link.relation == "subtask_of",
                or_(
                    Link.source_id.in_(destinations),
                    Link.target_id.in_(destinations),
                ),
            )
        )
    )
    for link in hierarchy:
        child = db.get(Item, link.source_id)
        parent = db.get(Item, link.target_id)
        assert child is not None and parent is not None
        child_project = destinations.get(child.id, child.project_id)
        parent_project = destinations.get(parent.id, parent.project_id)
        if child_project != parent_project:
            raise Problem(409, "상위·하위 작업을 함께 이동해 주세요.")
    transfer_id = new_id()
    changes = []
    projects = {
        project_id
        for task, target_id, _ in moves
        for project_id in (task.project_id, target_id)
    }
    _positions(db, projects)
    db.flush()
    for task, target_id, list_name in moves:
        # Field IDs stay stable when tasks cross project boundaries. Definitions
        # become shared in the destination only as part of the atomic move.
        for field_id in task.data.get("custom_fields", {}):
            source_field = db.get(
                ProjectTaskFieldDefinition, (task.project_id, field_id)
            )
            target_field = db.get(
                ProjectTaskFieldDefinition, (target_id, field_id)
            )
            if source_field is None:
                raise Problem(409, "이동할 사용자 필드 정의가 누락되었습니다.")
            if target_field is not None:
                if any(
                    getattr(source_field, key) != getattr(target_field, key)
                    for key in ("name", "type", "options")
                ):
                    raise Problem(
                        409, "대상 프로젝트의 사용자 필드와 충돌합니다."
                    )
            else:
                field_data = serialize(source_field)
                field_data["created_at"] = source_field.created_at
                field_data["project_id"] = target_id
                db.add(ProjectTaskFieldDefinition(**field_data))
                db.flush()
        position = db.get(TaskPosition, task.id)
        from projects.schedules import detach_task_schedules

        schedule_context = detach_task_schedules(db, task, user_id)
        changes.append(
            {
                "id": task.id,
                "source_project_id": task.project_id,
                "target_project_id": target_id,
                "before_revision": task.revision,
                "after_revision": task.revision + 1,
                "source_data": copy.deepcopy(task.data),
                "source_position": position.position if position else None,
                "schedule_context": schedule_context,
            }
        )
        projects.update((task.project_id, target_id))
        task.project_id = target_id
        if list_name is not None:
            task.data = {**task.data, "list_name": list_name}
        task.revision += 1
        task.updated_at = utcnow()
        if position:
            position.position = 2**31 - 1
        store_revision(db, task)
    for link in hierarchy:
        link.project_id = destinations.get(link.source_id, link.project_id)
    _positions(db, projects)
    project_versions = []
    for project_id in sorted(projects):
        project = db.get(Project, project_id)
        assert project is not None
        project.version += 1
        project_versions.append({"id": project_id, "version": project.version})
    result = {
        "transfer_id": transfer_id,
        "operation_id": operation_id,
        "undo_of": undo_of,
        "tasks": [serialize(task) for task, _, _ in moves],
        "projects": project_versions,
    }
    db.add(
        TaskTransfer(
            id=transfer_id,
            owner_id=user_id,
            operation_id=operation_id,
            payload_hash=payload_hash,
            changes=changes,
            result=result,
        )
    )
    db.flush()
    return result


def commit_transfer(
    db: Session, user_id: str, payload: TransferCommit
) -> dict:
    _lock_owner(db, user_id)
    payload_hash = _hash(payload.model_dump())
    previous = _existing(db, user_id, payload.operation_id, payload_hash)
    if previous is not None:
        return previous
    _lock_references(
        db,
        user_id,
        [task.id for task in payload.tasks],
        {payload.target_project_id},
    )
    for task in sorted(payload.tasks, key=lambda task: task.id):
        item_for_user(db, task.id, user_id, lock=True)
    inspected = _inspect(db, user_id, payload)
    if inspected["blockers"]:
        raise Problem(
            409, "작업 revision·소속·진행 중 실행을 다시 확인해 주세요."
        )
    if inspected["preview_token"] != payload.preview_token:
        raise Problem(
            409, "이동 영향이 변경되었습니다. 미리보기를 다시 확인해 주세요."
        )
    return _move(
        db,
        user_id,
        [
            (
                item_for_user(db, task.id, user_id, lock=True),
                payload.target_project_id,
                payload.target_list_name,
            )
            for task in payload.tasks
        ],
        payload.operation_id,
        payload_hash,
    )


def undo_transfer(
    db: Session, user_id: str, transfer_id: str, payload: TransferUndo
) -> dict:
    _lock_owner(db, user_id)
    payload_hash = _hash({"undo_of": transfer_id, **payload.model_dump()})
    previous = _existing(db, user_id, payload.operation_id, payload_hash)
    if previous is not None:
        return previous
    transfer = db.get(TaskTransfer, transfer_id)
    if transfer is None or transfer.owner_id != user_id:
        raise Problem(404, "이동 이력을 찾을 수 없습니다.")
    _require_receipt_access(db, user_id, transfer)
    moves = []
    for change in transfer.changes:
        task = item_for_user(db, change["id"], user_id, "task.move", lock=True)
        project_for_user(db, change["source_project_id"], user_id, "task.move")
        project_for_user(
            db, change["source_project_id"], user_id, "task.create"
        )
        if (
            task.revision != change["after_revision"]
            or task.project_id != change["target_project_id"]
        ):
            raise Problem(409, "이동 후 작업이 변경되어 되돌릴 수 없습니다.")
        if any(
            run.status in ("queued", "running")
            for run in _related_runs(db, [task.id])
        ):
            raise Problem(409, "진행 중 실행이 있어 되돌릴 수 없습니다.")
        for link in db.scalars(
            select(Link).where(
                or_(Link.source_id == task.id, Link.target_id == task.id)
            )
        ):
            item_for_user(db, link.source_id, user_id)
            item_for_user(db, link.target_id, user_id)
        moves.append(
            (
                task,
                change["source_project_id"],
                change["source_data"].get("list_name", ""),
            )
        )
    result = _move(
        db,
        user_id,
        moves,
        payload.operation_id,
        payload_hash,
        undo_of=transfer_id,
    )
    restored_projects = {
        change["source_project_id"] for change in transfer.changes
    }
    restored_ids = {change["id"] for change in transfer.changes}
    for position in db.scalars(
        select(TaskPosition)
        .join(Item, Item.id == TaskPosition.item_id)
        .where(Item.project_id.in_(restored_projects))
    ):
        if position.item_id not in restored_ids:
            position.position *= 2
    for change in transfer.changes:
        restored_position = db.get(TaskPosition, change["id"])
        if (
            restored_position is not None
            and change["source_position"] is not None
        ):
            restored_position.position = change["source_position"] * 2 - 1
    db.flush()
    _positions(db, restored_projects)
    db.flush()
    return result
