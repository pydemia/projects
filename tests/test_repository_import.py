"""Repository intake keeps manifest goals separate from GitHub work history."""

import base64
import io
import json
from uuid import uuid4
from zipfile import ZipFile

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from projects.api import create_app
from projects.config import Settings
from projects.domain import Problem
from projects.portable import json_bytes, sha256, zip_files
from projects.repository_import import GitHubInspector, repository_name

SHA = "a" * 40
SOURCE = "https://github.com/pydemia/statusline"


class RepositoryInspectorStub:
    def __init__(self) -> None:
        self.sha = SHA

    def inspect(self, repository_url: str, path: str = "") -> dict:
        assert repository_url == SOURCE
        assert path == ""
        return {
            "repository_url": SOURCE,
            "repository_full_name": "pydemia/statusline",
            "branch": "main",
            "sha": self.sha,
            "path": "",
            "kind": "browser_extension",
            "visibility": "public",
            "scopes": [{"path": "", "label": "저장소 전체"}],
            "manifest_path": "manifest.json",
            "suggested_name": "statusline",
            "suggested_goal": "브라우저 상태 표시줄을 관리한다.",
            "activities": [
                {
                    "kind": "commit",
                    "external_id": SHA,
                    "title": "Fix status indicator",
                    "url": f"{SOURCE}/commit/{SHA}",
                    "state": "committed",
                    "occurred_at": "2026-10-20T00:00:00+00:00",
                },
                {
                    "kind": "pr",
                    "external_id": "8",
                    "title": "Add browser support",
                    "url": f"{SOURCE}/pull/8",
                    "state": "merged",
                    "occurred_at": "2026-10-21T00:00:00+00:00",
                },
            ],
            "warnings": [],
        }


def test_preview_and_create_repository_project(app, client):
    stub = RepositoryInspectorStub()
    app.state.github = stub
    preview = client.post(
        "/api/projects/from-git/preview", json={"repository_url": SOURCE}
    )
    assert preview.status_code == 200, preview.text
    assert (
        preview.json()["suggested_goal"] == "브라우저 상태 표시줄을 관리한다."
    )
    assert [row["kind"] for row in preview.json()["activities"]] == [
        "commit",
        "pr",
    ]

    payload = {
        "repository_url": SOURCE,
        "path": "",
        "expected_sha": SHA,
        "name": "Statusline 운영",
        "goal": "브라우저 상태 표시줄을 개선한다.",
        "profile": "standard",
    }
    response = client.post("/api/projects/from-git", json=payload)
    assert response.status_code == 201, response.text
    project = response.json()
    assert project["repository_url"] == SOURCE
    assert project["repository_sha"] == SHA
    assert project["repository_manifest"] == "manifest.json"
    assert project["goal"] == payload["goal"]
    items = client.get(f"/api/projects/{project['id']}/items").json()
    assert [item["kind"] for item in items] == ["idea"]
    assert items[0]["status"] == "draft"
    activities = client.get(
        f"/api/projects/{project['id']}/repository-activity"
    ).json()
    assert [row["kind"] for row in activities] == ["pr", "commit"]
    assert (
        client.post("/api/projects/from-git", json=payload).status_code == 409
    )

    exported = client.get(f"/api/projects/{project['id']}/export")
    assert exported.status_code == 200
    with ZipFile(io.BytesIO(exported.content)) as archive:
        data = json.loads(archive.read("data.json"))
    assert data["project"]["repository_sha"] == SHA
    assert len(data["repository_activities"]) == 2
    assert "token" not in json.dumps(data).lower()

    stub.sha = "b" * 40
    assert (
        client.post("/api/projects/from-git", json=payload).status_code == 409
    )


def test_repository_import_requires_login_and_csrf(app, client):
    app.state.github = RepositoryInspectorStub()
    with TestClient(app) as anonymous:
        assert (
            anonymous.post(
                "/api/projects/from-git/preview",
                json={"repository_url": SOURCE},
            ).status_code
            == 401
        )
    token = client.headers.pop("X-CSRF-Token")
    assert (
        client.post(
            "/api/projects/from-git/preview", json={"repository_url": SOURCE}
        ).status_code
        == 403
    )
    client.headers["X-CSRF-Token"] = token


def test_repository_activity_is_private_to_project_owner(client, app):
    app.state.github = RepositoryInspectorStub()
    created = client.post(
        "/api/projects/from-git",
        json={
            "repository_url": SOURCE,
            "expected_sha": SHA,
            "name": "Statusline",
        },
    ).json()
    with TestClient(app) as other:
        account = other.post(
            "/api/auth/register",
            json={
                "username": "different-user",
                "password": "different-password-long",
            },
        )
        other.headers["X-CSRF-Token"] = account.json()["csrf_token"]
        assert (
            other.get(
                f"/api/projects/{created['id']}/repository-activity"
            ).status_code
            == 404
        )


def test_repository_archive_import_keeps_source(client, app, engine, tmp_path):
    app.state.github = RepositoryInspectorStub()
    source = client.post(
        "/api/projects/from-git",
        json={
            "repository_url": SOURCE,
            "expected_sha": SHA,
            "name": "Statusline",
        },
    ).json()
    assert source["goal"] == "브라우저 상태 표시줄을 관리한다."
    archive = client.get(f"/api/projects/{source['id']}/export").content
    assert (
        client.post(
            "/api/projects/import",
            json={"archive_base64": base64.b64encode(archive).decode()},
        ).status_code
        == 409
    )
    schema = "projects_test_" + uuid4().hex
    control = create_engine(engine.url)
    with control.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = create_engine(
        engine.url, connect_args={"options": f"-csearch_path={schema}"}
    )
    try:
        with isolated.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        restored_app = create_app(
            Settings(data_dir=tmp_path, worker_enabled=False), engine=isolated
        )
        with TestClient(restored_app) as target:
            login = target.post(
                "/api/auth/register",
                json={
                    "username": "restore-user",
                    "password": "restore-password-long",
                },
            )
            target.headers["X-CSRF-Token"] = login.json()["csrf_token"]
            restored = target.post(
                "/api/projects/import",
                json={"archive_base64": base64.b64encode(archive).decode()},
            )
            assert restored.status_code == 201, restored.text
            assert restored.json()["repository_url"] == SOURCE
            history = target.get(
                f"/api/projects/{restored.json()['id']}/repository-activity"
            ).json()
            assert len(history) == 2
    finally:
        isolated.dispose()
        assert schema.startswith("projects_test_") and len(schema) == 46
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        control.dispose()


def test_legacy_archive_without_repository_fields_still_restores(client):
    created = client.post(
        "/api/projects", json={"name": "기존 프로젝트"}
    ).json()
    archive = client.get(f"/api/projects/{created['id']}/export").content
    with ZipFile(io.BytesIO(archive)) as bundle:
        data = json.loads(bundle.read("data.json"))
    data["project"]["id"] = str(uuid4())
    for key in list(data["project"]):
        if key.startswith("repository_"):
            data["project"].pop(key)
    data.pop("repository_activities", None)
    content = json_bytes(data)
    legacy = zip_files(
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
    restored = client.post(
        "/api/projects/import",
        json={"archive_base64": base64.b64encode(legacy).decode()},
    )
    assert restored.status_code == 201, restored.text
    assert restored.json()["repository_url"] is None
    assert restored.json()["repository_path"] == ""


@pytest.mark.parametrize(
    "address",
    [
        "https://evil.example/pydemia/statusline",
        "http://github.com/pydemia/statusline",
        "https://user:pass@github.com/pydemia/statusline",
        "https://github.com:443/pydemia/statusline",
        "https://github.com/pydemia/statusline/tree/main",
        "https://github.com/pydemia/statusline?token=x",
        "https://github.com//pydemia/statusline",
        "https://github.com:invalid/pydemia/statusline",
    ],
)
def test_repository_url_boundary(address):
    with pytest.raises(Problem):
        repository_name(address)


def test_inspector_uses_manifest_and_commit_pr_summaries():
    requests: list[str] = []
    manifest = json.dumps(
        {
            "name": "Statusline",
            "description": "Browser status helper",
            "manifest_version": 3,
        }
    ).encode()

    def reply(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        path = request.url.path
        if path.endswith("/repos/pydemia/statusline"):
            return httpx.Response(
                200,
                json={
                    "full_name": "pydemia/statusline",
                    "default_branch": "main",
                    "private": False,
                },
            )
        if path.endswith("/branches/main"):
            return httpx.Response(200, json={"commit": {"sha": SHA}})
        if path.endswith("/git/trees/" + SHA):
            return httpx.Response(
                200,
                json={
                    "truncated": False,
                    "tree": [
                        {
                            "type": "blob",
                            "path": "manifest.json",
                            "sha": "b" * 40,
                        }
                    ],
                },
            )
        if path.endswith("/git/blobs/" + "b" * 40):
            return httpx.Response(
                200,
                json={
                    "encoding": "base64",
                    "content": base64.b64encode(manifest).decode(),
                },
            )
        if path.endswith("/commits"):
            return httpx.Response(
                200,
                json=[
                    {
                        "sha": SHA,
                        "html_url": f"{SOURCE}/commit/{SHA}",
                        "commit": {
                            "message": "Fix toolbar\nDetails",
                            "committer": {"date": "2026-10-20T00:00:00Z"},
                        },
                    }
                ],
            )
        if path.endswith("/pulls"):
            return httpx.Response(
                200,
                json=[
                    {
                        "number": 3,
                        "title": "Support dark mode",
                        "html_url": f"{SOURCE}/pull/3",
                        "state": "closed",
                        "merged_at": "2026-10-21T00:00:00Z",
                        "updated_at": "2026-10-21T00:00:00Z",
                    }
                ],
            )
        return httpx.Response(404)

    inspector = GitHubInspector(transport=httpx.MockTransport(reply))
    try:
        result = inspector.inspect(SOURCE)
    finally:
        inspector.close()
    assert result["kind"] == "browser_extension"
    assert result["suggested_goal"] == "Browser status helper"
    assert [row["title"] for row in result["activities"]] == [
        "Fix toolbar",
        "Support dark mode",
    ]
    assert all(
        "README" not in url and "/contents/" not in url for url in requests
    )


def test_package_dependencies_supply_goal_without_description():
    source = "https://github.com/pydemia/colors"
    package = json.dumps(
        {
            "name": "colors",
            "dependencies": {"react": "^19"},
            "devDependencies": {"vite": "^8"},
        }
    ).encode()

    def reply(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/repos/pydemia/colors"):
            return httpx.Response(
                200,
                json={
                    "full_name": "pydemia/colors",
                    "default_branch": "main",
                    "private": False,
                    "description": None,
                },
            )
        if path.endswith("/branches/main"):
            return httpx.Response(200, json={"commit": {"sha": SHA}})
        if path.endswith("/git/trees/" + SHA):
            return httpx.Response(
                200,
                json={
                    "truncated": False,
                    "tree": [
                        {
                            "type": "blob",
                            "path": "package.json",
                            "sha": "b" * 40,
                        },
                    ],
                },
            )
        if path.endswith("/git/blobs/" + "b" * 40):
            return httpx.Response(
                200,
                json={
                    "encoding": "base64",
                    "content": base64.b64encode(package).decode(),
                },
            )
        return httpx.Response(200, json=[])

    inspector = GitHubInspector(transport=httpx.MockTransport(reply))
    try:
        preview = inspector.inspect(source)
    finally:
        inspector.close()
    assert preview["kind"] == "web_app"
    assert (
        preview["suggested_goal"]
        == "colors 웹 앱을 React·Vite 기반으로 개발하고 관리한다."
    )


def test_github_token_only_reaches_exactly_allowed_repository():
    headers: list[tuple[str, str | None]] = []

    def reply(request: httpx.Request) -> httpx.Response:
        headers.append(
            (request.url.path, request.headers.get("Authorization"))
        )
        return httpx.Response(200, json={})

    inspector = GitHubInspector(
        token="fixture-only-secret",
        private_repos=("pydemia/private",),
        transport=httpx.MockTransport(reply),
    )
    try:
        inspector._get("pydemia/public", "")
        inspector._get("pydemia/private", "")
    finally:
        inspector.close()
    assert headers == [
        ("/repos/pydemia/public", None),
        ("/repos/pydemia/private", "Bearer fixture-only-secret"),
    ]


def test_public_repository_rename_follows_only_github_metadata_redirect():
    visited: list[str] = []

    def reply(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        if request.url.path.endswith("/pydemia/skills"):
            return httpx.Response(
                301,
                headers={
                    "Location": "https://api.github.com/repos/pydemia/mengto-skills"
                },
            )
        return httpx.Response(200, json={"full_name": "pydemia/mengto-skills"})

    inspector = GitHubInspector(transport=httpx.MockTransport(reply))
    try:
        metadata = inspector._get("pydemia/skills", "")
    finally:
        inspector.close()
    assert metadata == {"full_name": "pydemia/mengto-skills"}
    assert visited == [
        "https://api.github.com/repos/pydemia/skills",
        "https://api.github.com/repos/pydemia/mengto-skills",
    ]


def test_external_redirect_is_rejected_without_following():
    visited: list[str] = []

    def reply(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        return httpx.Response(
            301, headers={"Location": "https://example.com/collect"}
        )

    inspector = GitHubInspector(transport=httpx.MockTransport(reply))
    try:
        with pytest.raises(Problem):
            inspector._get("pydemia/skills", "")
    finally:
        inspector.close()
    assert visited == ["https://api.github.com/repos/pydemia/skills"]
