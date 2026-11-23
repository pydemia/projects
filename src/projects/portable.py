"""Plain Markdown handoff and verified project archives; no app secrets."""

import base64
import binascii
import copy
import difflib
import hashlib
import io
import json
from datetime import datetime
from pathlib import PurePosixPath
from uuid import UUID
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from sqlalchemy import cast, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from starlette.datastructures import State

from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    ProjectArchiveReferences,
    ProjectTaskFieldDefinition,
    RepositoryActivity,
    Revision,
    SkillRun,
    TaskPosition,
    TaskTransfer,
    TaskView,
    TestRun,
    utcnow,
)
from projects.domain import Problem, check_dependency_cycle, validate_item_data
from projects.planning_archive import (
    export_planning,
    import_planning,
    validate_planning,
)
from projects.project_access import (
    initialize_project_access,
    lock_project_access,
    require_project_access,
)
from projects.records import project_links, revise_item, serialize
from projects.repository_import import SHA, repository_name, scoped_path
from projects.schemas import ReconnectInput, TaskFieldInput, TaskViewInput
from projects.task_fields import validate_custom_values, validate_view_fields


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def json_bytes(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")


def zip_files(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for path, content in sorted(files.items()):
            archive.writestr(path, content)
    return buffer.getvalue()


def _provenance_project_ids(value: object) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key in (
                "project_id",
                "source_project_id",
                "target_project_id",
            ) and isinstance(child, str):
                result.add(child)
            else:
                result.update(_provenance_project_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.update(_provenance_project_ids(child))
    return result


def _check_export_provenance(
    db: Session, actor_id: str, value: object, *, lock: bool = True
) -> None:
    projects = _provenance_project_ids(value)
    item_ids = _provenance_item_ids(value)
    original_projects = {
        item_id: project_id
        for item_id, project_id in db.execute(
            select(Item.id, Item.project_id).where(Item.id.in_(item_ids))
        ).all()
    }
    projects.update(original_projects.values())
    if lock:
        lock_project_access(db, projects)
        current_projects = {
            item_id: project_id
            for item_id, project_id in db.execute(
                select(Item.id, Item.project_id).where(Item.id.in_(item_ids))
            ).all()
        }
        if (
            current_projects != original_projects
            or not set(current_projects.values()) <= projects
        ):
            raise Problem(
                409, "반출 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
            )
    for project_id in projects:
        try:
            require_project_access(db, project_id, actor_id)
        except Problem as exc:
            if exc.status in (403, 404):
                raise Problem(
                    409,
                    "전체 반출에 필요한 참조 자료의 접근권을 확인할 수 없습니다.",
                ) from exc
            raise


def _provenance_item_ids(value: object) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        if (
            isinstance(value.get("id"), str)
            and isinstance(value.get("project_id"), str)
            and value.get("kind")
            in {
                "idea",
                "feature",
                "requirement",
                "artifact",
                "task",
                "test_case",
                "decision",
            }
        ):
            result.add(value["id"])
        for key, child in value.items():
            if key in (
                "source_id",
                "target_id",
                "item_id",
                "case_id",
                "artifact_id",
            ) and isinstance(child, str):
                result.add(child)
            elif key in (
                "applied_ids",
                "source_ids",
                "feature_ids",
                "requirement_ids",
                "project_source_refs",
            ) and isinstance(child, list):
                result.update(
                    item_id for item_id in child if isinstance(item_id, str)
                )
            elif key == "source_snapshots" and isinstance(child, list):
                for snapshot in child:
                    if isinstance(snapshot, dict) and isinstance(
                        snapshot.get("id"), str
                    ):
                        result.add(snapshot["id"])
                    result.update(_provenance_item_ids(snapshot))
            elif key == "revisions" and isinstance(child, dict):
                result.update(child)
            else:
                result.update(_provenance_item_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.update(_provenance_item_ids(child))
    return result


def export_document(
    db: Session, state: State, item: Item, *, actor_id: str | None = None
) -> bytes:
    from projects.jobs import run_is_readable

    project = db.get(Project, item.project_id)
    assert project is not None
    actor_id = actor_id or project.owner_id
    require_project_access(db, project.id, actor_id, "project.export")
    if item.kind != "artifact":
        raise Problem(422, "문서만 독립 실행 묶음으로 반출합니다.")
    runs = db.scalars(
        select(SkillRun)
        .where(
            SkillRun.project_id == item.project_id,
        )
        .order_by(SkillRun.created_at.desc(), SkillRun.id)
    )
    run = next(
        (
            x
            for x in runs
            if x.target_id == item.id or item.id in x.applied_ids
        ),
        None,
    )
    _check_export_provenance(
        db, actor_id, [serialize(item), serialize(run) if run else {}]
    )
    db.refresh(item)
    if item.project_id != project.id:
        raise Problem(
            409, "반출 자료의 소속이 변경되었습니다. 다시 확인해 주세요."
        )
    if run is not None and not run_is_readable(db, run, actor_id):
        raise Problem(
            409, "전체 반출에 필요한 실행 자료의 접근권을 확인할 수 없습니다."
        )
    require_project_access(db, project.id, actor_id, "project.export")
    locks = (
        run.skills_lock
        if run
        else [state.resolver.resolve("document-writing-workflow")]
    )
    manifest = (
        run.reference_manifest
        if run
        else state.catalog.validate_manifest(item.data)
    )
    body = item.body.encode("utf-8")
    files = {
        "document.md": body,
        "base.json": json_bytes(
            {
                "id": item.id,
                "title": item.title,
                "revision": item.revision,
                "sha256": sha256(body),
                "provider": "temporary",
            }
        ),
        "skills.lock.json": json_bytes(
            {"schema_version": 1, "bundles": locks}
        ),
        "references.json": json_bytes(manifest),
        "sources.json": json_bytes(run.source_snapshots if run else []),
        "request.md": (
            "# 독립 문서 작업\n\n"
            "document.md와 base.json을 읽으세요. skills.lock.json의 각 스킬에 대해\n"
            "skills/<id>/SKILL.md 원문과 필요한 참조 파일을 적용하세요.\n"
            "references.json의 양식·예시는 입력 자료이며 스킬 원문을 대체하지 않습니다.\n"
            "앱 DB나 로그인 없이 개별 문서를 작성·수정할 수 있습니다.\n"
            "현재 도구로 수행하지 못한 참조 읽기·렌더링·검수는 미검증으로 남기세요.\n"
            "변경 범위 밖 원문과 식별자를 보존하고 결과·검수·실제 읽은 출처를 남기세요.\n"
            "스킬의 스크립트가 포함되어 있어도 자동 실행하지 않습니다.\n"
        ).encode(),
    }
    for lock in locks:
        bundle = state.resolver.read_bundle(lock["cache_key"])
        files[f"bundles/{lock['id']}.json"] = json_bytes(bundle)
        for resource in bundle["files"]:
            files[f"skills/{lock['id']}/{resource['path']}"] = (
                base64.b64decode(resource["content_base64"], validate=True)
            )
    files["manifest.json"] = json_bytes(
        {
            "schema_version": 1,
            "kind": "standalone_document",
            "files": {
                path: sha256(content) for path, content in files.items()
            },
            "created_at": utcnow().isoformat(),
        }
    )
    return zip_files(files)


def reconnect_document(
    db: Session, item: Item, payload: ReconnectInput
) -> dict:
    if item.kind != "artifact":
        raise Problem(422, "문서만 재연결할 수 있습니다.")
    base = db.get(Revision, (item.id, payload.base_revision))
    if base is None or sha256(base.body.encode()) != payload.base_sha256:
        raise Problem(422, "원본 revision과 hash를 확인할 수 없습니다.")
    conflict = item.revision != payload.base_revision
    difference = "".join(
        difflib.unified_diff(
            item.body.splitlines(keepends=True),
            payload.body.splitlines(keepends=True),
            fromfile="current.md",
            tofile="external.md",
        )
    )
    if not payload.preview:
        if conflict:
            raise Problem(
                409,
                "앱과 외부에서 모두 수정되었습니다. 양쪽 본문을 비교해 주세요.",
            )
        revise_item(
            db, item, item.revision, item.title, payload.body, item.data
        )
    return {
        "conflict": conflict,
        "diff": difference,
        "current_revision": item.revision,
        "body_sha256": sha256(payload.body.encode()),
    }


type ArchiveModel = (
    type[Item]
    | type[Link]
    | type[TestRun]
    | type[Baseline]
    | type[SkillRun]
    | type[RepositoryActivity]
)

ARCHIVE_TABLES: dict[str, ArchiveModel] = {
    "items": Item,
    "links": Link,
    "test_runs": TestRun,
    "baselines": Baseline,
    "skill_runs": SkillRun,
    "repository_activities": RepositoryActivity,
}


def export_project(
    db: Session, project: Project, *, actor_id: str | None = None
) -> bytes:
    from projects.jobs import run_is_readable

    actor_id = actor_id or project.owner_id
    require_project_access(db, project.id, actor_id, "project.export")
    data: dict = {"schema_version": 3, "project": serialize(project)}
    data["project"].pop("owner_id")
    data["project"].pop("access_revision", None)
    for key, model in ARCHIVE_TABLES.items():
        data[key] = [
            serialize(x)
            for x in db.scalars(
                select(model).where(model.project_id == project.id)
            )
        ]
    item_ids = [x["id"] for x in data["items"]]
    data["links"] = [serialize(link) for link in project_links(db, project.id)]
    references = db.get(ProjectArchiveReferences, project.id)
    historical = copy.deepcopy(references.data) if references else {}
    # The versioned top-level extension is filtered against current membership.
    # Do not emit its unfiltered restoration provenance a second time here.
    historical.pop("planning", None)
    origin_runs = [
        serialize(run)
        for run in db.scalars(
            select(SkillRun).where(
                or_(
                    SkillRun.target_id.in_(item_ids),
                    *(
                        cast(SkillRun.applied_ids, JSONB).contains([item_id])
                        for item_id in item_ids
                    ),
                ),
                SkillRun.project_id != project.id,
            )
        )
    ]
    historical["skill_runs"] = list(
        {
            row["id"]: row
            for row in [*historical.get("skill_runs", []), *origin_runs]
        }.values()
    )
    external_ids = {
        endpoint
        for link in data["links"]
        for endpoint in (link["source_id"], link["target_id"])
    }
    external_ids.update(
        item_id
        for baseline in data["baselines"]
        for item_id in baseline["revisions"]
    )
    all_runs = [*data["skill_runs"], *historical["skill_runs"]]
    external_ids.update(
        run["target_id"] for run in all_runs if run["target_id"]
    )
    external_ids.update(
        item_id for run in all_runs for item_id in run["applied_ids"]
    )
    external_ids.update(
        source["id"] for run in all_runs for source in run["source_snapshots"]
    )
    external_ids.difference_update(item_ids)
    snapshots = {row["id"]: row for row in historical.get("items", [])}
    revisions = {
        (row["item_id"], row["revision"]): row
        for row in historical.get("revisions", [])
    }
    for item_id in sorted(external_ids):
        if item_id in snapshots:
            continue
        item = db.get(Item, item_id)
        if item is None:
            continue
        _check_export_provenance(
            db, actor_id, {"project_id": item.project_id}, lock=False
        )
        snapshots[item.id] = serialize(item)
        for row in db.scalars(
            select(Revision).where(Revision.item_id == item.id)
        ):
            revisions[(row.item_id, row.revision)] = serialize(row)
    historical["items"] = list(snapshots.values())
    historical["revisions"] = list(revisions.values())
    historical["missing_item_ids"] = sorted(set(snapshots) - set(item_ids))
    historical["test_runs"] = list(
        {
            row["id"]: row
            for row in [
                *historical.get("test_runs", []),
                *[
                    serialize(run)
                    for run in db.scalars(
                        select(TestRun).where(
                            TestRun.case_id.in_(external_ids)
                        )
                    )
                ],
            ]
        }.values()
    )
    data["external_references"] = historical
    historical_links = historical.get("links", [])
    data["links"] = list(
        {
            row["id"]: row for row in [*historical_links, *data["links"]]
        }.values()
    )
    historical_runs = historical.get("skill_runs", [])
    data["skill_runs"] = list(
        {
            row["id"]: row
            for row in [
                *[
                    row
                    for row in historical_runs
                    if row["project_id"] == project.id
                ],
                *data["skill_runs"],
            ]
        }.values()
    )
    transfer_rows = [
        serialize(row)
        for row in db.scalars(select(TaskTransfer))
        if any(
            project.id
            in (change["source_project_id"], change["target_project_id"])
            for change in row.changes
        )
    ]
    data["transfers"] = list(
        {
            row["id"]: row
            for row in [*historical.get("transfers", []), *transfer_rows]
        }.values()
    )
    for row in data["transfers"]:
        row.pop("owner_id", None)
    data["task_positions"] = [
        serialize(x)
        for x in db.scalars(
            select(TaskPosition)
            .where(TaskPosition.item_id.in_(item_ids))
            .order_by(TaskPosition.item_id)
        )
    ]
    data["task_views"] = []
    for view in db.scalars(
        select(TaskView)
        .where(
            TaskView.project_id == project.id,
            TaskView.owner_id == actor_id,
            TaskView.scope == "personal",
        )
        .order_by(TaskView.id)
    ):
        view_data = serialize(view)
        view_data.pop("owner_id")
        data["task_views"].append(view_data)
    data["revisions"] = [
        serialize(x)
        for x in db.scalars(
            select(Revision).where(Revision.item_id.in_(item_ids))
        )
    ]
    data["task_fields"] = []
    planning = export_planning(db, project.id, set(item_ids))
    if any(rows for key, rows in planning.items() if key != "schema_version"):
        data["planning"] = planning
    _check_export_provenance(db, actor_id, data)
    for run_data in all_runs:
        if not run_is_readable(
            db, SkillRun(**parse_dates(run_data)), actor_id
        ):
            raise Problem(
                409,
                "전체 반출에 필요한 실행 자료의 접근권을 확인할 수 없습니다.",
            )
    for field_id in sorted(archive_field_ids(data)):
        definitions = list(
            db.scalars(
                select(ProjectTaskFieldDefinition)
                .where(
                    ProjectTaskFieldDefinition.project_id.in_(
                        _provenance_project_ids(data)
                    ),
                    ProjectTaskFieldDefinition.id == field_id,
                )
                .order_by(ProjectTaskFieldDefinition.project_id)
            )
        )
        if not definitions:
            raise Problem(409, "반출할 사용자 필드 정의가 누락되었습니다.")
        definition = next(
            (row for row in definitions if row.project_id == project.id),
            definitions[0],
        )
        if any(
            any(
                getattr(row, key) != getattr(definition, key)
                for key in ("name", "type", "options", "revision")
            )
            for row in definitions
        ):
            raise Problem(
                409,
                "참조 프로젝트의 사용자 필드 정의가 달라 전체 반출을 완료할 수 없습니다.",
            )
        field_row = serialize(definition)
        field_row.pop("project_id")
        data["task_fields"].append(field_row)
    require_project_access(db, project.id, actor_id, "project.export")
    content = json_bytes(data)
    return zip_files(
        {
            "data.json": content,
            "manifest.json": json_bytes(
                {
                    "schema_version": 3,
                    "kind": "project_archive",
                    "files": {"data.json": sha256(content)},
                }
            ),
        }
    )


def read_archive(encoded: str) -> dict:
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("size")
        with ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) != 2 or {x.filename for x in entries} != {
                "data.json",
                "manifest.json",
            }:
                raise ValueError("entries")
            if any(
                x.file_size > 16 * 1024 * 1024 or x.flag_bits & 1
                for x in entries
            ):
                raise ValueError("size")
            for entry in entries:
                path = PurePosixPath(entry.filename)
                if (
                    path.is_absolute()
                    or ".." in path.parts
                    or "\\" in entry.filename
                ):
                    raise ValueError("path")
            content = archive.read("data.json")
            manifest = json.loads(archive.read("manifest.json"))
            if (
                type(manifest.get("schema_version")) is not int
                or manifest.get("schema_version") not in (1, 2, 3)
                or manifest.get("kind") != "project_archive"
                or manifest.get("files") != {"data.json": sha256(content)}
            ):
                raise ValueError("manifest")
            data = json.loads(content)
            if (
                type(data.get("schema_version")) is not int
                or data.get("schema_version") not in (1, 2, 3)
                or data.get("schema_version") != manifest.get("schema_version")
            ):
                raise ValueError("version")
            return data
    except (
        binascii.Error,
        BadZipFile,
        ValueError,
        KeyError,
        TypeError,
        UnicodeError,
    ) as exc:
        raise Problem(
            422, "Projects 백업 ZIP의 형식·크기·hash가 올바르지 않습니다."
        ) from exc


def import_project(db: Session, user_id: str, encoded: str) -> Project:
    # A caller may catch a rejected restore and keep using its transaction.
    # Keep the entire project graph, including extension rows, atomic there too.
    with db.begin_nested():
        return _import_project(db, user_id, encoded)


def _import_project(db: Session, user_id: str, encoded: str) -> Project:
    data = read_archive(encoded)
    try:
        project_data = data["project"]
        project_id = project_data["id"]
        source_url = project_data.get("repository_url")
        if source_url is not None:
            if (
                source_url
                != f"https://github.com/{repository_name(source_url)}"
            ):
                raise ValueError("repository url")
            scoped_path(project_data.get("repository_path", ""))
            if not isinstance(
                project_data.get("repository_sha"), str
            ) or not SHA.fullmatch(project_data["repository_sha"]):
                raise ValueError("repository sha")
        activities = data.get("repository_activities", [])
        if not isinstance(activities, list) or len(activities) > 30:
            raise ValueError("repository activities")
        activity_ids: set[str] = set()
        activity_keys: set[tuple[str, str]] = set()
        for activity in activities:
            if (
                not isinstance(activity, dict)
                or activity.get("project_id") != project_id
            ):
                raise ValueError("repository activity")
            kind = activity.get("kind")
            url = activity.get("url")
            external_id = activity.get("external_id")
            if (
                source_url is None
                or kind not in ("commit", "pr")
                or not isinstance(external_id, str)
                or not isinstance(url, str)
                or url
                != f"{source_url}/{'commit/' if kind == 'commit' else 'pull/'}{external_id}"
                or (kind == "commit" and not SHA.fullmatch(external_id))
                or (kind == "pr" and not external_id.isdigit())
                or not isinstance(activity.get("title"), str)
                or len(activity["title"]) > 300
                or activity.get("state")
                not in ("committed", "open", "closed", "merged")
                or not isinstance(activity.get("id"), str)
                or activity["id"] in activity_ids
                or (kind, external_id) in activity_keys
            ):
                raise ValueError("repository activity")
            activity_ids.add(activity["id"])
            activity_keys.add((kind, external_id))
        if db.get(Project, project_id):
            raise Problem(
                409,
                "같은 프로젝트 ID가 존재합니다. 별도 환경에서 복구해 주세요.",
            )
        # Archive ownership and access policy never confer permissions. Every
        # newly restored project starts with the authenticated actor as owner.
        project_data = {
            key: value
            for key, value in project_data.items()
            if key not in ("owner_id", "access_revision", "archived_at")
        }
        project = Project(**parse_dates(project_data), owner_id=user_id)
        db.add(project)
        db.flush()
        initialize_project_access(db, project)
        definitions = data.get("task_fields", [])
        if not isinstance(definitions, list) or len(definitions) > 10000:
            raise ValueError("task field definitions")
        definition_ids: set[str] = set()
        for row in definitions:
            if (
                not isinstance(row, dict)
                or set(row)
                != {"id", "name", "type", "options", "revision", "created_at"}
                or not isinstance(row["id"], str)
                or str(UUID(row["id"])) != row["id"]
                or row["id"] in definition_ids
                or type(row["revision"]) is not int
                or row["revision"] != 1
            ):
                raise ValueError("task field definition")
            definition_ids.add(row["id"])
            definition = TaskFieldInput.model_validate(
                {key: row[key] for key in ("name", "type", "options")}
            )
            if definition.name != row["name"]:
                raise ValueError("task field name")
            existing = db.get(
                ProjectTaskFieldDefinition, (project_id, row["id"])
            )
            if existing is not None:
                existing_definition = serialize(existing)
                existing_definition.pop("project_id")
                if existing_definition != row:
                    raise Problem(
                        409, "사용자 필드 정의가 기존 필드와 충돌합니다."
                    )
            else:
                db.add(
                    ProjectTaskFieldDefinition(
                        project_id=project_id, **parse_dates(row)
                    )
                )
        # Definitions travel with immutable data. Never resolve an omitted
        # archive definition using a coincidentally matching local ID.
        if not archive_field_ids(data) <= definition_ids:
            raise ValueError("missing task field definitions")
        db.flush()
        validate_archive_custom_values(
            db, user_id, data, project_id=project_id
        )
        items = {x["id"]: x for x in data["items"]}
        if len(items) != len(data["items"]):
            raise ValueError("duplicate IDs")
        for item in items.values():
            if item["project_id"] != project_id:
                raise ValueError("project")
            if (
                not item["title"].strip()
                or len(item["title"]) > 300
                or len(item["body"]) > 500000
            ):
                raise ValueError("text limits")
            validated = validate_item_data(item["kind"], item["data"])
            if item["kind"] == "requirement":
                # Read defaults are not an edit to an immutable legacy Story.
                for field in (
                    "problem",
                    "expected_outcome",
                    "scope",
                    "exclusions",
                    "processing_state",
                ):
                    if field not in item["data"]:
                        validated.pop(field, None)
            if item["kind"] == "task":
                validate_custom_values(
                    db,
                    user_id,
                    validated["custom_fields"],
                    project_id=project_id,
                )
                if "custom_fields" not in item["data"]:
                    validated.pop("custom_fields", None)
            if (
                item["kind"] == "task"
                and "note_references" not in item["data"]
            ):
                # Older immutable snapshots predate external Note references.
                # Absence means no references; keep their original bytes/data.
                validated.pop("note_references", None)
            item["data"] = validated
            if db.get(Item, item["id"]):
                raise Problem(409, "다른 항목과 ID가 충돌합니다.")
        external = data.get("external_references", {})
        external = {
            key: value for key, value in external.items() if key != "planning"
        }
        external_items = {row["id"]: row for row in external.get("items", [])}
        known_items = {**external_items, **items}
        for snapshot in external_items.values():
            validated = validate_item_data(snapshot["kind"], snapshot["data"])
            if snapshot["kind"] == "task":
                validate_custom_values(
                    db,
                    user_id,
                    validated["custom_fields"],
                    project_id=project_id,
                )
        for snapshot in external.get("revisions", []):
            kind = known_items[snapshot["item_id"]]["kind"]
            validated = validate_item_data(kind, snapshot["data"])
            if kind == "task":
                validate_custom_values(
                    db,
                    user_id,
                    validated["custom_fields"],
                    project_id=project_id,
                )
        edges: list[tuple[str, str]] = []
        for link in data["links"]:
            if (
                link["source_id"] not in known_items
                or link["target_id"] not in known_items
            ):
                raise ValueError("link")
            if link["relation"] == "depends_on":
                check_dependency_cycle(
                    link["source_id"], link["target_id"], edges
                )
                edges.append((link["source_id"], link["target_id"]))
        for baseline in data["baselines"]:
            if not set(baseline["revisions"]) <= set(known_items):
                raise ValueError("baseline")
        revisions = {
            (x["item_id"], x["revision"]): x for x in data["revisions"]
        }
        if len(revisions) != len(data["revisions"]):
            raise ValueError("duplicate revisions")
        historical_revisions = {
            (row["item_id"], row["revision"]): row
            for row in external.get("revisions", [])
        }
        planning = validate_planning(db, data, items, revisions)
        positions = {x["item_id"]: x for x in data.get("task_positions", [])}
        if len(positions) != len(data.get("task_positions", [])) or any(
            item_id not in items
            or items[item_id]["kind"] != "task"
            or type(row["position"]) is not int
            or not 0 <= row["position"] <= 2**31 - 1
            for item_id, row in positions.items()
        ):
            raise ValueError("task positions")
        task_views = data.get("task_views", [])
        if (
            not isinstance(task_views, list)
            or any(not isinstance(row, dict) for row in task_views)
            or sum(bool(row.get("is_default")) for row in task_views) > 1
        ):
            raise ValueError("task views")
        view_ids: set[str] = set()
        for row in task_views:
            if (
                not isinstance(row, dict)
                or row.get("project_id") != project_id
                or not isinstance(row.get("id"), str)
                or len(row["id"]) != 36
                or type(row.get("revision")) is not int
                or row["revision"] < 1
                or row.get("id") in view_ids
                or db.get(TaskView, row.get("id")) is not None
            ):
                raise ValueError("task views")
            view_ids.add(row["id"])
            TaskViewInput.model_validate(
                {
                    field: row[field]
                    for field in ("name", "scope", "is_default", "settings")
                }
            )
            validate_view_fields(
                db, user_id, row["settings"], project_id=project_id
            )
        for item in items.values():
            current = revisions.get((item["id"], item["revision"]))
            if current is None or any(
                current[key] != item[key]
                for key in ("title", "body", "data", "status")
            ):
                raise ValueError("current revision mismatch")
        for baseline in data["baselines"]:
            if any(
                (item_id, rev) not in revisions
                and (item_id, rev) not in historical_revisions
                for item_id, rev in baseline["revisions"].items()
            ):
                raise ValueError("baseline revision")
        for test in data["test_runs"]:
            if (
                test["case_id"] not in items
                or items[test["case_id"]]["kind"] != "test_case"
            ):
                raise ValueError("test case")
        for run in data["skill_runs"]:
            if (
                run["target_id"] is not None
                and run["target_id"] not in known_items
            ):
                raise ValueError("run target")
            if not set(run["applied_ids"]) <= set(known_items):
                raise ValueError("applied IDs")
            if any(
                source["id"] not in known_items
                or source["project_id"] != project_id
                for source in run["source_snapshots"]
            ):
                raise ValueError("run sources")
        # Missing external endpoints remain historical snapshots, never live
        # records attached by coincidentally matching IDs in another restore.
        historical = {
            **external,
            "links": [
                row
                for row in data["links"]
                if row["source_id"] not in items
                or row["target_id"] not in items
                or row["project_id"] != project_id
            ],
            "skill_runs": external.get("skill_runs", [])
            + [
                row
                for row in data["skill_runs"]
                if row["target_id"] is not None
                and row["target_id"] not in items
            ],
            "transfers": data.get("transfers", []),
            "missing_item_ids": sorted(external_items),
        }
        if planning:
            historical["planning"] = planning
        if external_items or historical["transfers"] or planning:
            db.add(
                ProjectArchiveReferences(
                    project_id=project_id, data=historical
                )
            )
        for row in items.values():
            db.add(Item(**parse_dates(row)))
        db.flush()
        for row in positions.values():
            db.add(TaskPosition(**row))
        db.flush()
        for row in task_views:
            db.add(
                TaskView(
                    id=row["id"],
                    project_id=project_id,
                    owner_id=user_id,
                    name=row["name"],
                    scope="personal",
                    settings=row["settings"],
                    is_default=row["is_default"],
                    revision=row["revision"],
                )
            )
        db.flush()
        for row in data["revisions"]:
            if row["item_id"] not in items:
                raise ValueError("revision")
            if (
                not row["title"].strip()
                or len(row["title"]) > 300
                or len(row["body"]) > 500000
            ):
                raise ValueError("text limits")
            validated = validate_item_data(
                items[row["item_id"]]["kind"], row["data"]
            )
            if items[row["item_id"]]["kind"] == "task":
                validate_custom_values(
                    db,
                    user_id,
                    validated["custom_fields"],
                    project_id=project_id,
                )
            db.add(Revision(**parse_dates(row)))
        db.flush()
        for key, model in ARCHIVE_TABLES.items():
            if key == "items":
                continue
            rows = (
                data.get(key, [])
                if key == "repository_activities"
                else data[key]
            )
            for row in rows:
                if key == "links" and (
                    row["source_id"] not in items
                    or row["target_id"] not in items
                ):
                    continue
                if (
                    key == "skill_runs"
                    and row["target_id"] is not None
                    and row["target_id"] not in items
                ):
                    continue
                if row["project_id"] != project_id:
                    if key != "links":
                        raise ValueError("project")
                    # Keep original link provenance in the historical archive
                    # references; both restored live endpoints are local here.
                    row = {**row, "project_id": project_id}
                if key == "skill_runs" and row["status"] in (
                    "queued",
                    "running",
                ):
                    row["status"] = "failed"
                    row["error"] = (
                        "복구한 실행입니다. 입력을 검토한 뒤 명시적으로 재개해 주세요."
                    )
                if key == "skill_runs":
                    # A requester membership belongs to the source database.
                    # Explicit retry binds the authenticated current actor.
                    row = {
                        **row,
                        "requested_by": None,
                        "requested_membership_id": None,
                    }
                db.add(model(**parse_dates(row)))
        db.flush()
        import_planning(db, user_id, project_id, planning)
        return project
    except (KeyError, TypeError, ValueError) as exc:
        raise Problem(
            422, "반출 데이터의 객체·관계·revision이 올바르지 않습니다."
        ) from exc


def parse_dates(row: dict) -> dict:
    result = dict(row)
    for key in (
        "created_at",
        "updated_at",
        "lease_until",
        "occurred_at",
        "repository_imported_at",
    ):
        if result.get(key) is not None:
            result[key] = datetime.fromisoformat(result[key])
    return result


def archive_field_ids(value: object) -> set[str]:
    """Include fields used only by historical snapshots or hidden columns."""
    result: set[str] = set()
    if isinstance(value, dict):
        custom = value.get("custom_fields")
        if isinstance(custom, dict):
            result.update(custom)
        for key in ("card_fields", "list_fields"):
            for field in value.get(key) or []:
                if isinstance(field, str) and field.startswith("custom:"):
                    result.add(field[7:])
        for child in value.values():
            result.update(archive_field_ids(child))
    elif isinstance(value, list):
        for child in value:
            result.update(archive_field_ids(child))
    return result


def validate_archive_custom_values(
    db: Session, owner_id: str, value: object, *, project_id: str | None = None
) -> None:
    if isinstance(value, dict):
        if "custom_fields" in value:
            validated = validate_item_data(
                "task", {"custom_fields": value["custom_fields"]}
            )
            validate_custom_values(
                db, owner_id, validated["custom_fields"], project_id=project_id
            )
        for child in value.values():
            validate_archive_custom_values(
                db, owner_id, child, project_id=project_id
            )
    elif isinstance(value, list):
        for child in value:
            validate_archive_custom_values(
                db, owner_id, child, project_id=project_id
            )
