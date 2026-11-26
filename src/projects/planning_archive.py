"""Versioned schedule restoration and non-authoritative Story proof provenance.

Archived judgments are evidence from another database, never current server
attestations. Private planning drafts and their replayable receipts do not travel.
"""

import copy
from collections import Counter
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import ProjectArchiveReferences
from projects.domain import story_criteria_hash
from projects.records import serialize
from projects.schedule_models import (
    ProjectSchedule,
    ScheduleChange,
    ScheduleSnapshot,
    TaskIteration,
    TaskIterationChange,
)
from projects.schedule_routes import ScheduleCreate
from projects.story_models import StoryVerification

TABLES: dict[str, Any] = {
    "schedules": ProjectSchedule,
    "schedule_changes": ScheduleChange,
    "task_iterations": TaskIteration,
    "iteration_changes": TaskIterationChange,
    "schedule_snapshots": ScheduleSnapshot,
}
DATES = {"start_date", "end_date", "due_date", "confirmed_date"}


PHASE_COLUMNS = {"predecessor_id", "started_at", "closed_at", "phase_results"}


def _filter_members(row: dict, item_ids: set[str]) -> dict:
    result = copy.deepcopy(row)
    if "member_ids" in result:
        result["member_ids"] = [
            item_id for item_id in result["member_ids"] if item_id in item_ids
        ]
    for payload, field in (
        (result, "phase_results"),
        (result.get("phase", {}), "results"),
    ):
        if payload.get(field) is not None:
            payload[field] = [
                entry
                for entry in payload[field]
                if entry["task_id"] in item_ids
            ]
    return result


def export_planning(db: Session, project_id: str, item_ids: set[str]) -> dict:
    stored = db.get(ProjectArchiveReferences, project_id)
    archived = stored.data.get("planning", {}) if stored else {}
    result: dict = {"schema_version": 1}
    schedules = list(
        db.scalars(
            select(ProjectSchedule)
            .where(
                ProjectSchedule.project_id == project_id,
            )
            .order_by(ProjectSchedule.id)
        )
    )
    schedule_ids = {row.id for row in schedules}
    result["schedules"] = [
        _filter_members(serialize(row), item_ids) for row in schedules
    ]
    legacy_ids = {
        row["id"]
        for row in archived.get("schedules", [])
        if not (row.keys() & PHASE_COLUMNS)
    }
    for row in result["schedules"]:
        if row["id"] in legacy_ids and all(
            row[key] is None for key in PHASE_COLUMNS
        ):
            for key in PHASE_COLUMNS:
                del row[key]
    for name, model in TABLES.items():
        if name == "schedules":
            continue
        statement = select(model)
        if model is ScheduleChange:
            statement = statement.where(model.schedule_id.in_(schedule_ids))
        else:
            statement = statement.where(model.project_id == project_id)
        rows = [serialize(row) for row in db.scalars(statement)]
        original = {row.get("id"): row for row in archived.get(name, [])}
        for row in rows:
            previous = original.get(row.get("id"))
            if previous and "actor_id" in row:
                row["actor_id"] = previous["actor_id"]
        if name == "schedule_changes":
            for row in rows:
                for side in ("before", "after"):
                    row[side] = _filter_members(row[side], item_ids)
        elif name in ("task_iterations", "iteration_changes"):
            rows = [row for row in rows if row["task_id"] in item_ids]
        elif name == "schedule_snapshots":
            for row in rows:
                row["items"] = [
                    item for item in row["items"] if item["id"] in item_ids
                ]
                row["schedules"] = [
                    _filter_members(schedule, item_ids)
                    for schedule in row["schedules"]
                    if schedule["id"] in schedule_ids
                ]
        result[name] = rows
    proofs = {
        row["id"]: copy.deepcopy(row)
        for row in archived.get("story_verifications", [])
        if row["item_id"] in item_ids
    }
    for proof in db.scalars(
        select(StoryVerification).where(
            StoryVerification.item_id.in_(item_ids),
        )
    ):
        proofs[proof.id] = serialize(proof)
    result["story_verifications"] = list(proofs.values())
    return result


def _uuid(value: object) -> None:
    if not isinstance(value, str) or str(UUID(value)) != value:
        raise ValueError("planning UUID")


def _integer(value: object) -> None:
    if type(value) is not int or value < 1 or value > 2**31 - 1:
        raise ValueError("planning revision")


def _timestamp(value: object) -> None:
    if (
        not isinstance(value, str)
        or datetime.fromisoformat(value).tzinfo is None
    ):
        raise ValueError("planning timestamp")


def _text(value: object, limit: int, *, required: bool = False) -> None:
    if (
        not isinstance(value, str)
        or len(value) > limit
        or (required and not value.strip())
    ):
        raise ValueError("planning text")


def _members(value: object, items: dict) -> None:
    if (
        not isinstance(value, list)
        or len(value) > 2000
        or len(set(value)) != len(value)
    ):
        raise ValueError("planning members")
    if any(
        item_id not in items
        or items[item_id]["kind"] not in ("task", "requirement")
        for item_id in value
    ):
        raise ValueError("planning member endpoint")


def _validate_phase(
    row: dict, phase: dict, schedules: dict, items: dict
) -> None:
    if set(phase) != {
        "predecessor_id",
        "started_at",
        "closed_at",
        "status",
        "results",
    }:
        raise ValueError("planning Phase fields")
    started, closed = phase["started_at"], phase["closed_at"]
    for stamp in (started, closed):
        if stamp is not None:
            _timestamp(stamp)
    if closed is not None and (
        started is None
        or datetime.fromisoformat(started) > datetime.fromisoformat(closed)
    ):
        raise ValueError("planning Phase chronology")
    status = (
        "closed" if closed else "in_progress" if started else "not_started"
    )
    if phase["status"] != status:
        raise ValueError("planning Phase status")
    predecessor = phase["predecessor_id"]
    if predecessor is not None and (
        predecessor == row["id"]
        or schedules.get(predecessor, {}).get("kind") != "phase"
    ):
        raise ValueError("planning Phase predecessor")
    results = phase["results"]
    if not isinstance(results, list) or (not closed and results):
        raise ValueError("planning Phase results")
    seen = set()
    for result in results:
        if not isinstance(result, dict) or set(result) != {
            "task_id",
            "title",
            "result",
            "reason",
            "target_phase_id",
        }:
            raise ValueError("planning Phase result")
        task_id = result["task_id"]
        if task_id in seen or items.get(task_id, {}).get("kind") != "task":
            raise ValueError("planning Phase result Task")
        seen.add(task_id)
        _text(result["title"], 300, required=True)
        outcome = result["result"]
        if outcome not in ("completed", "closed", "carryover"):
            raise ValueError("planning Phase outcome")
        _text(result["reason"], 500000, required=outcome == "closed")
        target = result["target_phase_id"]
        if outcome == "carryover":
            if (
                target == row["id"]
                or schedules.get(target, {}).get("kind") != "phase"
            ):
                raise ValueError("planning Phase carryover target")
        elif target is not None:
            raise ValueError("planning Phase result target")
        if outcome != "closed" and result["reason"]:
            raise ValueError("planning Phase result reason")


def _validate_phase_graph(schedules: dict) -> None:
    visited: set[str] = set()
    for row in schedules.values():
        pid = row["id"]
        path: set[str] = set()
        while pid is not None and pid not in visited:
            if pid in path:
                raise ValueError("planning Phase cycle")
            path.add(pid)
            node = schedules[pid]
            pid = node.get("predecessor_id")
            if pid is not None:
                parent = schedules[pid]
                if parent["deleted"] and not node["deleted"]:
                    raise ValueError("planning deleted predecessor")
                if node.get("started_at") and (
                    not parent.get("closed_at")
                    or datetime.fromisoformat(parent["closed_at"])
                    > datetime.fromisoformat(node["started_at"])
                ):
                    raise ValueError(
                        "planning successor started before closure"
                    )
        visited.update(path)


def _schedule(
    row: dict,
    project_id: str,
    items: dict,
    schedules: dict,
    *,
    snapshot: bool = False,
) -> None:
    expected = set(ProjectSchedule.__table__.columns.keys()) - PHASE_COLUMNS
    phase = None
    if snapshot:
        expected.remove("deleted")
        if row.get("kind") == "phase" and "phase" in row:
            expected.add("phase")
            phase = row["phase"]
            if not isinstance(phase, dict):
                raise ValueError("planning Phase snapshot")
    elif PHASE_COLUMNS & row.keys():
        expected.update(PHASE_COLUMNS)
        if set(row) == expected:
            if row["kind"] == "phase":
                phase = {
                    key: row[key]
                    for key in ("predecessor_id", "started_at", "closed_at")
                }
                phase["status"] = (
                    "closed"
                    if row["closed_at"]
                    else "in_progress"
                    if row["started_at"]
                    else "not_started"
                )
                phase["results"] = row["phase_results"]
                if phase["results"] is None and row["closed_at"] is None:
                    phase["results"] = []
            elif any(row[key] is not None for key in PHASE_COLUMNS):
                raise ValueError("planning lifecycle on non-Phase")
    if set(row) != expected or row["project_id"] != project_id:
        raise ValueError("planning schedule")
    if phase is not None:
        _validate_phase(row, phase, schedules, items)
    if schedules.get(row["id"], {}).get("kind") != row["kind"]:
        raise ValueError("planning schedule kind")
    _uuid(row["id"])
    _integer(row["revision"])
    _timestamp(row["created_at"])
    fields = {key: row[key] for key in ("kind", "title", *DATES, "evidence")}
    ScheduleCreate.model_validate(fields)
    _members(row["member_ids"], items)
    if not snapshot and type(row["deleted"]) is not bool:
        raise ValueError("planning deleted")


def validate_planning(
    db: Session, data: dict, items: dict, revisions: dict
) -> dict:
    """Validate every extension row before creating its live graph."""
    value = data.get("planning")
    if value is None:
        return {}
    if data["schema_version"] != 3 or not isinstance(value, dict):
        raise ValueError("planning version")
    if (
        set(value) != {"schema_version", "story_verifications", *TABLES}
        or type(value["schema_version"]) is not int
        or value["schema_version"] != 1
    ):
        raise ValueError("planning extension")
    value = copy.deepcopy(value)
    project_id = data["project"]["id"]
    for name in ("story_verifications", *TABLES):
        rows = value[name]
        if (
            not isinstance(rows, list)
            or len(rows) > 10000
            or any(not isinstance(row, dict) for row in rows)
        ):
            raise ValueError("planning rows")
        ids: set[str] = set()
        model = (
            StoryVerification
            if name == "story_verifications"
            else TABLES[name]
        )
        for row in rows:
            if name != "schedules" and set(row) != set(
                model.__table__.columns.keys()
            ):
                raise ValueError("planning columns")
            row_id = row["task_id"] if name == "task_iterations" else row["id"]
            _uuid(row_id)
            if row_id in ids:
                raise ValueError("planning duplicate")
            ids.add(row_id)
            if (
                name != "story_verifications"
                and db.get(model, row_id) is not None
            ):
                raise ValueError("planning collision")
            if "project_id" in row and row["project_id"] != project_id:
                raise ValueError("planning project")
            if "revision" in row:
                _integer(row["revision"])
            if "actor_id" in row:
                _uuid(row["actor_id"])
            if "created_at" in row:
                _timestamp(row["created_at"])
            if "reason" in row:
                _text(row["reason"], 10000)
    schedules = {row["id"]: row for row in value["schedules"]}
    for row in schedules.values():
        _schedule(row, project_id, items, schedules)
    _validate_phase_graph(schedules)
    seen_schedule_revisions: set[tuple] = set()
    for row in value["schedule_changes"]:
        schedule = schedules.get(row["schedule_id"])
        key = (row["schedule_id"], row["revision"])
        if (
            schedule is None
            or row["revision"] > schedule["revision"]
            or key in seen_schedule_revisions
        ):
            raise ValueError("planning schedule history")
        seen_schedule_revisions.add(key)
        for side in ("before", "after"):
            if not isinstance(row[side], dict):
                raise ValueError("planning schedule history snapshot")
            if row[side]:
                _schedule(
                    row[side], project_id, items, schedules, snapshot=True
                )
                if row[side]["id"] != schedule["id"]:
                    raise ValueError("planning schedule history endpoint")
    for name in ("task_iterations", "iteration_changes"):
        seen_assignments: set[tuple] = set()
        for row in value[name]:
            if (
                row["task_id"] not in items
                or items[row["task_id"]]["kind"] != "task"
            ):
                raise ValueError("planning task")
            key = (row["task_id"], row["revision"])
            if key in seen_assignments:
                raise ValueError("planning assignment revision")
            seen_assignments.add(key)
            for field in ("iteration_id", "previous_iteration_id"):
                iteration_id = row.get(field)
                if iteration_id is not None and (
                    iteration_id not in schedules
                    or schedules[iteration_id]["kind"] != "iteration"
                ):
                    raise ValueError("planning iteration")
    for row in value["schedule_snapshots"]:
        _text(row["title"], 300, required=True)
        if not isinstance(row["schedules"], list) or not isinstance(
            row["items"], list
        ):
            raise ValueError("planning snapshot")
        ids = set()
        for schedule in row["schedules"]:
            _schedule(schedule, project_id, items, schedules, snapshot=True)
            if schedule["id"] not in schedules or schedule["id"] in ids:
                raise ValueError("planning snapshot schedule")
            ids.add(schedule["id"])
        ids = set()
        for item in row["items"]:
            if (
                set(item)
                != {
                    "id",
                    "title",
                    "kind",
                    "revision",
                    "planned_date",
                    "due_date",
                }
                or item["id"] not in items
                or item["id"] in ids
                or item["kind"] != items[item["id"]]["kind"]
            ):
                raise ValueError("planning snapshot item")
            ids.add(item["id"])
            _integer(item["revision"])
            _text(item["title"], 300, required=True)
            for field in ("planned_date", "due_date"):
                if item[field]:
                    date.fromisoformat(item[field])
    seen_proofs: set[tuple] = set()
    for row in value["story_verifications"]:
        key = (row["item_id"], row["item_revision"])
        _integer(row["item_revision"])
        revision = revisions.get(key)
        if (
            row["item_id"] not in items
            or items[row["item_id"]]["kind"] != "requirement"
            or revision is None
            or key in seen_proofs
            or row["criteria_hash"] != story_criteria_hash(revision["data"])
        ):
            raise ValueError("planning Story proof")
        seen_proofs.add(key)
        _text(row["evidence"], 500000, required=True)
        results = row["criterion_results"]
        criteria = revision["data"].get("acceptance_criteria", [])
        if not isinstance(results, list) or len(results) != len(criteria):
            raise ValueError("planning Story criteria")
        if Counter(result["criterion"] for result in results) != Counter(
            criteria
        ):
            raise ValueError("planning Story criteria coverage")
        for result in results:
            if (
                set(result) != {"criterion", "passed", "evidence"}
                or type(result["passed"]) is not bool
            ):
                raise ValueError("planning Story result")
            _text(result["evidence"], 50000, required=result["passed"])
    return value


def import_planning(
    db: Session, actor_id: str, project_id: str, value: dict
) -> None:
    """Restore plans; external verifier identities remain provenance only."""
    if not value:
        return
    pending_predecessors = []
    for name, model in TABLES.items():
        for source in value[name]:
            row = copy.deepcopy(source)
            if "actor_id" in row:
                # Current actor performs the restore. Original authorship remains
                # in ProjectArchiveReferences and is preserved on re-export.
                row["actor_id"] = actor_id
            if "created_at" in row:
                row["created_at"] = datetime.fromisoformat(row["created_at"])
            if name == "schedules":
                for field in ("started_at", "closed_at"):
                    if row.get(field) is not None:
                        row[field] = datetime.fromisoformat(row[field])
                predecessor = row.pop("predecessor_id", None)
                for field in DATES:
                    if row[field] is not None:
                        row[field] = date.fromisoformat(row[field])
            restored = model(**row)
            db.add(restored)
            if name == "schedules" and predecessor is not None:
                pending_predecessors.append((restored, predecessor))
        db.flush()
        if name == "schedules":
            for restored, predecessor in pending_predecessors:
                restored.predecessor_id = predecessor
            db.flush()
    # Deliberately no StoryVerification insert: a hash supplied by the archive
    # authenticates neither its author nor a fulfilled assertion.
