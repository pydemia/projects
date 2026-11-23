"""Reviewable planning changes applied in the caller's PostgreSQL transaction."""

import copy
import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from projects.database import Item, Link, SkillRun, utcnow
from projects.domain import Problem, Relation, validate_item_data
from projects.planning_models import PlanningApplication, PlanningDraft
from projects.project_access import (
    lock_project_access,
    project_access,
    require_project_access,
)
from projects.records import (
    add_link,
    check_task_completion,
    create_item,
    revise_item,
    serialize,
)


class PlanningInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PlanningProposal(PlanningInput):
    id: str = Field(min_length=1, max_length=100)
    kind: Literal[
        "create_story", "create_task", "link", "update_item", "record_decision"
    ]
    title: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=500000)
    data: dict = Field(default_factory=dict)
    item_id: str | None = Field(default=None, max_length=36)
    source: str | None = Field(default=None, max_length=100)
    target: str | None = Field(default=None, max_length=100)
    relation: Relation = "implements"
    reopen: bool = False
    disposition: Literal[
        "new", "extend", "change", "merge", "duplicate", "conflict", "defer"
    ] = "new"
    rationale: str = Field(default="", max_length=500000)

    @model_validator(mode="after")
    def valid_shape(self) -> "PlanningProposal":
        if self.kind in {"create_story", "create_task", "record_decision"}:
            if not self.title or not self.title.strip():
                raise ValueError("새 항목의 제목이 필요합니다.")
        elif self.kind == "link":
            if not self.source or not self.target:
                raise ValueError("연결의 양쪽 항목이 필요합니다.")
        elif not self.item_id:
            raise ValueError("수정할 항목이 필요합니다.")
        return self


class DraftCreate(PlanningInput):
    mode: Literal["initial", "incremental"] = "incremental"
    intent: str = Field(default="", max_length=500000)
    reference_ids: list[str] = Field(default_factory=list, max_length=200)
    proposals: list[PlanningProposal] = Field(
        default_factory=list, max_length=200
    )
    source_run_id: str | None = Field(default=None, max_length=36)


class DraftUpdate(PlanningInput):
    expected_version: int = Field(ge=1)
    intent: str | None = Field(default=None, max_length=500000)
    reference_ids: list[str] | None = Field(default=None, max_length=200)
    proposals: list[PlanningProposal] | None = Field(
        default=None, max_length=200
    )
    status: Literal["draft", "cancelled"] | None = None

    @model_validator(mode="after")
    def no_explicit_null(self) -> "DraftUpdate":
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("변경할 필드에는 값을 지정해 주세요.")
        return self


class PlanningSelection(PlanningInput):
    expected_version: int = Field(ge=1)
    selected_proposal_ids: list[str] = Field(max_length=200)


class PlanningApply(PlanningSelection):
    operation_id: str = Field(min_length=1, max_length=100)


def _hash(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def _proposal_ids(proposals: list[PlanningProposal]) -> set[str]:
    ids = {value.id for value in proposals}
    if len(ids) != len(proposals):
        raise Problem(422, "후보 ID가 중복되었습니다.")
    return ids


def _existing_ids(proposals: list[PlanningProposal]) -> set[str]:
    new_ids = {
        value.id
        for value in proposals
        if value.kind in {"create_story", "create_task"}
    }
    ids: set[str] = set()
    for proposal in proposals:
        if proposal.item_id:
            ids.add(proposal.item_id)
        if proposal.kind == "link":
            ids.update(
                value
                for value in (proposal.source, proposal.target)
                if value and value not in new_ids
            )
        feature_ids = proposal.data.get("feature_ids", [])
        if not isinstance(feature_ids, list) or any(
            not isinstance(value, str) for value in feature_ids
        ):
            raise Problem(422, "기능 참조 형식이 올바르지 않습니다.")
        ids.update(feature_ids)
    return ids


def _capture(
    db: Session, actor: str, ids: set[str], previous: list | None = None
) -> list:
    prior = {value["id"]: value for value in previous or []}
    result = []
    for item_id in sorted(ids):
        item = db.scalar(
            select(Item)
            .where(Item.id == item_id)
            .execution_options(populate_existing=True)
        )
        if item is None:
            raise Problem(404, "참고 항목을 찾을 수 없습니다.")
        access = project_access(db, item.project_id, actor)
        result.append(
            copy.deepcopy(prior[item_id])
            if item_id in prior
            else {
                "id": item.id,
                "revision": item.revision,
                "project_id": item.project_id,
                "membership_id": access["membership_id"],
            }
        )
    return result


def _run_provenance(
    db: Session,
    project_id: str,
    actor: str,
    run_id: str,
    *,
    lock: bool = False,
) -> dict:
    from projects.jobs import run_is_readable

    statement = (
        select(SkillRun)
        .where(SkillRun.id == run_id)
        .execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()
    run = db.scalar(statement)
    if (
        run is None
        or run.project_id != project_id
        or not run_is_readable(db, run, actor)
    ):
        raise Problem(404, "스킬 작업을 찾을 수 없습니다.")
    if run.status not in {"review_ready", "applied"}:
        raise Problem(409, "검토 가능한 스킬 작업 결과를 선택해 주세요.")
    return copy.deepcopy(
        {
            "source_run_id": run.id,
            "skills_lock": run.skills_lock,
            "source_snapshots": run.source_snapshots,
            "reference_manifest": run.reference_manifest,
            "result": run.result,
            "target_id": run.target_id,
            "target_revision": run.target_revision,
        }
    )


def _seed_proposals(provenance: dict) -> list[PlanningProposal]:
    from projects.runtime import RunResult

    result = RunResult.model_validate(provenance["result"])
    proposals: list[PlanningProposal] = []
    for index, candidate in enumerate(result.requirements):
        story_id = f"run-story-{index}"
        excluded = candidate.disposition in {"duplicate", "conflict", "defer"}
        proposals.append(
            PlanningProposal(
                id=story_id,
                kind="record_decision" if excluded else "create_story",
                title=candidate.title,
                body=candidate.body,
                disposition=candidate.disposition,
                rationale=candidate.rationale,
                data={}
                if excluded
                else {
                    "acceptance_criteria": candidate.acceptance_criteria,
                    "feature_ids": candidate.feature_ids,
                    "disposition": candidate.disposition,
                },
            )
        )
        if excluded:
            continue
        for task_index, task in enumerate(candidate.tasks):
            task_id = f"run-task-{index}-{task_index}"
            proposals.append(
                PlanningProposal(
                    id=task_id,
                    kind="create_task",
                    title=task.title,
                    body=task.body,
                    disposition=candidate.disposition,
                    rationale=candidate.rationale,
                    data={
                        "workflow": "delivery",
                        "acceptance_criteria": task.acceptance_criteria,
                    },
                )
            )
            proposals.append(
                PlanningProposal(
                    id=f"run-link-{index}-{task_index}",
                    kind="link",
                    source=task_id,
                    target=story_id,
                )
            )
        for change_index, change in enumerate(candidate.design_changes):
            task_id = f"run-design-{index}-{change_index}"
            snapshot: dict = next(
                (
                    value
                    for value in provenance["source_snapshots"]
                    if value["id"] == change.artifact_id
                ),
                {},
            )
            proposals.append(
                PlanningProposal(
                    id=task_id,
                    kind="create_task",
                    title=("설계 보완: " + snapshot.get("title", "설계 자료"))[
                        :300
                    ],
                    body=change.instruction,
                    data={
                        "workflow": "delivery",
                        "acceptance_criteria": [change.instruction],
                        "requires_test": False,
                    },
                )
            )
            proposals.append(
                PlanningProposal(
                    id=f"run-design-story-{index}-{change_index}",
                    kind="link",
                    source=task_id,
                    target=story_id,
                )
            )
            proposals.append(
                PlanningProposal(
                    id=f"run-design-source-{index}-{change_index}",
                    kind="link",
                    source=task_id,
                    target=change.artifact_id,
                    relation="relates_to",
                )
            )
        for feature_index, feature_id in enumerate(candidate.feature_ids):
            proposals.append(
                PlanningProposal(
                    id=f"run-feature-{index}-{feature_index}",
                    kind="link",
                    source=story_id,
                    target=feature_id,
                    relation="relates_to",
                )
            )
        if provenance.get("target_id"):
            proposals.append(
                PlanningProposal(
                    id=f"run-source-{index}",
                    kind="link",
                    source=story_id,
                    target=provenance["target_id"],
                    relation="source",
                )
            )
    if len(proposals) > 200:
        raise Problem(
            422, "후보가 200개를 초과합니다. 스킬 작업 범위를 나누어 주세요."
        )
    return proposals


def create_draft(
    db: Session, project_id: str, actor: str, payload: DraftCreate
) -> PlanningDraft:
    require_project_access(db, project_id, actor, lock=True)
    provenance = (
        _run_provenance(db, project_id, actor, payload.source_run_id)
        if payload.source_run_id
        else {}
    )
    proposals = payload.proposals
    if payload.source_run_id and not proposals:
        proposals = _seed_proposals(provenance)
    _proposal_ids(proposals)
    ids = set(payload.reference_ids) | _existing_ids(proposals)
    ids.update(value["id"] for value in provenance.get("source_snapshots", []))
    if provenance.get("result"):
        result = provenance["result"]
        ids.update(result.get("source_ids", []))
        for candidate in result.get("requirements", []):
            ids.update(candidate["feature_ids"])
            ids.update(
                change["artifact_id"] for change in candidate["design_changes"]
            )
    if provenance.get("target_id"):
        ids.add(provenance["target_id"])
    references = _capture(db, actor, ids)
    historical = {
        value["id"]: value for value in provenance.get("source_snapshots", [])
    }
    for reference in references:
        original = historical.get(reference["id"])
        if original:
            reference["revision"] = original["revision"]
            reference["project_id"] = original["project_id"]
        if reference["id"] == provenance.get("target_id"):
            reference["revision"] = provenance["target_revision"]
    provenance["actor_membership_id"] = project_access(db, project_id, actor)[
        "membership_id"
    ]
    draft = PlanningDraft(
        project_id=project_id,
        actor_id=actor,
        mode=payload.mode,
        intent=payload.intent,
        proposals=[value.model_dump() for value in proposals],
        references=references,
        source_run_id=payload.source_run_id,
        provenance=provenance,
    )
    db.add(draft)
    db.flush()
    return draft


def _receipt_locations(
    db: Session, application: PlanningApplication | None
) -> tuple[dict[str, str], dict[str, tuple[str, str, str]]]:
    if application is None:
        return {}, {}
    receipt = application.receipt
    item_ids = {
        value["id"]
        for value in receipt["created_items"] + receipt["updated_items"]
    }
    item_ids.update(
        value
        for value in (
            receipt.get("source_item_id"),
            receipt.get("audit_item_id"),
        )
        if value
    )
    link_ids = {value["id"] for value in receipt["links"]}
    links = {
        link_id: (project_id, source_id, target_id)
        for link_id, project_id, source_id, target_id in db.execute(
            select(
                Link.id, Link.project_id, Link.source_id, Link.target_id
            ).where(Link.id.in_(link_ids))
        )
    }
    if links.keys() != link_ids:
        raise Problem(409, "적용 결과 연결을 다시 확인해 주세요.")
    for _, source_id, target_id in links.values():
        item_ids.update((source_id, target_id))
    items = {
        item_id: project_id
        for item_id, project_id in db.execute(
            select(Item.id, Item.project_id).where(Item.id.in_(item_ids))
        )
    }
    if items.keys() != item_ids:
        raise Problem(409, "적용 결과 항목을 다시 확인해 주세요.")
    return items, links


def draft_for_actor(
    db: Session, draft_id: str, actor: str, *, lock: bool = False
) -> PlanningDraft:
    draft = db.get(PlanningDraft, draft_id)
    if draft is None or draft.actor_id != actor:
        raise Problem(404, "기획 초안을 찾을 수 없습니다.")
    require_project_access(db, draft.project_id, actor)
    if lock:
        original_version = draft.version
        original_references = copy.deepcopy(draft.references)
        application = db.scalar(
            select(PlanningApplication).where(
                PlanningApplication.draft_id == draft.id
            )
        )
        application_snapshot = serialize(application) if application else None
        receipt_items, receipt_links = _receipt_locations(db, application)
        project_ids = {
            draft.project_id,
            *(value["project_id"] for value in draft.references),
            *receipt_items.values(),
            *(value[0] for value in receipt_links.values()),
        }
        # Current memberships and item ownership are serialized before draft/item locks.
        lock_project_access(db, project_ids)
        draft = db.scalar(
            select(PlanningDraft)
            .where(PlanningDraft.id == draft_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        assert draft is not None
        if (
            draft.version != original_version
            or draft.references != original_references
            or draft.project_id not in project_ids
        ):
            raise Problem(
                409, "기획 초안이 변경되었습니다. 다시 확인해 주세요."
            )
        application = db.scalar(
            select(PlanningApplication)
            .where(PlanningApplication.draft_id == draft.id)
            .execution_options(populate_existing=True)
        )
        if (
            serialize(application) if application else None
        ) != application_snapshot:
            raise Problem(
                409,
                "적용 결과가 변경되었습니다. 같은 요청을 다시 확인해 주세요.",
            )
        current_items, current_links = _receipt_locations(db, application)
        if current_items != receipt_items or current_links != receipt_links:
            raise Problem(
                409,
                "적용 결과의 소속 또는 연결이 변경되었습니다. 다시 확인해 주세요.",
            )
        require_project_access(db, draft.project_id, actor)
    for reference in draft.references:
        item = db.scalar(
            select(Item)
            .where(Item.id == reference["id"])
            .execution_options(populate_existing=True)
        )
        if item is None:
            raise Problem(
                409, "참고 항목이 변경되었습니다. 초안을 다시 검토해 주세요."
            )
        if lock and (
            item.project_id != reference["project_id"]
            or item.project_id not in project_ids
        ):
            raise Problem(
                409, "참고 항목의 소속이 변경되었습니다. 다시 확인해 주세요."
            )
        require_project_access(db, reference["project_id"], actor)
        require_project_access(db, item.project_id, actor)
    if draft.source_run_id:
        _run_provenance(db, draft.project_id, actor, draft.source_run_id)
    application = db.scalar(
        select(PlanningApplication).where(
            PlanningApplication.draft_id == draft.id
        )
    )
    if application:
        receipt = application.receipt
        result_ids = {
            value["id"]
            for value in receipt["created_items"] + receipt["updated_items"]
        }
        if receipt["source_item_id"]:
            result_ids.add(receipt["source_item_id"])
        if receipt.get("audit_item_id"):
            result_ids.add(receipt["audit_item_id"])
        for item_id in sorted(result_ids):
            item = db.scalar(
                select(Item)
                .where(Item.id == item_id)
                .execution_options(populate_existing=True)
            )
            if item is None:
                raise Problem(409, "적용 결과 항목을 다시 확인해 주세요.")
            require_project_access(db, item.project_id, actor)
        for link_data in receipt["links"]:
            link = db.get(Link, link_data["id"])
            if link is None:
                raise Problem(409, "적용 결과 연결을 다시 확인해 주세요.")
            require_project_access(db, link.project_id, actor)
            for endpoint in (link.source_id, link.target_id):
                item = db.scalar(
                    select(Item)
                    .where(Item.id == endpoint)
                    .execution_options(populate_existing=True)
                )
                if item is None:
                    raise Problem(409, "적용 결과 연결을 다시 확인해 주세요.")
                require_project_access(db, item.project_id, actor)
    return draft


def draft_dto(db: Session, draft: PlanningDraft) -> dict:
    result = serialize(draft)
    for proposal in result["proposals"]:
        proposal["default_selected"] = proposal["kind"] not in {
            "update_item",
            "record_decision",
        } and proposal.get("data", {}).get(
            "disposition", proposal.get("disposition")
        ) not in {"duplicate", "conflict", "defer"}
    application = db.scalar(
        select(PlanningApplication).where(
            PlanningApplication.draft_id == draft.id
        )
    )
    result["receipt"] = (
        copy.deepcopy(application.receipt) if application else None
    )
    return result


def update_draft(
    db: Session, draft: PlanningDraft, actor: str, payload: DraftUpdate
) -> PlanningDraft:
    if draft.version != payload.expected_version or draft.status == "applied":
        raise Problem(409, "기획 초안이 변경되었습니다. 다시 불러와 주세요.")
    proposals = (
        payload.proposals
        if payload.proposals is not None
        else [
            PlanningProposal.model_validate(value) for value in draft.proposals
        ]
    )
    _proposal_ids(proposals)
    if payload.reference_ids is not None or payload.proposals is not None:
        ids = (
            set(payload.reference_ids)
            if payload.reference_ids is not None
            else {value["id"] for value in draft.references}
        )
        ids |= _existing_ids(proposals)
        ids.update(
            value["id"]
            for value in draft.provenance.get("source_snapshots", [])
        )
        # Explicitly reselecting references captures current revisions. Editing candidates
        # alone never silently replaces the captured revisions of existing references.
        previous = (
            None if payload.reference_ids is not None else draft.references
        )
        draft.references = _capture(db, actor, ids, previous)
    if payload.proposals is not None:
        draft.proposals = [value.model_dump() for value in proposals]
    if payload.intent is not None:
        draft.intent = payload.intent
    if payload.status is not None:
        draft.status = payload.status
    draft.version += 1
    draft.updated_at = utcnow()
    db.flush()
    return draft


def _validate_current(
    db: Session, draft: PlanningDraft, actor: str, *, revisions: bool
) -> dict[str, Item]:
    access = project_access(db, draft.project_id, actor)
    if access["membership_id"] != draft.provenance.get("actor_membership_id"):
        raise Problem(409, "초안 작성 당시의 멤버십이 변경되었습니다.")
    if draft.source_run_id:
        # Match the existing SkillRun application lock order: project, run, items.
        provenance = _run_provenance(
            db, draft.project_id, actor, draft.source_run_id, lock=True
        )
        captured = {
            key: value
            for key, value in draft.provenance.items()
            if key != "actor_membership_id"
        }
        if provenance != captured:
            raise Problem(409, "스킬 작업의 근거가 변경되었습니다.")
    items = {
        item.id: item
        for item in db.scalars(
            select(Item)
            .where(Item.id.in_([value["id"] for value in draft.references]))
            .order_by(Item.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    }
    for reference in draft.references:
        item = items.get(reference["id"])
        if item is None or item.project_id != reference["project_id"]:
            raise Problem(
                409, "참고 항목의 소속이 변경되었습니다. 다시 검토해 주세요."
            )
        current = project_access(db, item.project_id, actor)
        if current["membership_id"] != reference.get("membership_id"):
            raise Problem(409, "참고 범위의 멤버십이 변경되었습니다.")
        if revisions and item.revision != reference["revision"]:
            raise Problem(
                409,
                "참고 항목 revision이 변경되었습니다. 초안을 보존하고 다시 미리보기해 주세요.",
            )
    return items


def _selection(
    draft: PlanningDraft, payload: PlanningSelection
) -> list[PlanningProposal]:
    if draft.status != "draft" or draft.version != payload.expected_version:
        raise Problem(409, "기획 초안 상태 또는 버전이 변경되었습니다.")
    selected = set(payload.selected_proposal_ids)
    proposals = [
        PlanningProposal.model_validate(value) for value in draft.proposals
    ]
    known = _proposal_ids(proposals)
    if (
        len(selected) != len(payload.selected_proposal_ids)
        or not selected <= known
    ):
        raise Problem(422, "선택한 후보가 유효하지 않습니다.")
    if not selected:
        raise Problem(422, "적용할 변경을 선택해 주세요.")
    for proposal in proposals:
        if proposal.id in selected and proposal.kind == "link":
            for endpoint in (proposal.source, proposal.target):
                if endpoint in known and endpoint not in selected:
                    raise Problem(
                        422,
                        "연결이 참조하는 새 항목도 선택하거나 연결을 해제해 주세요.",
                    )
                if endpoint in known and not any(
                    value.id == endpoint
                    and value.kind in {"create_story", "create_task"}
                    for value in proposals
                ):
                    raise Problem(422, "연결 대상은 업무 항목이어야 합니다.")
    return [value for value in proposals if value.id in selected]


def _permissions(
    db: Session,
    draft: PlanningDraft,
    actor: str,
    proposals: list[PlanningProposal],
    items: dict[str, Item],
) -> None:
    if draft.intent.strip() or draft.source_run_id:
        require_project_access(db, draft.project_id, actor, "item.write")
    if draft.source_run_id:
        require_project_access(db, draft.project_id, actor, "run.apply")
    new_ids = {
        value.id
        for value in proposals
        if value.kind in {"create_story", "create_task"}
    }
    for proposal in proposals:
        if proposal.kind in {"create_story", "create_task", "record_decision"}:
            require_project_access(
                db,
                draft.project_id,
                actor,
                "task.create"
                if proposal.kind == "create_task"
                else "item.write",
            )
        elif proposal.kind == "update_item":
            item = items.get(proposal.item_id or "")
            if item is None or item.project_id != draft.project_id:
                raise Problem(
                    422, "같은 프로젝트의 항목만 수정할 수 있습니다."
                )
            if item.kind not in {"task", "requirement"}:
                raise Problem(
                    422, "기획에서는 Story와 Task만 수정할 수 있습니다."
                )
            require_project_access(
                db,
                item.project_id,
                actor,
                "task.update" if item.kind == "task" else "item.write",
            )
        else:
            require_project_access(
                db, draft.project_id, actor, "relation.write"
            )
            for endpoint in (proposal.source, proposal.target):
                if endpoint not in new_ids:
                    item = items.get(endpoint or "")
                    if item is None:
                        raise Problem(422, "연결 대상을 다시 선택해 주세요.")
                    require_project_access(
                        db, item.project_id, actor, "relation.write"
                    )


def _validate_feature_references(
    data: dict, project_id: str, items: dict[str, Item]
) -> None:
    for item_id in data.get("feature_ids", []):
        feature = items.get(item_id)
        if (
            feature is None
            or feature.kind != "feature"
            or feature.project_id != project_id
        ):
            raise Problem(422, "같은 프로젝트의 기능 참조를 선택해 주세요.")


def _execute(
    db: Session,
    draft: PlanningDraft,
    actor: str,
    proposals: list[PlanningProposal],
    items: dict[str, Item],
) -> tuple[dict, list[dict]]:
    created: list[dict] = []
    updated: list[dict] = []
    links: list[dict] = []
    changes: list[dict] = []
    resolved = dict(items)
    source = (
        create_item(
            db, draft.project_id, "idea", "기획 원문", draft.intent, {}
        )
        if draft.intent.strip()
        else None
    )
    audit = (
        create_item(
            db,
            draft.project_id,
            "decision",
            "기획 스킬 실행 검토 기록",
            (draft.provenance.get("result") or {}).get("review", ""),
            {"reason": f"스킬 작업 {draft.source_run_id}의 선택 후보 적용"},
        )
        if draft.source_run_id
        else None
    )
    for proposal in proposals:
        if proposal.kind in {"create_story", "create_task", "record_decision"}:
            kind = (
                "requirement"
                if proposal.kind == "create_story"
                else "decision"
                if proposal.kind == "record_decision"
                else "task"
            )
            data = copy.deepcopy(proposal.data)
            if kind == "decision":
                data = {
                    "reason": f"{proposal.disposition}: {proposal.rationale}"
                }
            if kind == "task":
                data.setdefault("workflow", "personal")
                if data["workflow"] == "personal":
                    data.setdefault("requires_test", False)
                if data.get("state", "todo") != "todo":
                    raise Problem(422, "새 Task는 할 일 상태로 추가합니다.")
            _validate_feature_references(data, draft.project_id, items)
            item = create_item(
                db,
                draft.project_id,
                kind,
                proposal.title or "",
                proposal.body or "",
                data,
            )
            resolved[proposal.id] = item
            created.append(serialize(item))
            changes.append(
                {
                    "proposal_id": proposal.id,
                    "kind": proposal.kind,
                    "before": None,
                    "after": serialize(item),
                }
            )
    # Construct the selected final graph before validating any completion.
    # Completion states include all selected updates, independent of row order.
    completion_states: dict[str, str] = {
        value.item_id: value.data.get(
            "state", resolved[value.item_id].data.get("state", "todo")
        )
        for value in proposals
        if value.kind == "update_item"
        and value.item_id
        and resolved[value.item_id].kind == "task"
    }
    applied_links: list[tuple[PlanningProposal, Link, dict | None]] = []
    for proposal in proposals:
        if proposal.kind != "link":
            continue
        source_item = resolved[proposal.source or ""]
        target = resolved[proposal.target or ""]
        if proposal.relation == "implements" and (
            source_item.kind != "task" or target.kind != "requirement"
        ):
            raise Problem(
                422, "Story 연결은 Task → Story 방향으로 지정해 주세요."
            )
        endpoints = or_(
            (Link.source_id == source_item.id) & (Link.target_id == target.id)
        )
        if proposal.relation == "relates_to":
            endpoints = or_(
                endpoints,
                (Link.source_id == target.id)
                & (Link.target_id == source_item.id),
            )
        previous = db.scalar(
            select(Link)
            .where(Link.relation == proposal.relation, endpoints)
            .order_by(Link.id)
            .limit(1)
        )
        before = serialize(previous) if previous else None
        link = add_link(
            db,
            draft.project_id,
            source_item,
            target,
            proposal.relation,
            actor_id=actor,
        )
        applied_links.append((proposal, link, before))
    updated_ids: set[str] = set()
    for proposal in proposals:
        if proposal.kind == "update_item":
            item = resolved[proposal.item_id or ""]
            if item.id in updated_ids:
                raise Problem(
                    422, "한 항목에는 하나의 수정 후보만 적용해 주세요."
                )
            updated_ids.add(item.id)
            before = serialize(item)
            data = {**copy.deepcopy(item.data), **copy.deepcopy(proposal.data)}
            if (
                item.kind == "task"
                and item.data.get("state") == "done"
                and data.get("state") != "done"
                and not proposal.reopen
            ):
                raise Problem(
                    409,
                    "완료 Task를 재개하려면 명시적으로 재개를 선택해 주세요.",
                )
            _validate_feature_references(data, draft.project_id, items)
            validate_item_data(item.kind, data)
            revise_item(
                db,
                item,
                item.revision,
                proposal.title if proposal.title is not None else item.title,
                proposal.body if proposal.body is not None else item.body,
                data,
                status=item.status,
                completion_states=completion_states,
                actor_id=actor,
            )
            updated.append(serialize(item))
            changes.append(
                {
                    "proposal_id": proposal.id,
                    "kind": proposal.kind,
                    "before": before,
                    "after": serialize(item),
                }
            )
    for proposal, link, before in applied_links:
        source_item = resolved[proposal.source or ""]
        target = resolved[proposal.target or ""]
        if (
            proposal.relation == "depends_on"
            and before is None
            and source_item.kind == "task"
            and source_item.data.get("state") == "done"
        ):
            check_task_completion(
                db,
                source_item,
                source_item.data,
                completion_states,
                actor_id=actor,
            )
        if before is None:
            link.source_revision = source_item.revision
            link.target_revision = target.revision
        links.append(serialize(link))
        changes.append(
            {
                "proposal_id": proposal.id,
                "kind": "link",
                "before": before,
                "after": serialize(link),
            }
        )
    db.flush()
    return {
        "draft_id": draft.id,
        "created_items": created,
        "updated_items": updated,
        "links": links,
        "source_item_id": source.id if source else None,
        "audit_item_id": audit.id if audit else None,
    }, changes


def preview_draft(
    db: Session, draft: PlanningDraft, actor: str, payload: PlanningSelection
) -> dict:
    proposals = _selection(draft, payload)
    items = _validate_current(db, draft, actor, revisions=True)
    _permissions(db, draft, actor, proposals, items)
    # The real validation/write path runs inside a savepoint and is always rolled
    # back. Preview therefore checks completion gates, custom fields and cycles.
    savepoint = db.begin_nested()
    try:
        _, changes = _execute(db, draft, actor, proposals, items)
    finally:
        savepoint.rollback()
    return {
        "draft_id": draft.id,
        "version": draft.version,
        "selected_proposal_ids": payload.selected_proposal_ids,
        "changes": changes,
        "source": {"kind": "idea", "title": "기획 원문", "body": draft.intent}
        if draft.intent.strip()
        else None,
        "audit": {
            "kind": "decision",
            "title": "기획 스킬 실행 검토 기록",
            "source_run_id": draft.source_run_id,
        }
        if draft.source_run_id
        else None,
    }


def apply_draft(
    db: Session, draft: PlanningDraft, actor: str, payload: PlanningApply
) -> dict:
    request_hash = _hash({"draft_id": draft.id, **payload.model_dump()})
    existing = db.get(PlanningApplication, payload.operation_id)
    if existing:
        if existing.actor_id != actor or existing.draft_id != draft.id:
            raise Problem(409, "다른 적용 요청에서 사용한 operation ID입니다.")
        if existing.request_hash != request_hash:
            raise Problem(409, "같은 operation ID의 적용 내용이 다릅니다.")
        items = _validate_current(db, draft, actor, revisions=False)
        selected = set(payload.selected_proposal_ids)
        proposals = [
            PlanningProposal.model_validate(value)
            for value in draft.proposals
            if value["id"] in selected
        ]
        _permissions(db, draft, actor, proposals, items)
        for link_data in existing.receipt["links"]:
            link = db.get(Link, link_data["id"])
            if link is None:
                raise Problem(409, "적용 결과 연결을 다시 확인해 주세요.")
            require_project_access(
                db, link.project_id, actor, "relation.write"
            )
        for item_data in (
            existing.receipt["created_items"]
            + existing.receipt["updated_items"]
        ):
            current = db.get(Item, item_data["id"])
            if current is None:
                raise Problem(409, "적용 결과의 항목이 변경되었습니다.")
            require_project_access(db, current.project_id, actor)
        return copy.deepcopy(existing.receipt)
    proposals = _selection(draft, payload)
    items = _validate_current(db, draft, actor, revisions=True)
    _permissions(db, draft, actor, proposals, items)
    with db.begin_nested():
        receipt, _ = _execute(db, draft, actor, proposals, items)
        receipt["operation_id"] = payload.operation_id
        receipt["applied_version"] = draft.version
        draft.status = "applied"
        draft.version += 1
        draft.updated_at = utcnow()
        db.add(
            PlanningApplication(
                operation_id=payload.operation_id,
                draft_id=draft.id,
                actor_id=actor,
                request_hash=request_hash,
                receipt=receipt,
            )
        )
        db.flush()
    return receipt
