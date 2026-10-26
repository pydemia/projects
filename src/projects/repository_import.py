"""Bounded, read-only GitHub intake from manifests and activity summaries."""

import ast
import base64
import binascii
import json
import re
import tomllib
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

from projects.domain import Problem

REPO = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$")
SHA = re.compile(r"^[0-9a-f]{40}$")
MANIFESTS = {"pyproject.toml", "setup.py", "package.json", "manifest.json"}
ACTIVITY_LIMIT = 15
TREE_LIMIT = 3000


def repository_name(url: str) -> str:
    parts = urlsplit(url.strip())
    try:
        invalid_authority = (
            parts.netloc.lower() != "github.com"
            or parts.username is not None
            or parts.password is not None
            or parts.port is not None
        )
    except ValueError as exc:
        raise Problem(422, "GitHub 저장소 주소가 올바르지 않습니다.") from exc
    if (
        parts.scheme != "https"
        or invalid_authority
        or parts.query
        or parts.fragment
    ):
        raise Problem(
            422, "https://github.com/owner/repo 주소를 입력해 주세요."
        )
    match = re.fullmatch(r"/([^/]+)/([^/]+)/?", parts.path)
    if match is None:
        raise Problem(422, "GitHub 저장소 주소만 입력해 주세요.")
    owner, repo = match.groups()
    if repo.endswith(".git"):
        repo = repo[:-4]
    if (
        owner in (".", "..")
        or repo in (".", "..")
        or not REPO.fullmatch(owner)
        or not REPO.fullmatch(repo)
    ):
        raise Problem(422, "GitHub 저장소 주소가 올바르지 않습니다.")
    return f"{owner}/{repo}"


def scoped_path(path: str) -> str:
    if not path:
        return ""
    if (
        len(path) > 200
        or "\\" in path
        or path.startswith("/")
        or path.endswith("/")
        or any(part in ("", ".", "..") for part in path.split("/"))
    ):
        raise Problem(422, "저장소 안의 폴더를 선택해 주세요.")
    return path


def _text(value: object, limit: int = 300) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _date(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return ""


def _setup_metadata(raw: str) -> dict[str, str]:
    """Read literal setup() arguments without importing or executing the file."""
    try:
        tree = ast.parse(raw)
    except SyntaxError:
        return {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Name) or node.func.id != "setup":
            continue
        return {
            key.arg: key.value.value
            for key in node.keywords
            if key.arg in {"name", "description"}
            and isinstance(key.value, ast.Constant)
            and isinstance(key.value.value, str)
        }
    return {}


class GitHubInspector:
    def __init__(
        self,
        token: str = "",
        private_repos: tuple[str, ...] = (),
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.token = token
        self.private_repos = {name.lower() for name in private_repos}
        self.client = httpx.Client(
            base_url="https://api.github.com",
            timeout=8,
            follow_redirects=False,
            transport=transport,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "pydemia-projects-import",
            },
        )

    def close(self) -> None:
        self.client.close()

    def _get(
        self,
        name: str,
        suffix: str,
        *,
        max_bytes: int = 1024 * 1024,
        redirected: bool = False,
    ) -> object:
        headers = {}
        if self.token and name.lower() in self.private_repos:
            headers["Authorization"] = f"Bearer {self.token}"
        address = f"/repos/{quote(name, safe='/')}"
        if suffix:
            address += f"/{suffix}"
        try:
            with self.client.stream(
                "GET", address, headers=headers
            ) as response:
                if (
                    response.status_code == 301
                    and not suffix
                    and not redirected
                    and not headers
                ):
                    target = urlsplit(response.headers.get("Location", ""))
                    if (
                        target.scheme == "https"
                        and target.netloc == "api.github.com"
                        and target.path.startswith("/repos/")
                        and not target.query
                        and not target.fragment
                    ):
                        canonical = repository_name(
                            f"https://github.com/{target.path.removeprefix('/repos/')}"
                        )
                        return self._get(
                            canonical,
                            "",
                            max_bytes=max_bytes,
                            redirected=True,
                        )
                    raise Problem(
                        502,
                        "GitHub 저장소의 변경된 주소를 확인하지 못했습니다.",
                    )
                if response.status_code == 404:
                    raise Problem(404, "저장소를 찾거나 읽을 수 없습니다.")
                if response.status_code in (401, 403, 429):
                    raise Problem(
                        502, "GitHub 읽기 권한 또는 호출 한도를 확인해 주세요."
                    )
                if response.status_code != 200:
                    raise Problem(502, "GitHub 저장소를 읽지 못했습니다.")
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > max_bytes:
                        raise Problem(
                            422, "GitHub 응답이 분석 한도를 초과했습니다."
                        )
                return json.loads(content)
        except (httpx.HTTPError, ValueError) as exc:
            raise Problem(502, "GitHub 응답을 확인하지 못했습니다.") from exc

    def _manifest(self, name: str, sha: str, path: str) -> str:
        blob = self._get(name, f"git/blobs/{sha}", max_bytes=100_000)
        if not isinstance(blob, dict) or blob.get("encoding") != "base64":
            raise Problem(422, "manifest를 읽을 수 없습니다.")
        try:
            content = base64.b64decode(blob["content"], validate=False)
            if len(content) > 64_000:
                raise ValueError("size")
            return content.decode("utf-8-sig")
        except (
            KeyError,
            TypeError,
            ValueError,
            UnicodeError,
            binascii.Error,
        ) as exc:
            raise Problem(
                422,
                f"{path} manifest가 읽기 한도를 초과하거나 손상되었습니다.",
            ) from exc

    def inspect(self, repository_url: str, path: str = "") -> dict:
        name = repository_name(repository_url)
        path = scoped_path(path)
        metadata = self._get(name, "")
        if not isinstance(metadata, dict):
            raise Problem(502, "GitHub 저장소 정보가 올바르지 않습니다.")
        canonical = _text(metadata.get("full_name"), 200)
        if (
            not canonical
            or repository_name(f"https://github.com/{canonical}") != canonical
        ):
            raise Problem(502, "GitHub 저장소 식별자가 올바르지 않습니다.")
        if (
            canonical.lower() != name.lower()
            and name.lower() in self.private_repos
        ):
            raise Problem(
                422, "비공개 저장소의 변경된 주소를 직접 입력해 주세요."
            )
        name = canonical
        if metadata.get("private") and (
            not self.token or name.lower() not in self.private_repos
        ):
            raise Problem(
                403, "이 비공개 저장소는 서버에서 허용되지 않았습니다."
            )
        branch = _text(metadata.get("default_branch"), 200)
        if not branch:
            raise Problem(422, "기본 branch가 없는 저장소입니다.")
        branch_data = self._get(name, f"branches/{quote(branch, safe='')}")
        if not isinstance(branch_data, dict):
            raise Problem(502, "기본 branch 정보를 읽지 못했습니다.")
        branch_commit = branch_data.get("commit")
        sha = (
            branch_commit.get("sha")
            if isinstance(branch_commit, dict)
            else None
        )
        if not isinstance(sha, str) or not SHA.fullmatch(sha):
            raise Problem(502, "기본 branch commit이 올바르지 않습니다.")
        tree_data = self._get(
            name, f"git/trees/{sha}?recursive=1", max_bytes=2_000_000
        )
        if not isinstance(tree_data, dict) or not isinstance(
            tree_data.get("tree"), list
        ):
            raise Problem(502, "저장소 파일 목록을 읽지 못했습니다.")
        entries = tree_data["tree"]
        if tree_data.get("truncated") or len(entries) > TREE_LIMIT:
            raise Problem(
                422, "저장소 파일 목록이 너무 커서 범위를 확정할 수 없습니다."
            )
        files = {
            row["path"]: row["sha"]
            for row in entries
            if isinstance(row, dict)
            and row.get("type") == "blob"
            and isinstance(row.get("path"), str)
            and len(row["path"]) <= 250
            and "\\" not in row["path"]
            and all(
                part not in ("", ".", "..") for part in row["path"].split("/")
            )
            and isinstance(row.get("sha"), str)
            and SHA.fullmatch(row["sha"])
        }
        scope_paths = {""}
        for file_path in files:
            file = PurePosixPath(file_path)
            scope = "/".join(file.parts[:-1])
            if (
                file.name in MANIFESTS
                and len(file.parts) <= 3
                and len(scope) <= 200
            ):
                scope_paths.add(scope)
        if path not in scope_paths:
            raise Problem(422, "분석 가능한 package 폴더를 선택해 주세요.")
        prefix = f"{path}/" if path else ""
        available = {
            name: prefix + name for name in MANIFESTS if prefix + name in files
        }
        warnings: list[str] = []
        values: dict[str, Any] = {}
        manifest_path = ""
        kind = "repository"
        for filename in (
            "pyproject.toml",
            "setup.py",
            "package.json",
            "manifest.json",
        ):
            selected = available.get(filename)
            if not selected:
                continue
            raw = self._manifest(name, files[selected], selected)
            try:
                if filename == "pyproject.toml":
                    values = tomllib.loads(raw).get("project", {})
                    kind = "python_package"
                elif filename == "setup.py":
                    values = _setup_metadata(raw)
                    kind = "python_package"
                else:
                    values = json.loads(raw)
                    if not isinstance(values, dict):
                        raise ValueError("manifest")
                    if filename == "manifest.json" and values.get(
                        "manifest_version"
                    ):
                        kind = "browser_extension"
                    elif isinstance(values.get("engines"), dict) and values[
                        "engines"
                    ].get("vscode"):
                        kind = "vscode_extension"
                    else:
                        kind = (
                            "web_app" if "package.json" == filename else kind
                        )
            except (ValueError, TypeError, AttributeError):
                warnings.append(f"{selected} 내용을 해석하지 못했습니다.")
                values = {}
                kind = "repository"
                continue
            if not isinstance(values, dict):
                warnings.append(f"{selected} 내용 형식이 올바르지 않습니다.")
                values = {}
                kind = "repository"
                continue
            manifest_path = selected
            break
        if "manifest.json" in available and kind != "python_package":
            # Browser extension description is more useful than npm metadata.
            selected = available["manifest.json"]
            try:
                extra = json.loads(
                    self._manifest(name, files[selected], selected)
                )
                if isinstance(extra, dict) and extra.get("manifest_version"):
                    kind = "browser_extension"
                    values = extra
                    manifest_path = selected
            except (ValueError, TypeError):
                pass
        if kind == "repository" and any(
            file_path.endswith("/SKILL.md") or file_path == "SKILL.md"
            for file_path in files
            if file_path.startswith(prefix)
        ):
            kind = "skill_catalog"
        package_name = _text(values.get("name"), 200) or name.split("/")[1]
        description = _text(values.get("description"), 1000)
        labels = {
            "python_package": "Python 패키지",
            "browser_extension": "브라우저 확장",
            "vscode_extension": "VS Code 확장",
            "web_app": "웹 앱",
            "skill_catalog": "스킬 카탈로그",
            "repository": "프로젝트",
        }
        if description:
            goal = description
        else:
            dependencies = values.get("dependencies")
            dev_dependencies = values.get("devDependencies")
            dependency_names = (
                set(dependencies) if isinstance(dependencies, dict) else set()
            )
            if isinstance(dev_dependencies, dict):
                dependency_names.update(dev_dependencies)
            stack = [
                label
                for package, label in (
                    ("react", "React"),
                    ("vite", "Vite"),
                    ("next", "Next.js"),
                    ("vue", "Vue"),
                )
                if package in dependency_names
            ]
            if stack:
                goal = f"{package_name} {labels[kind]}을 {'·'.join(stack)} 기반으로 개발하고 관리한다."
                warnings.append(
                    "package 설명이 없어 의존성으로 목표를 제안합니다."
                )
            else:
                goal = (
                    _text(metadata.get("description"), 1000)
                    or f"{package_name} {labels[kind]}을 개발하고 관리한다."
                )
                warnings.append(
                    "package 설명이 없어 저장소 설명 또는 유형으로 목표를 제안합니다."
                )
        if path:
            warnings.append("PR은 선택 폴더가 아닌 저장소 전체의 이력입니다.")
        activities = self._activities(name, sha, path, warnings)
        return {
            "repository_url": f"https://github.com/{name}",
            "repository_full_name": name,
            "branch": branch,
            "sha": sha,
            "path": path,
            "kind": kind,
            "visibility": "private" if metadata.get("private") else "public",
            "scopes": [
                {"path": scope, "label": scope or "저장소 전체"}
                for scope in sorted(
                    scope_paths, key=lambda value: (bool(value), value)
                )
            ],
            "manifest_path": manifest_path,
            "suggested_name": package_name,
            "suggested_goal": goal,
            "activities": activities,
            "warnings": warnings,
        }

    def _activities(
        self, name: str, sha: str, path: str, warnings: list[str]
    ) -> list[dict]:
        activities = []
        commit_query = f"commits?sha={quote(sha)}&per_page={ACTIVITY_LIMIT}"
        if path:
            commit_query += f"&path={quote(path, safe='')}"
        requests = (
            ("commit", commit_query),
            (
                "pr",
                f"pulls?state=all&sort=updated&direction=desc&per_page={ACTIVITY_LIMIT}",
            ),
        )
        for kind, suffix in requests:
            try:
                rows = self._get(name, suffix, max_bytes=250_000)
            except Problem:
                warnings.append(
                    f"최근 {'commit' if kind == 'commit' else 'PR'} 목록을 읽지 못했습니다."
                )
                continue
            if not isinstance(rows, list):
                warnings.append("GitHub 작업 이력 형식이 올바르지 않습니다.")
                continue
            for row in rows[:ACTIVITY_LIMIT]:
                if not isinstance(row, dict):
                    continue
                if kind == "commit":
                    external_id = row.get("sha")
                    raw_commit = row.get("commit")
                    commit: dict[str, Any] = (
                        raw_commit if isinstance(raw_commit, dict) else {}
                    )
                    title = _text(commit.get("message")).split("\n")[0]
                    state = "committed"
                    raw_committer = commit.get("committer")
                    committer: dict[str, Any] = (
                        raw_committer
                        if isinstance(raw_committer, dict)
                        else {}
                    )
                    occurred_at = _date(committer.get("date"))
                else:
                    external_id = str(row.get("number", ""))
                    title = _text(row.get("title"))
                    state = (
                        "merged"
                        if row.get("merged_at")
                        else _text(row.get("state"), 20)
                    )
                    occurred_at = _date(row.get("updated_at"))
                url = row.get("html_url")
                expected_prefix = f"https://github.com/{name}/{'commit/' if kind == 'commit' else 'pull/'}"
                if (
                    not isinstance(external_id, str)
                    or not external_id
                    or (kind == "commit" and not SHA.fullmatch(external_id))
                    or (kind == "pr" and not external_id.isdigit())
                    or not title
                    or not isinstance(url, str)
                    or url != expected_prefix + external_id
                    or not occurred_at
                    or state not in ("committed", "open", "closed", "merged")
                ):
                    continue
                activities.append(
                    {
                        "kind": kind,
                        "external_id": external_id,
                        "title": title,
                        "url": url,
                        "state": state,
                        "occurred_at": occurred_at,
                    }
                )
        return activities
