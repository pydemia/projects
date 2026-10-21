"""Durable leased runs: locked inputs, bounded retries, explicit draft apply."""

import json
import logging
import threading
from datetime import timedelta
from typing import Protocol

from pydantic import ValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from starlette.datastructures import State

from projects.database import Item, Project, SkillRun, utcnow
from projects.domain import Problem
from projects.records import (
    add_link,
    create_item,
    item_for_user,
    require_revision,
    revise_item,
    serialize,
)
from projects.runtime import (
    OpenAICompatibleRunner,
    RunRequest,
    RunResult,
    RuntimeFailure,
    build_messages,
)
from projects.schemas import RunInput

logger = logging.getLogger(__name__)


class Runner(Protocol):
    def run(self, messages: list[dict[str, str]]) -> RunResult: ...


def event(run: SkillRun, status: str, detail: str = "") -> None:
    run.events = [
        *run.events,
        {
            "at": utcnow().isoformat(),
            "status": status,
            "attempt": run.attempt,
            "detail": detail,
        },
    ]
    run.updated_at = utcnow()


def enqueue_run(
    db: Session,
    state: State,
    project_id: str,
    user_id: str,
    payload: RunInput,
) -> SkillRun:
    target = (
        item_for_user(db, payload.target_id, user_id)
        if payload.target_id
        else None
    )
    if target is not None and target.project_id != project_id:
        raise Problem(
            422, "다른 프로젝트의 문서를 실행 대상으로 사용할 수 없습니다."
        )
    if payload.operation in ("revise_document", "review_document") and (
        target is None or target.kind != "artifact"
    ):
        raise Problem(422, "수정·검수할 문서를 선택해 주세요.")
    if payload.operation == "analyze_idea" and (
        target is None or target.kind != "idea"
    ):
        raise Problem(422, "요건화할 아이디어를 선택해 주세요.")
    sources: dict[str, Item] = {}
    for source_id in payload.source_ids:
        source = item_for_user(db, source_id, user_id)
        if source.project_id != project_id:
            raise Problem(422, "같은 프로젝트의 근거만 사용합니다.")
        sources[source.id] = source
    if target:
        sources[target.id] = target
    if payload.operation == "analyze_idea":
        for source in db.scalars(
            select(Item)
            .where(
                Item.project_id == project_id,
                Item.kind.in_(["feature", "requirement"]),
            )
            .order_by(Item.id)
        ):
            sources[source.id] = source
    manifest = state.catalog.validate_manifest(payload.reference_manifest)
    for source_id in manifest.get("project_source_refs", []):
        source = item_for_user(db, source_id, user_id)
        if source.project_id != project_id:
            raise Problem(422, "같은 프로젝트의 문서 자료만 선택해 주세요.")
        sources[source.id] = source
    snapshots = [serialize(x) for x in sources.values()]
    if (
        len(snapshots) > 100
        or len(json.dumps(snapshots, ensure_ascii=False)) > 160000
    ):
        raise Problem(422, "입력 한도입니다. 필요한 문서·절만 선택해 주세요.")
    locks = [
        state.resolver.resolve(x) for x in dict.fromkeys(payload.skill_ids)
    ]
    run = SkillRun(
        project_id=project_id,
        operation=payload.operation,
        instruction=payload.instruction,
        target_id=target.id if target else None,
        target_revision=target.revision if target else None,
        skill_ids=list(dict.fromkeys(payload.skill_ids)),
        skills_lock=locks,
        source_snapshots=snapshots,
        reference_manifest=manifest,
        events=[],
    )
    db.add(run)
    db.flush()
    event(run, "queued")
    return run


def configured_runner(state: State) -> Runner:
    if state.runner is not None:
        return state.runner
    settings = state.settings
    if settings.llm_provider in ("codex_login", "codex-login"):
        from projects.codex_runner import CodexLoginRunner

        state.runner = CodexLoginRunner(settings)
        return state.runner
    if settings.llm_provider in ("openai_compatible", "openai-compatible"):
        state.runner = OpenAICompatibleRunner(
            settings.llm_base_url,
            settings.llm_api_key,
            settings.llm_model,
            timeout=settings.llm_timeout_seconds,
        )
        return state.runner
    raise RuntimeFailure("not_configured", "LLM 실행 설정을 확인해 주세요.")


def validate_result_ids(result: RunResult, sources: list[dict]) -> None:
    ids = {x["id"] for x in sources}
    features = {x["id"] for x in sources if x["kind"] == "feature"}
    artifacts = {x["id"] for x in sources if x["kind"] == "artifact"}
    if not set(result.source_ids) <= ids:
        raise RuntimeFailure(
            "invalid_sources", "실행 입력에 없는 출처 ID입니다."
        )
    for candidate in result.requirements:
        if not set(candidate.feature_ids) <= features:
            raise RuntimeFailure(
                "invalid_features", "입력에 없는 기존 기능을 참조했습니다."
            )
        if any(
            x.artifact_id not in artifacts for x in candidate.design_changes
        ):
            raise RuntimeFailure(
                "invalid_artifacts", "입력에 없는 설계 문서를 참조했습니다."
            )


def process_next_run(
    state: State, shutdown: threading.Event | None = None
) -> bool:
    with Session(state.engine) as db, db.begin():
        run = db.scalar(
            select(SkillRun)
            .where(
                or_(
                    SkillRun.status == "queued",
                    and_(
                        SkillRun.status == "running",
                        SkillRun.lease_until < utcnow(),
                    ),
                )
            )
            .order_by(SkillRun.created_at, SkillRun.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if run is None:
            return False
        if run.status == "running":
            event(run, "interrupted", "이전 작업자의 lease가 만료되었습니다.")
        if run.attempt >= 3:
            run.status = "failed"
            run.error = "실행 재시도 한도에 도달했습니다."
            event(run, "failed", run.error)
            return True
        run.status = "running"
        run.attempt += 1
        run.lease_until = utcnow() + timedelta(seconds=360)
        event(run, "running")
        snapshot = serialize(run)
        attempt = run.attempt

    def cancelled() -> bool:
        if shutdown is not None and shutdown.is_set():
            return True
        with Session(state.engine) as check:
            current = check.get(SkillRun, snapshot["id"])
            return (
                current is None
                or current.status != "running"
                or current.attempt != attempt
            )

    try:
        bundles = [
            state.resolver.read_bundle(x["cache_key"])
            for x in snapshot["skills_lock"]
        ]
        target = next(
            (
                x["body"]
                for x in snapshot["source_snapshots"]
                if x["id"] == snapshot["target_id"]
            ),
            None,
        )
        request = RunRequest(
            operation=snapshot["operation"],
            instruction=snapshot["instruction"],
            target=target,
            sources=snapshot["source_snapshots"],
            reference_manifest=snapshot["reference_manifest"],
        )
        messages = build_messages(request, bundles)
        if len(json.dumps(messages, ensure_ascii=False)) > 700000:
            raise RuntimeFailure(
                "input_limit", "스킬과 문서 입력이 한도를 초과했습니다."
            )
        runner = configured_runner(state)
        from projects.codex_runner import CodexLoginRunner

        result = (
            runner.run(messages, cancelled=cancelled)
            if isinstance(runner, CodexLoginRunner)
            else runner.run(messages)
        )
        validate_result_ids(result, snapshot["source_snapshots"])
        with Session(state.engine) as db, db.begin():
            current = db.scalar(
                select(SkillRun)
                .where(SkillRun.id == snapshot["id"])
                .with_for_update()
            )
            if (
                current
                and current.status == "running"
                and current.attempt == attempt
            ):
                current.result = result.model_dump()
                current.status = "review_ready"
                current.error = None
                event(current, "review_ready")
    except (RuntimeFailure, ValidationError) as exc:
        message = (
            exc.message
            if isinstance(exc, RuntimeFailure)
            else "실행 결과 형식이 올바르지 않습니다."
        )
        with Session(state.engine) as db, db.begin():
            current = db.scalar(
                select(SkillRun)
                .where(SkillRun.id == snapshot["id"])
                .with_for_update()
            )
            if (
                current
                and current.status == "running"
                and current.attempt == attempt
            ):
                current.status = "failed"
                current.error = message
                event(current, "failed", message)
    return True


class Worker:
    def __init__(self, state: State) -> None:
        self.state = state
        self.shutdown = threading.Event()
        self.thread = threading.Thread(
            target=self._work, daemon=True, name="projects-runs"
        )

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.shutdown.set()
        self.thread.join(timeout=8)

    def _work(self) -> None:
        while not self.shutdown.is_set():
            try:
                processed = process_next_run(self.state, self.shutdown)
            except Exception:
                # Worker isolation: log no exception payload containing user input.
                logger.error(
                    "Skill worker failed; queued inputs remain durable."
                )
                processed = False
            if not processed:
                self.shutdown.wait(0.5)


def apply_result(
    db: Session,
    run: SkillRun,
    user_id: str,
    selected: list[int],
    *,
    apply_document: bool = False,
) -> None:
    if run.status == "applied":
        return
    if run.status != "review_ready" or run.result is None:
        raise Problem(409, "검토 가능한 실행 결과가 없습니다.")
    result = RunResult.model_validate(run.result)
    validate_result_ids(result, run.source_snapshots)
    writes_document = (
        apply_document
        and result.document is not None
        and run.operation != "review_document"
    )
    records_review = run.operation == "review_document" and bool(
        result.review.strip()
    )
    if not writes_document and not selected and not records_review:
        raise Problem(422, "적용할 문서 또는 후보를 선택해 주세요.")
    if len(set(selected)) != len(selected) or any(
        x < 0 or x >= len(result.requirements) for x in selected
    ):
        raise Problem(422, "유효한 후보를 선택해 주세요.")
    target = (
        item_for_user(db, run.target_id, user_id, lock=True)
        if run.target_id
        else None
    )
    if target is not None:
        require_revision(target, run.target_revision or 0)
    # Serialize whole change bundles and dependency insertion in one transaction.
    db.scalar(
        select(Project).where(Project.id == run.project_id).with_for_update()
    )
    applied = []
    if writes_document:
        assert result.document is not None
        if target is not None and target.kind == "artifact":
            document = revise_item(
                db,
                target,
                target.revision,
                target.title,
                result.document,
                target.data,
            )
        else:
            fields = {
                key: run.reference_manifest[key]
                for key in (
                    "artifact_type",
                    "template_ref",
                    "template_version",
                    "example_refs",
                    "inspection_status",
                    "project_source_refs",
                )
                if key in run.reference_manifest
            }
            document = create_item(
                db,
                run.project_id,
                "artifact",
                run.instruction[:120],
                result.document,
                fields,
            )
        applied.append(document.id)
    for index in selected:
        candidate = result.requirements[index]
        if candidate.disposition in ("conflict", "defer", "duplicate"):
            decision = create_item(
                db,
                run.project_id,
                "decision",
                candidate.title,
                candidate.body,
                {"reason": f"{candidate.disposition}: {candidate.rationale}"},
            )
            applied.append(decision.id)
            if target:
                add_link(db, run.project_id, decision, target, "source")
            for feature_id in candidate.feature_ids:
                feature = item_for_user(db, feature_id, user_id)
                add_link(db, run.project_id, decision, feature, "relates_to")
            continue
        requirement = create_item(
            db,
            run.project_id,
            "requirement",
            candidate.title,
            candidate.body,
            {
                "acceptance_criteria": candidate.acceptance_criteria,
                "feature_ids": candidate.feature_ids,
                "disposition": candidate.disposition,
            },
        )
        applied.append(requirement.id)
        if target:
            add_link(db, run.project_id, requirement, target, "source")
        for feature_id in candidate.feature_ids:
            feature = item_for_user(db, feature_id, user_id)
            if feature.project_id != run.project_id:
                raise Problem(422, "기능의 프로젝트가 다릅니다.")
            add_link(db, run.project_id, requirement, feature, "relates_to")
        tasks = []
        for draft in candidate.tasks:
            task = create_item(
                db,
                run.project_id,
                "task",
                draft.title,
                draft.body,
                {"acceptance_criteria": draft.acceptance_criteria},
            )
            tasks.append(task)
            applied.append(task.id)
            add_link(db, run.project_id, task, requirement, "implements")
        for change in candidate.design_changes:
            artifact = item_for_user(db, change.artifact_id, user_id)
            task = create_item(
                db,
                run.project_id,
                "task",
                "설계 보완: " + artifact.title[: 300 - len("설계 보완: ")],
                change.instruction,
                {
                    "acceptance_criteria": [change.instruction],
                    "requires_test": False,
                },
            )
            applied.append(task.id)
            add_link(db, run.project_id, task, requirement, "implements")
            add_link(db, run.project_id, task, artifact, "relates_to")
        for test_draft in candidate.tests:
            case = create_item(
                db,
                run.project_id,
                "test_case",
                test_draft.title,
                "",
                {"steps": test_draft.steps, "expected": test_draft.expected},
            )
            applied.append(case.id)
            add_link(db, run.project_id, case, requirement, "verifies")
            for task in tasks:
                add_link(db, run.project_id, case, task, "verifies")
    review = create_item(
        db,
        run.project_id,
        "decision",
        "스킬 실행 검토 기록",
        result.review,
        {"reason": "선택한 실행 결과를 초안에 적용"},
    )
    applied.append(review.id)
    run.applied_ids = applied
    run.status = "applied"
    event(run, "applied")
    db.flush()
