"""Transactional project records and completion checks."""

import copy
from collections import Counter

from sqlalchemy import cast, or_, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, object_session
from sqlalchemy.sql.elements import ColumnElement

from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    ProjectArchiveReferences,
    Revision,
    TaskTransfer,
    TestRun,
    utcnow,
)
from projects.domain import (
    TASK_CLOSED_STATES,
    Problem,
    check_dependency_cycle,
    check_task_parent,
    validate_item_data,
)
from projects.project_access import (
    accessible_project_ids,
    lock_project_access,
    require_project_access,
)
from projects.task_fields import validate_custom_values


def serialize(row: object) -> dict:
    columns = row.__table__.columns  # type: ignore[attr-defined]
    data = {
        column.name: getattr(row, column.name).isoformat()
        if hasattr(getattr(row, column.name), "isoformat")
        else copy.deepcopy(getattr(row, column.name))
        for column in columns
    }
    if isinstance(row, Item) and row.kind == "task":
        if data["data"].get("state") == "cancelled":
            data["data"]["state"] = "closed"
    return data


def project_for_user(
    db: Session,
    project_id: str,
    user_id: str,
    permission: str = "project.read",
    *,
    lock: bool = False,
) -> Project:
    return require_project_access(
        db, project_id, user_id, permission, lock=lock
    )


def item_for_user(
    db: Session,
    item_id: str,
    user_id: str,
    permission: str = "project.read",
    *,
    lock: bool = False,
) -> Item:
    statement = select(Item).where(Item.id == item_id)
    if lock:
        current = db.scalar(statement)
        if current is None:
            raise Problem(404, "항목을 찾을 수 없습니다.")
        original_project_id = current.project_id
        project_for_user(
            db, original_project_id, user_id, permission, lock=True
        )
        statement = statement.with_for_update().execution_options(
            populate_existing=True,
        )
    item = db.scalar(statement)
    if item is None:
        raise Problem(404, "항목을 찾을 수 없습니다.")
    if lock and item.project_id != original_project_id:
        raise Problem(409, "항목 소속이 변경되었습니다. 다시 확인해 주세요.")
    project_for_user(db, item.project_id, user_id, permission)
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
    validated = validate_item_data(kind, data)
    if kind == "requirement":
        if validated["processing_state"] == "fulfilled":
            raise Problem(
                422, "Story 충족은 수용 조건 검증으로 기록해 주세요."
            )
        if "processing_state" not in data:
            validated["processing_state"] = "raised"
    if kind == "task":
        project = db.get(Project, project_id)
        assert project is not None
        validate_custom_values(
            db,
            project.owner_id,
            validated["custom_fields"],
            project_id=project_id,
        )
    item = Item(
        project_id=project_id,
        kind=kind,
        title=title.strip(),
        body=body,
        data=validated,
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
    completion_states: dict[str, str] | None = None,
    allow_workflow_change: bool = False,
    actor_id: str | None = None,
) -> Item:
    require_revision(item, expected)
    if not title.strip():
        raise Problem(422, "제목을 입력해 주세요.")
    if len(title) > 300 or len(body) > 500000:
        raise Problem(422, "제목 또는 본문 크기가 저장 한도를 초과했습니다.")
    validated = validate_item_data(item.kind, data)
    if (
        item.kind == "requirement"
        and validated["processing_state"] == "fulfilled"
        and item.data.get("processing_state") != "fulfilled"
    ):
        raise Problem(422, "Story 충족은 수용 조건 검증으로 기록해 주세요.")
    if item.kind == "task":
        project = db.get(Project, item.project_id)
        assert project is not None
        validate_custom_values(
            db,
            project.owner_id,
            validated["custom_fields"],
            project_id=item.project_id,
        )
    if (
        item.kind == "task"
        and (item.data.get("workflow", "delivery") != validated["workflow"])
        and not allow_workflow_change
    ):
        raise Problem(409, "작업 유형은 별도의 유형 변경으로 수정해 주세요.")
    if item.kind == "task" and validated["state"] == "done":
        check_task_completion(
            db, item, validated, completion_states, actor_id=actor_id
        )
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
            .where(
                or_(
                    Link.project_id == project_id,
                    Link.source_id.in_(
                        select(Item.id).where(Item.project_id == project_id)
                    ),
                    Link.target_id.in_(
                        select(Item.id).where(Item.project_id == project_id)
                    ),
                )
            )
            .order_by(Link.id),
        )
    )


def add_link(
    db: Session,
    project_id: str,
    source: Item,
    target: Item,
    relation: str,
    *,
    actor_id: str | None = None,
) -> Link:
    owner = db.get(Project, project_id)
    assert owner is not None
    actor_id = actor_id or owner.owner_id
    # Different actors may write the same dependency graph. Project locks
    # protect ACL changes; the graph lock also serializes disjoint inserts
    # that together would close a cross-project cycle.
    project_ids = {project_id, source.project_id, target.project_id}
    lock_project_access(db, project_ids)
    for item in (source, target):
        db.refresh(item)
        if item.project_id not in project_ids:
            raise Problem(
                409, "항목 소속이 변경되었습니다. 다시 확인해 주세요."
            )
    if relation == "depends_on":
        db.execute(
            text(
                "SELECT pg_advisory_xact_lock(hashtext('projects.dependency_graph'))"
            )
        )
    project_for_user(db, project_id, actor_id, "relation.write")
    for item in (source, target):
        project_for_user(db, item.project_id, actor_id, "relation.write")
    if relation == "subtask_of":
        if (
            source.kind != "task"
            or target.kind != "task"
            or source.project_id != target.project_id
            or project_id != source.project_id
        ):
            raise Problem(
                422, "상위·하위 작업은 같은 프로젝트의 작업끼리 연결합니다."
            )
        project_for_user(db, source.project_id, actor_id, "task.update")
        check_task_parent(
            source.id,
            target.id,
            list(
                db.execute(
                    select(Link.source_id, Link.target_id).where(
                        Link.project_id == project_id,
                        Link.relation == "subtask_of",
                    )
                ).tuples()
            ),
        )
    if source.id == target.id:
        raise Problem(422, "자기 자신을 연결할 수 없습니다.")
    endpoints: ColumnElement[bool] = (Link.source_id == source.id) & (
        Link.target_id == target.id
    )
    if relation == "relates_to":
        endpoints = or_(
            endpoints,
            (Link.source_id == target.id) & (Link.target_id == source.id),
        )
    existing = db.scalar(
        select(Link)
        .where(
            endpoints,
            Link.relation == relation,
        )
        .order_by(Link.id)
    )
    if existing:
        project_for_user(db, existing.project_id, actor_id, "relation.write")
        return existing
    if relation == "depends_on":
        if source.kind != "task" or target.kind != "task":
            raise Problem(422, "선행 관계는 작업끼리 연결합니다.")
        edges = [
            (x.source_id, x.target_id)
            for x in db.scalars(
                select(Link).where(Link.relation == "depends_on")
            )
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


def set_task_parent(
    db: Session,
    user_id: str,
    item_id: str,
    parent_task_id: str | None,
    expected_parent_id: str | None,
) -> None:
    child = item_for_user(db, item_id, user_id, "task.update", lock=True)
    project_for_user(db, child.project_id, user_id, "relation.write")
    if child.kind != "task":
        raise Problem(422, "작업에만 상위 작업을 지정할 수 있습니다.")
    current = list(
        db.scalars(
            select(Link).where(
                Link.source_id == child.id, Link.relation == "subtask_of"
            )
        )
    )
    if len(current) > 1:
        raise Problem(409, "상위 작업 관계를 다시 확인해 주세요.")
    current_parent = current[0].target_id if current else None
    if current_parent != expected_parent_id:
        raise Problem(409, "상위 작업이 변경되었습니다. 다시 불러와 주세요.")
    if parent_task_id == current_parent:
        return
    parent = (
        item_for_user(db, parent_task_id, user_id) if parent_task_id else None
    )
    if parent is not None and parent.project_id != child.project_id:
        raise Problem(422, "같은 프로젝트의 상위 작업을 선택해 주세요.")
    with db.begin_nested():
        for link in current:
            db.delete(link)
        db.flush()
        if parent is not None:
            add_link(
                db,
                child.project_id,
                child,
                parent,
                "subtask_of",
                actor_id=user_id,
            )


def is_stale(link: Link, items: dict[str, Item]) -> bool:
    return (
        link.source_id not in items
        or link.target_id not in items
        or not equivalent_revision(items[link.source_id], link.source_revision)
        or not equivalent_revision(items[link.target_id], link.target_revision)
        or link.review.get("impact") == "action_required"
    )


def equivalent_revision(item: Item, revision: int) -> bool:
    if item.revision == revision:
        return True
    db = object_session(item)
    if db is None or revision > item.revision:
        return False
    original = db.get(Revision, (item.id, revision))
    if original is None or any(
        getattr(original, key) != getattr(item, key)
        for key in ("title", "body", "data", "status")
    ):
        return False
    # Read only receipts that can explain this item's revision chain.
    transfers = db.scalars(
        select(TaskTransfer).where(
            cast(TaskTransfer.changes, JSONB).contains([{"id": item.id}])
        )
    )
    changes = {
        change["before_revision"]
        for transfer in transfers
        for change in transfer.changes
        if change["id"] == item.id
        and change["after_revision"] == change["before_revision"] + 1
    }
    for number in range(revision, item.revision):
        if number not in changes:
            return False
        snapshot = db.get(Revision, (item.id, number + 1))
        if snapshot is None or any(
            getattr(snapshot, key) != getattr(original, key)
            for key in ("title", "body", "data", "status")
        ):
            return False
    return True


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


def check_task_completion(
    db: Session,
    task: Item,
    data: dict,
    completion_states: dict[str, str] | None = None,
    *,
    actor_id: str | None = None,
) -> None:
    references = db.get(ProjectArchiveReferences, task.project_id)
    if references is not None and any(
        (
            (link["source_id"] == task.id and link["relation"] == "depends_on")
            or (
                link["target_id"] == task.id and link["relation"] == "verifies"
            )
        )
        and (
            link["source_id"] in references.data.get("missing_item_ids", [])
            or link["target_id"] in references.data.get("missing_item_ids", [])
        )
        for link in references.data.get("links", [])
    ):
        raise Problem(
            409, "복구한 외부 의존·테스트 참조가 누락되어 완료할 수 없습니다."
        )
    owner = db.get(Project, task.project_id)
    assert owner is not None
    links = list(
        db.scalars(
            select(Link).where(
                or_(Link.source_id == task.id, Link.target_id == task.id)
            )
        )
    )
    actor_id = actor_id or owner.owner_id
    try:
        items = {
            item_id: item_for_user(db, item_id, actor_id)
            for item_id in {
                task.id,
                *(
                    endpoint
                    for link in links
                    for endpoint in (link.source_id, link.target_id)
                ),
            }
        }
    except Problem as exc:
        if exc.status == 404:
            raise Problem(
                409, "참조 자료의 접근권을 확인할 수 없어 완료할 수 없습니다."
            ) from exc
        raise
    for link in links:
        if link.source_id == task.id and link.relation == "depends_on":
            state = (completion_states or {}).get(
                link.target_id, items[link.target_id].data.get("state")
            )
            if state != "done":
                raise Problem(409, "선행 작업이 완료되지 않았습니다.")
    if data["workflow"] == "personal":
        return
    if (
        not any(x.strip() for x in data["acceptance_criteria"])
        or not data["result_url"].strip()
    ):
        raise Problem(409, "완료 조건과 결과 근거를 기록해 주세요.")
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


def trace(
    db: Session, project_id: str, *, actor_id: str | None = None
) -> dict:
    items = {x.id: x for x in project_items(db, project_id)}
    links = project_links(db, project_id)
    project = db.get(Project, project_id)
    assert project is not None
    actor_id = actor_id or project.owner_id
    project_for_user(db, project_id, actor_id)
    readable = set(db.scalars(accessible_project_ids(db, actor_id)))
    visible_links = []
    for link in links:
        endpoints = [
            db.get(Item, item_id)
            for item_id in (link.source_id, link.target_id)
        ]
        if link.project_id not in readable or any(
            item is None or item.project_id not in readable
            for item in endpoints
        ):
            continue
        visible_links.append(link)
        for endpoint in endpoints:
            assert endpoint is not None
            items[endpoint.id] = endpoint
    links = visible_links
    stale = [x for x in links if is_stale(x, items)]
    # Traverse ordinary links with a visited set; their cycles are allowed.
    requirements = []
    for item in items.values():
        if item.kind != "requirement" or item.project_id != project_id:
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


def project_summary(
    db: Session, project_id: str, *, actor_id: str | None = None
) -> dict:
    items = project_items(db, project_id)
    tasks = Counter(x.data["state"] for x in items if x.kind == "task")
    closed_tasks = sum(tasks[state] for state in TASK_CLOSED_STATES)
    artifacts = [x for x in items if x.kind == "artifact"]
    cases = [x for x in items if x.kind == "test_case"]
    latest = [latest_case_run(db, x) for x in cases]
    return {
        "items_by_kind": dict(Counter(x.kind for x in items)),
        "tasks": {
            "done": tasks["done"],
            "total": tasks.total() - closed_tasks,
            "closed": closed_tasks,
            "cancelled": closed_tasks,  # Compatibility for existing clients.
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
        "needs_review": len(
            trace(db, project_id, actor_id=actor_id)["stale_links"]
        ),
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
