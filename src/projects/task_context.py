"""Project provenance visible to the task's current requesting actor."""

from sqlalchemy import cast, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from projects.database import (
    Baseline,
    Project,
    ProjectArchiveReferences,
    SkillRun,
    TaskTransfer,
)
from projects.domain import Problem
from projects.project_access import accessible_project_ids
from projects.records import item_for_user


def task_context(db: Session, user_id: str, item_id: str) -> dict:
    from projects.jobs import run_is_readable

    task = item_for_user(db, item_id, user_id)
    if task.kind != "task":
        raise Problem(422, "작업을 선택해 주세요.")
    projects = {
        project.id: project
        for project in db.scalars(
            select(Project).where(
                Project.id.in_(accessible_project_ids(db, user_id))
            )
        )
    }
    transfers = []
    for transfer in db.scalars(
        select(TaskTransfer)
        .where(cast(TaskTransfer.changes, JSONB).contains([{"id": task.id}]))
        .order_by(TaskTransfer.created_at.desc(), TaskTransfer.id),
    ):
        for change in transfer.changes:
            if change["id"] != task.id:
                continue
            source = projects.get(change["source_project_id"])
            target = projects.get(change["target_project_id"])
            # An old receipt cannot disclose a revoked project's identifier,
            # name or the operation's other project references.
            if source is None or target is None:
                continue
            transfers.append(
                {
                    "id": transfer.id,
                    "created_at": transfer.created_at.isoformat(),
                    "source_project_id": change["source_project_id"],
                    "target_project_id": change["target_project_id"],
                    "source_project_name": source.name,
                    "target_project_name": target.name,
                    "before_revision": change["before_revision"],
                    "after_revision": change["after_revision"],
                }
            )
    runs = [
        {
            "id": run.id,
            "project_id": run.project_id,
            "project_name": projects[run.project_id].name,
            "status": run.status,
            "operation": run.operation,
        }
        for run in db.scalars(
            select(SkillRun)
            .where(
                or_(
                    SkillRun.target_id == task.id,
                    cast(SkillRun.applied_ids, JSONB).contains([task.id]),
                ),
                SkillRun.project_id.in_(projects),
            )
            .order_by(SkillRun.created_at.desc(), SkillRun.id)
        )
        if run_is_readable(db, run, user_id)
    ]
    baselines = [
        {
            "id": baseline.id,
            "project_id": baseline.project_id,
            "project_name": projects[baseline.project_id].name,
            "name": baseline.name,
            "revision": baseline.revisions[task.id],
        }
        for baseline in db.scalars(
            select(Baseline).where(Baseline.project_id.in_(projects))
        )
        if task.id in baseline.revisions
    ]
    references = db.get(ProjectArchiveReferences, task.project_id)
    return {
        "transfers": transfers,
        "origin_runs": runs,
        "baselines": baselines,
        "missing_item_ids": [
            row["id"]
            for row in references.data.get("items", [])
            if row.get("project_id") in projects
            and row["id"] in references.data.get("missing_item_ids", [])
        ]
        if references
        else [],
    }
