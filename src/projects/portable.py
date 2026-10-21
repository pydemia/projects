"""Plain Markdown handoff and verified project archives; no app secrets."""

import base64
import binascii
import difflib
import hashlib
import io
import json
from datetime import datetime
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import State

from projects.database import (
    Baseline,
    Item,
    Link,
    Project,
    Revision,
    SkillRun,
    TestRun,
    utcnow,
)
from projects.domain import Problem, check_dependency_cycle, validate_item_data
from projects.records import revise_item, serialize
from projects.schemas import ReconnectInput


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


def export_document(db: Session, state: State, item: Item) -> bytes:
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
    type[Item] | type[Link] | type[TestRun] | type[Baseline] | type[SkillRun]
)

ARCHIVE_TABLES: dict[str, ArchiveModel] = {
    "items": Item,
    "links": Link,
    "test_runs": TestRun,
    "baselines": Baseline,
    "skill_runs": SkillRun,
}


def export_project(db: Session, project: Project) -> bytes:
    data: dict = {"schema_version": 1, "project": serialize(project)}
    data["project"].pop("owner_id")
    for key, model in ARCHIVE_TABLES.items():
        data[key] = [
            serialize(x)
            for x in db.scalars(
                select(model).where(model.project_id == project.id)
            )
        ]
    item_ids = [x["id"] for x in data["items"]]
    data["revisions"] = [
        serialize(x)
        for x in db.scalars(
            select(Revision).where(Revision.item_id.in_(item_ids))
        )
    ]
    content = json_bytes(data)
    return zip_files(
        {
            "data.json": content,
            "manifest.json": json_bytes(
                {
                    "schema_version": 1,
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
                manifest.get("schema_version") != 1
                or manifest.get("kind") != "project_archive"
                or manifest.get("files") != {"data.json": sha256(content)}
            ):
                raise ValueError("manifest")
            data = json.loads(content)
            if data.get("schema_version") != 1:
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
            422, "반출 묶음의 형식·크기·hash가 올바르지 않습니다."
        ) from exc


def import_project(db: Session, user_id: str, encoded: str) -> Project:
    data = read_archive(encoded)
    try:
        project_data = data["project"]
        project_id = project_data["id"]
        if db.get(Project, project_id):
            raise Problem(
                409,
                "같은 프로젝트 ID가 존재합니다. 별도 환경에서 복구해 주세요.",
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
            item["data"] = validate_item_data(item["kind"], item["data"])
            if db.get(Item, item["id"]):
                raise Problem(409, "다른 항목과 ID가 충돌합니다.")
        edges: list[tuple[str, str]] = []
        for link in data["links"]:
            if (
                link["source_id"] not in items
                or link["target_id"] not in items
                or link["project_id"] != project_id
            ):
                raise ValueError("link")
            if link["relation"] == "depends_on":
                check_dependency_cycle(
                    link["source_id"], link["target_id"], edges
                )
                edges.append((link["source_id"], link["target_id"]))
        for baseline in data["baselines"]:
            if not set(baseline["revisions"]) <= set(items):
                raise ValueError("baseline")
        revisions = {
            (x["item_id"], x["revision"]): x for x in data["revisions"]
        }
        if len(revisions) != len(data["revisions"]):
            raise ValueError("duplicate revisions")
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
            if run["target_id"] is not None and run["target_id"] not in items:
                raise ValueError("run target")
            if not set(run["applied_ids"]) <= set(items):
                raise ValueError("applied IDs")
            if any(
                source["id"] not in items or source["project_id"] != project_id
                for source in run["source_snapshots"]
            ):
                raise ValueError("run sources")
        project = Project(**parse_dates(project_data), owner_id=user_id)
        db.add(project)
        db.flush()
        for row in items.values():
            db.add(Item(**parse_dates(row)))
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
            validate_item_data(items[row["item_id"]]["kind"], row["data"])
            db.add(Revision(**parse_dates(row)))
        db.flush()
        for key, model in ARCHIVE_TABLES.items():
            if key == "items":
                continue
            for row in data[key]:
                if row["project_id"] != project_id:
                    raise ValueError("project")
                if key == "skill_runs" and row["status"] in (
                    "queued",
                    "running",
                ):
                    row["status"] = "failed"
                    row["error"] = (
                        "복구한 실행입니다. 입력을 검토한 뒤 명시적으로 재개해 주세요."
                    )
                db.add(model(**parse_dates(row)))
        db.flush()
        return project
    except (KeyError, TypeError, ValueError) as exc:
        raise Problem(
            422, "반출 데이터의 객체·관계·revision이 올바르지 않습니다."
        ) from exc


def parse_dates(row: dict) -> dict:
    result = dict(row)
    for key in ("created_at", "updated_at", "lease_until"):
        if result.get(key) is not None:
            result[key] = datetime.fromisoformat(result[key])
    return result
