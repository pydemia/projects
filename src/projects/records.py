"""Transactional project records and completion checks."""

import copy
from collections import Counter

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    Revision,
    TestRun,
    utcnow,
)
from projects.domain import Problem, check_dependency_cycle, validate_item_data


def serialize(row: object) -> dict:
    columns = row.__table__.columns  # type: ignore[attr-defined]
    return {
        column.name: getattr(row, column.name).isoformat()
        if hasattr(getattr(row, column.name), "isoformat")
        else copy.deepcopy(getattr(row, column.name))
        for column in columns
    }


def project_for_user(db: Session, project_id: str, user_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user_id:
        raise Problem(404, "프로젝트를 찾을 수 없습니다.")
    return project


def item_for_user(
    db: Session,
    item_id: str,
    user_id: str,
    *,
    lock: bool = False,
) -> Item:
    statement = select(Item).where(Item.id == item_id)
    if lock:
        statement = statement.with_for_update().execution_options(
            populate_existing=True,
        )
    item = db.scalar(statement)
    if item is None:
        raise Problem(404, "항목을 찾을 수 없습니다.")
    project_for_user(db, item.project_id, user_id)
    return item


def require_revision(item: Item, expected: int) -> None:
    if item.revision != expected:
        raise Problem(
            409,
            "다른 변경이 저장되었습니다. 내 초안과 최신 문서를 비교해 주세요.",
        )


def store_revision(db: Session, item: Item) -> None:
    db.flush()
    db.add(
        Revision(
            item_id=item.id,
            revision=item.revision,
            title=item.title,
            body=item.body,
            data=copy.deepcopy(item.data),
            status=item.status,
        )
    )
    db.flush()


def create_item(
    db: Session,
    project_id: str,
    kind: str,
    title: str,
    body: str,
    data: dict,
) -> Item:
    if not title.strip():
        raise Problem(422, "제목을 입력해 주세요.")
    if len(title) > 300 or len(body) > 500000:
        raise Problem(422, "제목 또는 본문 크기가 저장 한도를 초과했습니다.")
    item = Item(
        project_id=project_id,
        kind=kind,
        title=title.strip(),
        body=body,
        data=validate_item_data(kind, data),
    )
    db.add(item)
    store_revision(db, item)
    return item


def revise_item(
    db: Session,
    item: Item,
    expected: int,
    title: str,
    body: str,
    data: dict,
    *,
    status: str = "draft",
) -> Item:
    require_revision(item, expected)
    if not title.strip():
        raise Problem(422, "제목을 입력해 주세요.")
    if len(title) > 300 or len(body) > 500000:
        raise Problem(422, "제목 또는 본문 크기가 저장 한도를 초과했습니다.")
    validated = validate_item_data(item.kind, data)
    if item.kind == "task" and validated["state"] == "done":
        check_task_completion(db, item, validated)
    item.title = title.strip()
    item.body = body
    item.data = validated
    item.status = status
    item.revision += 1
    item.updated_at = utcnow()
    store_revision(db, item)
    return item


def project_items(db: Session, project_id: str) -> list[Item]:
    return list(
        db.scalars(
            select(Item)
            .where(Item.project_id == project_id)
            .order_by(Item.created_at, Item.id),
        )
    )


def project_links(db: Session, project_id: str) -> list[Link]:
    return list(
        db.scalars(
            select(Link)
            .where(Link.project_id == project_id)
            .order_by(Link.id),
        )
    )


def add_link(
    db: Session,
    project_id: str,
    source: Item,
    target: Item,
    relation: str,
) -> Link:
    # Project row serializes concurrent dependency inserts, including inverse edges.
    db.scalar(
        select(Project).where(Project.id == project_id).with_for_update()
    )
    if source.project_id != project_id or target.project_id != project_id:
        raise Problem(422, "같은 프로젝트의 항목만 연결할 수 있습니다.")
    existing = db.scalar(
        select(Link).where(
            Link.source_id == source.id,
            Link.target_id == target.id,
            Link.relation == relation,
        )
    )
    if existing:
        return existing
    if source.id == target.id:
        raise Problem(422, "자기 자신을 연결할 수 없습니다.")
    if relation == "depends_on":
        if source.kind != "task" or target.kind != "task":
            raise Problem(422, "선행 관계는 작업끼리 연결합니다.")
        edges = [
            (x.source_id, x.target_id)
            for x in project_links(db, project_id)
            if x.relation == "depends_on"
        ]
        check_dependency_cycle(source.id, target.id, edges)
    if relation == "verifies" and source.kind != "test_case":
        raise Problem(422, "검증 관계의 출발점은 테스트 케이스여야 합니다.")
    link = Link(
        project_id=project_id,
        source_id=source.id,
        target_id=target.id,
        relation=relation,
        source_revision=source.revision,
        target_revision=target.revision,
    )
    db.add(link)
    db.flush()
    return link


def is_stale(link: Link, items: dict[str, Item]) -> bool:
    return (
        link.source_id not in items
        or link.target_id not in items
        or items[link.source_id].revision != link.source_revision
        or items[link.target_id].revision != link.target_revision
        or link.review.get("impact") == "action_required"
    )


def latest_case_run(db: Session, case: Item) -> TestRun | None:
    return db.scalar(
        select(TestRun)
        .where(
            TestRun.case_id == case.id,
            TestRun.case_revision == case.revision,
        )
        .order_by(TestRun.created_at.desc(), TestRun.id.desc())
        .limit(1)
    )


def check_task_completion(db: Session, task: Item, data: dict) -> None:
    if (
        not any(x.strip() for x in data["acceptance_criteria"])
        or not data["result_url"].strip()
    ):
        raise Problem(409, "완료 조건과 결과 근거를 기록해 주세요.")
    items = {x.id: x for x in project_items(db, task.project_id)}
    links = project_links(db, task.project_id)
    for link in links:
        if link.source_id == task.id and link.relation == "depends_on":
            if items[link.target_id].data.get("state") != "done":
                raise Problem(409, "선행 작업이 완료되지 않았습니다.")
    if data["requires_test"]:
        cases = [
            items[x.source_id]
            for x in links
            if x.target_id == task.id and x.relation == "verifies"
        ]
        if not cases or not data["target_sha"].strip():
            raise Problem(409, "연결된 테스트와 대상 commit이 필요합니다.")
        for case in cases:
            run = latest_case_run(db, case)
            if (
                run is None
                or run.outcome != "passed"
                or run.target_sha != data["target_sha"]
            ):
                raise Problem(
                    409,
                    "현행 케이스·대상 commit에 대한 통과 근거가 필요합니다.",
                )


def trace(db: Session, project_id: str) -> dict:
    items = {x.id: x for x in project_items(db, project_id)}
    links = project_links(db, project_id)
    stale = [x for x in links if is_stale(x, items)]
    # Traverse ordinary links with a visited set; their cycles are allowed.
    requirements = []
    for item in items.values():
        if item.kind != "requirement":
            continue
        connected = {item.id}
        stack = [item.id]
        while stack:
            current = stack.pop()
            for edge in links:
                if current in (edge.source_id, edge.target_id):
                    other = (
                        edge.target_id
                        if current == edge.source_id
                        else edge.source_id
                    )
                    if other not in connected:
                        connected.add(other)
                        stack.append(other)
        related = [
            x
            for x in links
            if x.source_id in connected and x.target_id in connected
        ]
        requirements.append(
            {
                "item": serialize(item),
                "links": [serialize(x) for x in related],
                "needs_review": any(x in stale for x in related),
            }
        )
    return {
        "requirements": requirements,
        "stale_links": [serialize(x) for x in stale],
    }


def project_summary(db: Session, project_id: str) -> dict:
    items = project_items(db, project_id)
    tasks = [
        x for x in items if x.kind == "task" and x.data["state"] != "cancelled"
    ]
    artifacts = [x for x in items if x.kind == "artifact"]
    cases = [x for x in items if x.kind == "test_case"]
    latest = [latest_case_run(db, x) for x in cases]
    return {
        "items_by_kind": dict(Counter(x.kind for x in items)),
        "tasks": {
            "done": sum(x.data["state"] == "done" for x in tasks),
            "total": len(tasks),
            "cancelled": sum(
                x.kind == "task" and x.data["state"] == "cancelled"
                for x in items
            ),
        },
        "artifacts": {
            "confirmed": sum(x.status == "confirmed" for x in artifacts),
            "total": len(artifacts),
        },
        "tests": {
            "passed": sum(
                x is not None and x.outcome == "passed" for x in latest
            ),
            "total": len(cases),
        },
        "needs_review": len(trace(db, project_id)["stale_links"]),
    }


def create_baseline(db: Session, project_id: str, name: str) -> Baseline:
    if not name.strip():
        raise Problem(422, "기준선 이름을 입력해 주세요.")
    db.scalar(
        select(Project).where(Project.id == project_id).with_for_update()
    )
    snapshot = {x.id: x.revision for x in project_items(db, project_id)}
    baseline = Baseline(project_id=project_id, name=name, revisions=snapshot)
    db.add(baseline)
    db.flush()
    return baseline


def search_items(
    db: Session, project_id: str, kind: str | None, query: str
) -> list[Item]:
    statement = select(Item).where(Item.project_id == project_id)
    if kind:
        statement = statement.where(Item.kind == kind)
    if query:
        pattern = (
            "%"
            + query.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
            + "%"
        )
        statement = statement.where(
            or_(
                Item.title.ilike(pattern, escape="\\"),
                Item.body.ilike(pattern, escape="\\"),
                Item.id == query,
            )
        )
    return list(
        db.scalars(statement.order_by(Item.updated_at.desc(), Item.id))
    )
