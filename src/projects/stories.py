"""Story read models and explicit acceptance verification transactions."""

import copy
from collections import Counter

from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import (
    Item,
    Link,
    ProjectArchiveReferences,
    Revision,
    utcnow,
)
from projects.domain import Problem, StrictData, story_criteria_hash
from projects.project_access import accessible_project_ids
from projects.records import (
    item_for_user,
    project_for_user,
    project_items,
    require_revision,
    serialize,
    store_revision,
)
from projects.story_models import StoryVerification


class CriterionResult(StrictData):
    criterion: str = Field(min_length=1, max_length=10000)
    passed: bool
    evidence: str = Field(min_length=1, max_length=50000)


class StoryVerificationInput(StrictData):
    expected_revision: int = Field(ge=1)
    evidence: str = Field(min_length=1, max_length=500000)
    criterion_results: list[CriterionResult] = Field(
        min_length=1, max_length=100
    )


def story_for_user(
    db: Session, item_id: str, actor_id: str, *, write: bool = False
) -> Item:
    item = item_for_user(
        db,
        item_id,
        actor_id,
        "item.write" if write else "project.read",
        lock=write,
    )
    if item.kind != "requirement":
        raise Problem(422, "Story·요구사항만 검증할 수 있습니다.")
    return item


def story_verifications(
    db: Session, item_id: str, actor_id: str
) -> list[dict]:
    item = story_for_user(db, item_id, actor_id)
    local = [
        serialize(row)
        for row in db.scalars(
            select(StoryVerification)
            .where(StoryVerification.item_id == item_id)
            .order_by(
                StoryVerification.created_at.desc(), StoryVerification.id
            )
        )
    ]
    stored = db.get(ProjectArchiveReferences, item.project_id)
    historical = stored.data.get("planning", {}) if stored else {}
    local_ids = {row["id"] for row in local}
    return local + [
        {**copy.deepcopy(row), "archived_unverified": True}
        for row in historical.get("story_verifications", [])
        if row["item_id"] == item_id and row["id"] not in local_ids
    ]


def verify_story(
    db: Session, item_id: str, actor_id: str, payload: StoryVerificationInput
) -> dict:
    item = story_for_user(db, item_id, actor_id, write=True)
    require_revision(item, payload.expected_revision)
    criteria = item.data.get("acceptance_criteria", [])
    supplied = [result.criterion for result in payload.criterion_results]
    if (
        not criteria
        or any(not criterion.strip() for criterion in criteria)
        or len(set(criteria)) != len(criteria)
        or Counter(criteria) != Counter(supplied)
        or not payload.evidence.strip()
        or any(
            not result.passed or not result.evidence.strip()
            for result in payload.criterion_results
        )
    ):
        raise Problem(
            422,
            "현재의 모든 수용 조건을 한 번씩 통과 확인하고 근거를 입력해 주세요.",
        )
    verification = StoryVerification(
        item_id=item.id,
        item_revision=item.revision,
        actor_id=actor_id,
        evidence=payload.evidence,
        criterion_results=[
            result.model_dump() for result in payload.criterion_results
        ],
        criteria_hash=story_criteria_hash(item.data),
    )
    db.add(verification)
    item.data = {**copy.deepcopy(item.data), "processing_state": "fulfilled"}
    item.revision += 1
    item.updated_at = utcnow()
    store_revision(db, item)
    return {"item": serialize(item), "verification": serialize(verification)}


def project_stories(db: Session, project_id: str, actor_id: str) -> dict:
    project_for_user(db, project_id, actor_id)
    readable = set(db.scalars(accessible_project_ids(db, actor_id)))
    items = project_items(db, project_id)
    stories = [item for item in items if item.kind == "requirement"]
    tasks = {item.id: item for item in items if item.kind == "task"}
    story_ids = {item.id for item in stories}
    related: dict[str, set[str]] = {item.id: set() for item in stories}
    # Canonical contribution is Task -> requirement. Preserve legacy links
    # without treating their reverse or other kinds as a contribution.
    links = list(
        db.scalars(
            select(Link).where(
                Link.relation == "implements",
                Link.target_id.in_(story_ids),
                Link.project_id.in_(readable),
            )
        )
    )
    linked_tasks = db.scalars(
        select(Item).where(
            Item.id.in_({link.source_id for link in links}),
            Item.kind == "task",
            Item.project_id.in_(readable),
        )
    )
    visible_tasks = {item.id: item for item in linked_tasks}
    for link in links:
        if link.source_id in visible_tasks:
            related[link.target_id].add(link.source_id)
    latest: dict[str, StoryVerification] = {}
    for verification in db.scalars(
        select(StoryVerification)
        .where(StoryVerification.item_id.in_(story_ids))
        .order_by(
            StoryVerification.item_id, StoryVerification.item_revision.desc()
        )
    ):
        latest.setdefault(verification.item_id, verification)
    snapshots: dict[str, list[tuple[int, dict]]] = {}
    for item_id, revision, data in db.execute(
        select(Revision.item_id, Revision.revision, Revision.data).where(
            Revision.item_id.in_(latest)
        )
    ):
        if revision >= latest[item_id].item_revision:
            snapshots.setdefault(item_id, []).append((revision, data))
    rows = []
    for item in stories:
        current_verification = latest.get(item.id)
        history = snapshots.get(item.id, [])
        current = current_verification is not None and (
            current_verification.criteria_hash
            == story_criteria_hash(item.data)
            and len(history)
            == item.revision - current_verification.item_revision + 1
            and all(
                story_criteria_hash(data) == current_verification.criteria_hash
                for _, data in history
            )
        )
        rows.append(
            {
                "item": serialize(item),
                "task_ids": sorted(related[item.id]),
                "completed_task_count": sum(
                    visible_tasks[task_id].data.get("state") == "done"
                    for task_id in related[item.id]
                ),
                "verification_current": current,
            }
        )
    return {
        "stories": rows,
        "task_total": len(tasks),
        "task_done": sum(
            task.data.get("state") == "done" for task in tasks.values()
        ),
        "story_total": len(stories),
        "story_fulfilled": sum(
            row["verification_current"]
            and row["item"]["data"].get("processing_state") == "fulfilled"
            for row in rows
        ),
    }
