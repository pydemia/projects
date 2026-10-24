"""Inspect a bounded Git source ZIP without extracting or executing its files."""

import base64
import binascii
import io
import json
import re
import stat
import tomllib
import zlib
from hashlib import sha256
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from projects.domain import Problem
from projects.repository_import import (
    MANIFESTS,
    _setup_metadata,
    _text,
    scoped_path,
)

MAX_ARCHIVE_BYTES = 8_000_000
MAX_ENTRIES = 3000
MAX_TOTAL_SIZE = 100_000_000
MAX_MANIFEST_BYTES = 64_000


def _source_name(archive_name: str, root: str) -> str:
    name = root or PurePosixPath(
        archive_name.replace("\\", "/")
    ).name.removesuffix(".zip")
    name = re.sub(r"[^\w.-]+", "-", name, flags=re.UNICODE).strip("-.")
    return name[:200] or "Git 프로젝트"


def inspect_git_zip(
    encoded: str, archive_name: str = "", path: str = ""
) -> dict:
    """Return package metadata from a GitHub Download ZIP or git archive ZIP."""
    path = scoped_path(path)
    archive_name = re.sub(r"[\x00-\x1f\x7f]", " ", archive_name).strip()[:200]
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_ARCHIVE_BYTES:
            raise ValueError("archive size")
        with ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > MAX_ENTRIES:
                raise ValueError("entry count")
            files = {}
            total_size = 0
            for entry in entries:
                entry_path = entry.filename.rstrip("/")
                parts = entry_path.split("/")
                mode = (entry.external_attr >> 16) & 0o170000
                if (
                    not entry_path
                    or len(entry_path) > 300
                    or entry_path.startswith("/")
                    or "\\" in entry_path
                    or "\x00" in entry_path
                    or ":" in entry_path
                    or any(part in ("", ".", "..") for part in parts)
                    or entry.flag_bits & 1
                    or mode == stat.S_IFLNK
                    or entry.file_size < 0
                ):
                    raise ValueError("unsafe entry")
                total_size += entry.file_size
                if total_size > MAX_TOTAL_SIZE:
                    raise ValueError("expanded size")
                if not entry.is_dir():
                    if entry_path in files:
                        raise ValueError("duplicate entry")
                    files[entry_path] = entry
            if not files:
                raise ValueError("empty archive")
            if set(files) == {"data.json", "manifest.json"}:
                raise Problem(
                    422, "Projects 백업 ZIP은 '백업 ZIP 복원'을 사용해 주세요."
                )
            first_parts = {name.split("/", 1)[0] for name in files}
            root = (
                next(iter(first_parts))
                if len(first_parts) == 1 and all("/" in name for name in files)
                else ""
            )
            relative = {
                name.removeprefix(f"{root}/") if root else name: entry
                for name, entry in files.items()
            }
            scopes = {""}
            for name in relative:
                name_parts = PurePosixPath(name).parts
                scope = "/".join(name_parts[:-1])
                if (
                    name_parts[-1] in MANIFESTS
                    and len(name_parts) <= 3
                    and len(scope) <= 200
                ):
                    scopes.add(scope)
            if path not in scopes:
                raise Problem(422, "분석 가능한 package 폴더를 선택해 주세요.")
            prefix = f"{path}/" if path else ""
            warnings = [
                "ZIP에는 commit·PR 이력이 없습니다. 원격 GitHub URL로 가져오면 최근 이력을 함께 확인할 수 있습니다."
            ]
            values: dict = {}
            kind = "repository"
            manifest_path = ""

            def read_manifest(selected: str) -> str:
                entry = relative[selected]
                if entry.file_size > MAX_MANIFEST_BYTES:
                    raise ValueError("manifest size")
                content = archive.read(entry)
                if len(content) > MAX_MANIFEST_BYTES:
                    raise ValueError("manifest size")
                return content.decode("utf-8-sig")

            for filename in (
                "pyproject.toml",
                "setup.py",
                "package.json",
                "manifest.json",
            ):
                selected = prefix + filename
                if selected not in relative:
                    continue
                try:
                    content = read_manifest(selected)
                    if filename == "pyproject.toml":
                        values = tomllib.loads(content).get("project", {})
                        kind = "python_package"
                    elif filename == "setup.py":
                        values = _setup_metadata(content)
                        kind = "python_package"
                    else:
                        values = json.loads(content)
                        if not isinstance(values, dict):
                            raise ValueError("manifest")
                        if filename == "manifest.json" and values.get(
                            "manifest_version"
                        ):
                            kind = "browser_extension"
                        elif isinstance(
                            values.get("engines"), dict
                        ) and values["engines"].get("vscode"):
                            kind = "vscode_extension"
                        elif filename == "package.json":
                            kind = "web_app"
                    if not isinstance(values, dict):
                        raise ValueError("manifest")
                    manifest_path = selected
                    break
                except (
                    ValueError,
                    UnicodeError,
                    TypeError,
                    AttributeError,
                    BadZipFile,
                ):
                    warnings.append(f"{selected} 내용을 해석하지 못했습니다.")
                    values = {}
                    kind = "repository"
            extension = prefix + "manifest.json"
            if extension in relative and kind != "python_package":
                try:
                    extra = json.loads(read_manifest(extension))
                    if isinstance(extra, dict) and extra.get(
                        "manifest_version"
                    ):
                        values, kind, manifest_path = (
                            extra,
                            "browser_extension",
                            extension,
                        )
                except (ValueError, UnicodeError, BadZipFile):
                    pass
            if kind == "repository" and any(
                name.startswith(prefix)
                and (name == "SKILL.md" or name.endswith("/SKILL.md"))
                for name in relative
            ):
                kind = "skill_catalog"
            fallback = _source_name(archive_name, root)
            package_name = _text(values.get("name"), 200) or fallback
            description = _text(values.get("description"), 1000)
            labels = {
                "python_package": "Python 패키지",
                "browser_extension": "브라우저 확장",
                "vscode_extension": "VS Code 확장",
                "web_app": "웹 앱",
                "skill_catalog": "스킬 카탈로그",
                "repository": "프로젝트",
            }
            goal = (
                description
                or f"{package_name} {labels[kind]}을 개발하고 관리한다."
            )
            if not description:
                warnings.append(
                    "package 설명이 없어 유형으로 목표를 제안합니다."
                )
            return {
                "archive_sha256": sha256(raw).hexdigest(),
                "archive_name": archive_name,
                "path": path,
                "kind": kind,
                "scopes": [
                    {"path": scope, "label": scope or "ZIP 전체"}
                    for scope in sorted(
                        scopes, key=lambda value: (bool(value), value)
                    )
                ],
                "manifest_path": manifest_path,
                "suggested_name": package_name,
                "suggested_goal": goal,
                "warnings": warnings,
            }
    except (
        binascii.Error,
        BadZipFile,
        ValueError,
        UnicodeError,
        RuntimeError,
        OSError,
        EOFError,
        NotImplementedError,
        zlib.error,
    ) as exc:
        raise Problem(
            422, "Git 소스 ZIP의 형식·크기·경로를 확인해 주세요."
        ) from exc
