"""Integration tests use isolated schemas on the actual PostgreSQL server."""

import base64
import hashlib
import os
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from projects.api import create_app
from projects.config import Settings
from projects.runtime import BundleResolver, RunResult


@pytest.fixture
def engine():
    url = os.getenv(
        "PROJECTS_TEST_DATABASE_URL",
        "postgresql+psycopg://projects:projects@127.0.0.1:5432/projects",
    )
    control = create_engine(url)
    schema = "projects_test_" + uuid4().hex
    with control.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = create_engine(
        url, connect_args={"options": f"-csearch_path={schema}"}
    )
    with isolated.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    yield isolated
    isolated.dispose()
    # This schema name was created by this fixture; no user database is dropped.
    assert schema.startswith("projects_test_") and len(schema) == 46
    with control.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    control.dispose()


class ResultRunner:
    def __init__(self):
        self.closed = False
        self.result = RunResult(
            document="# 실제 결과 형식",
            review="도구 실행 없음",
            requirements=[],
            assumptions=[],
            questions=[],
            source_ids=[],
        )
        self.messages = []

    def run(self, messages):
        self.messages = messages
        return self.result

    def close(self):
        self.closed = True


@pytest.fixture
def app(engine, tmp_path):
    def bundle_response(request):
        skill_id = request.url.path.split("/")[-2]
        content = "# 원문 스킬\n선택한 자료만 근거로 작성하고 미검증을 표시한다.\n".encode()
        return httpx.Response(
            200,
            json={
                "schema_version": 1,
                "id": skill_id,
                "source_revision": "a" * 40,
                "files": [
                    {
                        "path": "SKILL.md",
                        "mode": "644",
                        "sha256": hashlib.sha256(content).hexdigest(),
                        "content_base64": base64.b64encode(content).decode(),
                    }
                ],
            },
        )

    resolver = BundleResolver(
        tmp_path / "skills", transport=httpx.MockTransport(bundle_response)
    )
    settings = Settings(
        data_dir=tmp_path,
        worker_enabled=False,
        registry_path=Path("docs/planning/references/artifact-templates.json"),
    )
    return create_app(
        settings, engine=engine, resolver=resolver, runner=ResultRunner()
    )


@pytest.fixture
def client(app):
    with TestClient(app) as instance:
        response = instance.post(
            "/api/auth/register",
            json={"username": "tester", "password": "test-password-long"},
        )
        assert response.status_code == 201, response.text
        instance.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        yield instance


@pytest.fixture
def project(client):
    response = client.post(
        "/api/projects",
        json={"name": "검증 프로젝트", "goal": "실제 저장 확인"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def create_item(client, project):
    def create(kind="artifact", title="문서", body="# 원문", data=None):
        response = client.post(
            f"/api/projects/{project['id']}/items",
            json={
                "kind": kind,
                "title": title,
                "body": body,
                "data": {} if data is None else data,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    return create
