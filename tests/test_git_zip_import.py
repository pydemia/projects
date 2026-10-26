"""Git source ZIP intake uses only bounded manifest metadata."""

import base64
import io
import json
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient

from projects.domain import Problem
from projects.git_zip_import import inspect_git_zip


def source_zip(files: dict[str, str]) -> str:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return base64.b64encode(buffer.getvalue()).decode()


@pytest.mark.parametrize(
    ("filename", "content", "kind", "goal"),
    [
        (
            "manifest.json",
            '{"name":"Statusline","description":"Browser status","manifest_version":3}',
            "browser_extension",
            "Browser status",
        ),
        (
            "package.json",
            '{"name":"colors","description":"Color toolkit"}',
            "web_app",
            "Color toolkit",
        ),
        (
            "pyproject.toml",
            '[project]\nname="toolkit"\ndescription="Python tools"',
            "python_package",
            "Python tools",
        ),
        (
            "setup.py",
            'from setuptools import setup\nsetup(name="sample", description="Static setup")',
            "python_package",
            "Static setup",
        ),
    ],
)
def test_git_zip_manifest_types(filename, content, kind, goal):
    encoded = source_zip({f"repo-main/{filename}": content})
    preview = inspect_git_zip(encoded, "repo-main.zip")
    assert preview["kind"] == kind
    assert preview["suggested_goal"] == goal
    assert preview["manifest_path"] == filename
    assert "commit·PR" in preview["warnings"][0]


def test_git_archive_root_and_nested_scope():
    encoded = source_zip(
        {
            "README.md": "readme",
            "extension/package.json": json.dumps(
                {"name": "extension", "engines": {"vscode": "^1"}}
            ),
            "extension/SKILL.md": "# skill",
        }
    )
    root = inspect_git_zip(encoded, "source.zip")
    assert root["kind"] == "skill_catalog"
    assert [scope["path"] for scope in root["scopes"]] == ["", "extension"]
    nested = inspect_git_zip(encoded, "source.zip", "extension")
    assert nested["kind"] == "vscode_extension"
    assert nested["suggested_name"] == "extension"


@pytest.mark.parametrize(
    "name", ["../secret", "/absolute", "folder/../secret"]
)
def test_git_zip_rejects_unsafe_paths(name):
    with pytest.raises(Problem) as error:
        inspect_git_zip(source_zip({name: "unsafe"}), "source.zip")
    assert error.value.status == 422


def test_git_zip_rejects_projects_backup():
    with pytest.raises(Problem, match="백업 ZIP"):
        inspect_git_zip(source_zip({"data.json": "{}", "manifest.json": "{}"}))


def test_git_zip_api_creates_project_without_history(client):
    archive = source_zip(
        {
            "sample-main/package.json": '{"name":"sample","description":"Sample package"}'
        }
    )
    body = {"archive_base64": archive, "archive_name": "sample-main.zip"}
    preview_response = client.post(
        "/api/projects/from-git-zip/preview", json=body
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["suggested_goal"] == "Sample package"
    created = client.post(
        "/api/projects/from-git-zip",
        json={
            **body,
            "expected_sha256": preview["archive_sha256"],
            "name": "Sample project",
            "profile": "simple",
        },
    )
    assert created.status_code == 201, created.text
    project = created.json()
    assert project["repository_url"] is None
    assert project["repository_sha"] is None
    assert project["repository_manifest"] == "package.json"
    assert project["goal"] == "Sample package"
    assert (
        client.get(f"/api/projects/{project['id']}/repository-activity").json()
        == []
    )
    items = client.get(f"/api/projects/{project['id']}/items").json()
    assert len(items) == 1 and items[0]["kind"] == "idea"
    assert preview["archive_sha256"] in items[0]["body"]
    assert "commit·PR 이력이 없어" in items[0]["body"]

    changed = client.post(
        "/api/projects/from-git-zip",
        json={
            **body,
            "expected_sha256": "0" * 64,
            "name": "Changed",
        },
    )
    assert changed.status_code == 409
    assert client.post("/api/projects/import", json=body).status_code == 422


def test_git_zip_api_requires_login_and_csrf(app, client):
    archive = source_zip({"package.json": '{"name":"sample"}'})
    body = {"archive_base64": archive, "archive_name": "sample.zip"}
    with TestClient(app) as anonymous:
        assert (
            anonymous.post(
                "/api/projects/from-git-zip/preview", json=body
            ).status_code
            == 401
        )
    token = client.headers.pop("X-CSRF-Token")
    assert (
        client.post(
            "/api/projects/from-git-zip/preview", json=body
        ).status_code
        == 403
    )
    client.headers["X-CSRF-Token"] = token
