"""Seed explicitly requested, synthetic QA data for an existing owner.

Run in the deployed app environment. Existing projects are never rewritten;
the cohort marker makes reruns reuse the original QA set without resetting it.
"""

import argparse
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from projects.config import Settings
from projects.database import (
    Account,
    Item,
    Project,
    TaskPosition,
    TaskView,
    make_engine,
)
from projects.records import (
    add_link,
    create_baseline,
    create_item,
    revise_item,
    serialize,
)
from projects.schemas import TaskViewSettings
from projects.task_transfers import commit_transfer, preview_transfer
from projects.transfer_schemas import TransferCommit, TransferPreview

COHORT = "[qa-seed:2026-11-02-task-workspace-v2]"
NAMES = [
    "QA · 01 개인 작업",
    "QA · 02 개발·검증",
    "QA · 03 프로젝트 이동",
    "QA · 04 빈 프로젝트",
]


def existing_fingerprint(db, owner_id, excluded):
    projects = list(
        db.scalars(
            select(Project)
            .where(Project.owner_id == owner_id, Project.id.not_in(excluded))
            .order_by(Project.id)
        )
    )
    ids = [project.id for project in projects]
    items = list(
        db.scalars(
            select(Item).where(Item.project_id.in_(ids)).order_by(Item.id)
        )
    )
    return hashlib.sha256(
        json.dumps(
            [
                *[serialize(project) for project in projects],
                *[serialize(item) for item in items],
            ],
            sort_keys=True,
        ).encode()
    ).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--owner", required=True)
    args = parser.parse_args()
    engine = make_engine(Settings.from_env().database_url)
    day = datetime.now(ZoneInfo("Asia/Seoul")).date()

    def date_at(offset):
        return (day + timedelta(days=offset)).isoformat()

    result = {}
    with Session(engine) as db, db.begin():
        owner = db.scalar(
            select(Account)
            .where(Account.username == args.owner)
            .with_for_update()
        )
        if owner is None:
            raise ValueError("The specified existing owner was not found")
        prior = list(
            db.scalars(
                select(Project).where(
                    Project.owner_id == owner.id, Project.name.in_(NAMES)
                )
            )
        )
        if prior:
            if len(prior) != len(NAMES) or any(
                COHORT not in project.goal for project in prior
            ):
                raise ValueError(
                    "QA names conflict with existing data; no changes made"
                )
            projects = sorted(prior, key=lambda project: project.name)
            result["created"] = False
        else:
            before = existing_fingerprint(db, owner.id, [])
            last = (
                db.scalar(
                    select(func.max(Project.sort_order)).where(
                        Project.owner_id == owner.id
                    )
                )
                or 0
            )
            projects = []
            for index, name in enumerate(NAMES):
                project = Project(
                    owner_id=owner.id,
                    name=name,
                    sort_order=last + index + 1,
                    goal=f"{COHORT}\nQA용 가상 자료입니다. 실제 업무·검증 결과가 아닙니다.\n"
                    "01: 간편 관리·날짜 범위·보기 전환 / 02: 의존·테스트 gate·기준선 / "
                    "03: 단일·일괄 이동·되돌리기 / 04: 빈 상태를 확인합니다.\n"
                    "QA 진행 중 변경한 값은 재실행으로 초기화하지 않습니다.",
                    profile="simple" if index != 1 else "standard",
                )
                db.add(project)
                db.flush()
                projects.append(project)
            p1, p2, p3, _ = projects

            def task(project, title, **data):
                delivery = data.pop("delivery", False)
                return create_item(
                    db,
                    project.id,
                    "task",
                    title,
                    f"QA 샘플 · 실제 업무가 아닙니다.\n\n{title}\n"
                    "보기 전환 전후 ID·내용·필터를 비교하고, 이동할 때 영향 미리보기와 되돌리기를 확인하세요.",
                    {
                        "workflow": "delivery" if delivery else "personal",
                        "requires_test": False,
                        **data,
                    },
                )

            task(
                p1,
                "오늘 할 일 · 15분 안에 처리",
                planned_date=date_at(0),
                list_name="실행",
                estimated_minutes=15,
                context="desk",
                energy="low",
                abc_priority="A",
                abc_order=1,
            )
            task(
                p1,
                "지난 계획 · 마감일 없이도 오늘에 표시",
                planned_date=date_at(-3),
                list_name="실행",
                abc_priority="A",
                abc_order=2,
            )
            task(
                p1,
                "마감 지남 · 오늘 계획과 중복 없이 표시",
                planned_date=date_at(0),
                due_date=date_at(-1),
                list_name="실행",
            )
            task(
                p1,
                "Inbox · 날짜 없는 아이디어 정리",
                context="phone",
                estimated_minutes=10,
            )
            task(
                p1,
                "예정 · 내일 확인할 작업",
                planned_date=date_at(1),
                list_name="예정",
                abc_priority="B",
                abc_order=1,
            )
            task(
                p1,
                "예정 · 마감일만 있는 작업",
                due_date=date_at(4),
                list_name="예정",
                next_action=False,
            )
            task(
                p1,
                "날짜 없음 · 캘린더 보조 목록",
                list_name="언젠가",
                goal="날짜 없는 항목도 찾을 수 있어야 함",
            )
            task(
                p1,
                "다른 기간 · 다음 달 캘린더 작업",
                planned_date=date_at(45),
                list_name="예정",
                estimated_minutes=90,
                energy="high",
            )
            done = task(
                p1,
                "완료 예시 · 모든 상태에서 확인",
                planned_date=date_at(-1),
                list_name="실행",
            )
            revise_item(
                db,
                done,
                done.revision,
                done.title,
                done.body,
                {**done.data, "state": "done"},
            )
            cancelled = task(
                p1, "취소 예시 · 취소 사유 확인", list_name="보관"
            )
            revise_item(
                db,
                cancelled,
                cancelled.revision,
                cancelled.title,
                cancelled.body,
                {
                    **cancelled.data,
                    "state": "cancelled",
                    "cancellation_reason": "QA 예시: 우선순위 조정으로 실행하지 않음",
                },
            )

            feature = create_item(
                db,
                p2.id,
                "feature",
                "QA 기능 · 동일 작업의 보기·소속 변경",
                "QA용 기능 근거이며 운영 기능 승인 기록이 아닙니다.",
                {},
            )
            requirement = create_item(
                db,
                p2.id,
                "requirement",
                "QA 요구 · 이동 뒤 ID와 완료 조건 보존",
                "QA 샘플 요구사항",
                {
                    "acceptance_criteria": ["동일 ID·내용·관계 보존"],
                    "feature_ids": [feature.id],
                },
            )
            add_link(db, p2.id, requirement, feature, "source")
            predecessor = task(
                p2,
                "선행 작업 · 먼저 완료해야 하는 작업",
                delivery=True,
                list_name="구현",
                acceptance_criteria=["QA 체크리스트 검토"],
                planned_date=date_at(0),
            )
            dependent = task(
                p2,
                "의존 작업 · 선행 미완료 시 완료 차단",
                delivery=True,
                list_name="구현",
                acceptance_criteria=["선행 작업 완료와 결과 근거 확인"],
            )
            add_link(db, p2.id, dependent, predecessor, "depends_on")
            gated = task(
                p2,
                "테스트 gate · 실제 근거가 없어 완료 차단",
                delivery=True,
                requires_test=True,
                state="in_review",
                list_name="검증",
                acceptance_criteria=["연결된 케이스의 실제 실행 결과 필요"],
                target_sha="",
                result_url="",
            )
            case = create_item(
                db,
                p2.id,
                "test_case",
                "QA 케이스 · 이동 뒤 완료 gate 유지",
                "실제 테스트는 아직 실행하지 않았습니다. 통과 기록은 생성하지 않았습니다.",
                {
                    "steps": [
                        "작업을 다른 QA 프로젝트로 이동",
                        "완료 시도",
                        "테스트 근거가 없다는 안내 확인",
                    ],
                    "expected": "실제 테스트 근거 없이는 완료 차단",
                },
            )
            add_link(db, p2.id, case, gated, "verifies")
            linked = task(
                p2,
                "연결된 구현 작업 · 기준선·요구 보존 이동",
                delivery=True,
                state="in_progress",
                list_name="구현",
                acceptance_criteria=[
                    "다른 QA 프로젝트 이동 후 요구·기준선 확인"
                ],
                context="desk",
                abc_priority="A",
                abc_order=1,
            )
            add_link(db, p2.id, linked, requirement, "implements")
            task(
                p2,
                "일괄 이동 A · 함께 선택할 작업",
                list_name="일괄 이동",
                planned_date=date_at(0),
            )
            task(
                p2,
                "일괄 이동 B · 함께 선택할 작업",
                list_name="일괄 이동",
                planned_date=date_at(1),
            )
            task(
                p2,
                "긴 제목 · 모바일 화면에서 여러 줄로 표시해도 선택·상태·이동 버튼이 서로 겹치지 않는지 확인하는 작업",
                delivery=True,
                list_name="품질",
                acceptance_criteria=["320~430px에서 제목과 조작 영역 확인"],
            )
            task(
                p2,
                "충돌 확인 · 두 탭에서 수정할 작업",
                list_name="품질",
                state="in_progress",
            )
            create_baseline(
                db, p2.id, "QA 시작 기준선 · 실제 릴리즈 승인 아님"
            )

            task(
                p3,
                "이동 대상 · 현재 프로젝트 표시 확인",
                list_name="받은 작업",
                planned_date=date_at(0),
            )
            task(
                p3,
                "정렬 확인 · 진행 중인 작업",
                list_name="받은 작업",
                state="in_progress",
                abc_priority="B",
                estimated_minutes=30,
            )
            task(
                p3,
                "Note 참조 · 실제 접근 가능한 문서 URL 연결 연습",
                list_name="연계",
            )
            task(p3, "키보드 QA · 메뉴로 프로젝트 이동", list_name="받은 작업")
            task(
                p3,
                "모바일 QA · 날짜·상태·프로젝트 바꾸기",
                list_name="받은 작업",
                due_date=date_at(2),
            )
            history = task(
                p1,
                "이동 이력 예시 · 개인 작업에서 이동해 온 작업",
                list_name="받은 작업",
                planned_date=date_at(0),
            )
            request = TransferPreview(
                tasks=[
                    {"id": history.id, "expected_revision": history.revision}
                ],
                target_project_id=p3.id,
            )
            preview = preview_transfer(db, owner.id, request)
            commit_transfer(
                db,
                owner.id,
                TransferCommit(
                    **request.model_dump(),
                    preview_token=preview["preview_token"],
                    operation_id="qa-seed-20261102-history",
                ),
            )
            for project in projects:
                grouped = defaultdict(list)
                for item in db.scalars(
                    select(Item)
                    .where(Item.project_id == project.id, Item.kind == "task")
                    .order_by(Item.created_at, Item.id)
                ):
                    grouped[item.data["state"]].append(item)
                for items in grouped.values():
                    for index, item in enumerate(items):
                        position = db.get(TaskPosition, item.id)
                        if position is None:
                            db.add(
                                TaskPosition(item_id=item.id, position=index)
                            )
            for project, name, scope, view in [
                (p1, "QA · 오늘 간편 목록", "today", "list"),
                (p2, "QA · 개발 상태 보드", "all", "board"),
                (p3, "QA · 이동 대상 목록", "all", "list"),
            ]:
                settings = TaskViewSettings(
                    schema_version=2,
                    mode="simple" if project == p1 else "complex",
                    view=view,
                    task_scope=scope,
                    status="open",
                    grouping="state" if view == "board" else "none",
                )
                db.add(
                    TaskView(
                        project_id=project.id,
                        owner_id=owner.id,
                        scope_type="project",
                        name=name,
                        scope="personal",
                        settings=settings.model_dump(),
                        is_default=True,
                    )
                )
            db.flush()
            assert (
                existing_fingerprint(db, owner.id, [p.id for p in projects])
                == before
            ), "Existing user data changed"
            result["created"] = True
        result["date"] = day.isoformat()
        result["cohort"] = COHORT
        result["projects"] = [
            {
                "id": p.id,
                "name": p.name,
                "tasks": db.scalar(
                    select(func.count())
                    .select_from(Item)
                    .where(Item.project_id == p.id, Item.kind == "task")
                ),
                "url": f"https://projects.pydemia.ai/?project={p.id}&view=tasks",
            }
            for p in projects
        ]
        result["task_count"] = sum(p["tasks"] for p in result["projects"])
        if result["created"]:
            assert [p["tasks"] for p in result["projects"]] == [10, 8, 6, 0]
    engine.dispose()
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
