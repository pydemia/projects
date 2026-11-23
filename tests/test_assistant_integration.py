"""Assistant service authentication and receipts use isolated PostgreSQL data."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from projects.database import AssistantOperation, Item
from projects.note_references import list_note_refs

PREFIX = "/api/integrations/assistant/v1"


def encoded(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


@pytest.fixture
def assistant(client, project, tmp_path, monkeypatch):
    identity = project["owner_id"]
    key = secrets.token_bytes(32)
    (tmp_path / "test-key").write_text(encoded(key))
    config = {
        "version": 1,
        "principals": [
            {
                "id": "test-assistant",
                "revision": 1,
                "enabled": True,
                "kid": "test-key",
                "secretFile": "test-key",
                "accountId": identity,
                "projectIds": [project["id"]],
                "scopes": [
                    "projects:read",
                    "tasks:read",
                    "tasks:create",
                    "tasks:update",
                    "results:attach",
                ],
            }
        ],
    }
    config_path = tmp_path / "integration.json"
    monkeypatch.setenv("PROJECTS_ASSISTANT_INTEGRATION_FILE", str(config_path))

    def send(method, path, payload=None, *, claims=None, headers=None):
        config_path.write_text(json.dumps(config))
        body = b"" if payload is None else json.dumps(payload).encode()
        now = int(time.time())
        values = [
            1,
            "projects",
            "test-key",
            now,
            now + 60,
            str(uuid4()),
            method,
            path,
            hashlib.sha256(body).hexdigest(),
            "test-assistant",
            1,
        ]
        for index, value in (claims or {}).items():
            values[index] = value
        raw = encoded(json.dumps(values, separators=(",", ":")).encode())
        signature = encoded(hmac.digest(key, raw.encode(), "sha256"))
        return client.request(
            method,
            path,
            content=body,
            headers={
                "Authorization": f"Bearer {raw}.{signature}",
                "Content-Type": "application/json",
                **(headers or {}),
            },
        )

    return send, config, identity


def test_unconfigured_service_rejects_browser_identity(client, monkeypatch):
    monkeypatch.delenv("PROJECTS_ASSISTANT_INTEGRATION_FILE", raising=False)
    response = client.get(PREFIX + "/projects")
    assert response.status_code == 503
    assert response.json()["code"] == "unconfigured"


def test_service_requires_bearer_even_with_browser_session(assistant, client):
    send, _, _ = assistant
    assert send("GET", PREFIX + "/projects").status_code == 200
    response = client.get(PREFIX + "/projects")
    assert response.status_code == 401
    assert response.json()["code"] == "authentication_required"


@pytest.mark.parametrize(
    "claims",
    [
        {1: "other-service"},
        {3: 0, 4: 60},
        {6: "POST"},
        {7: PREFIX + "/tasks"},
        {8: "0" * 64},
        {9: "other-principal"},
        {10: 2},
    ],
)
def test_signed_claims_are_bound_to_request_and_principal(assistant, claims):
    send, _, _ = assistant
    response = send("GET", PREFIX + "/projects", claims=claims)
    assert response.status_code == 401
    assert response.json()["code"] == "authentication_required"


def test_operations_replay_once_and_recheck_current_grants(
    assistant, project, engine
):
    send, config, _ = assistant
    path = PREFIX + f"/projects/{project['id']}/tasks"
    payload = {"operation_id": str(uuid4()), "title": "Assistant task"}
    first = send("POST", path, payload)
    assert first.status_code == 200, first.text
    receipt = first.json()
    assert send("POST", path, payload).json() == receipt
    assert (
        send("POST", path, {**payload, "title": "Changed payload"}).status_code
        == 409
    )
    operation_path = PREFIX + f"/operations/{payload['operation_id']}"
    assert send("GET", operation_path).json() == receipt
    config["principals"][0]["scopes"].remove("tasks:create")
    assert send("GET", operation_path).status_code == 403
    config["principals"][0]["scopes"].append("tasks:create")
    config["principals"][0]["projectIds"] = []
    assert send("GET", operation_path).status_code == 404
    config["principals"][0]["enabled"] = False
    assert send("GET", operation_path).status_code == 401
    with Session(engine) as db:
        assert (
            db.scalar(select(func.count()).select_from(AssistantOperation))
            == 1
        )
        assert db.scalar(select(func.count()).select_from(Item)) == 1


def test_service_cannot_select_an_owner_or_an_unlisted_project(
    assistant, client, project
):
    send, _, _ = assistant
    other = client.post(
        "/api/projects", json={"name": "Outside binding"}
    ).json()
    outside = send("GET", PREFIX + f"/projects/{other['id']}/tasks")
    assert outside.status_code == 404
    injected = send(
        "POST",
        PREFIX + f"/projects/{project['id']}/tasks",
        {
            "operation_id": str(uuid4()),
            "title": "Owner injection",
            "owner_id": "attacker",
        },
        headers={"X-Forwarded-User": "attacker"},
    )
    assert injected.status_code == 422


def test_result_attach_preserves_manual_notes_and_revision_checks(
    assistant, create_item, engine
):
    send, _, identity = assistant
    task = create_item(kind="task", data={"workflow": "personal"})
    manual = {
        "id": str(uuid4()),
        "provider": "note",
        "page_id": "manual",
        "url": "https://note.pydemia.ai/#/page/manual",
        "revision": None,
        "content_hash": None,
        "verification": "unverified",
    }
    with Session(engine) as db, db.begin():
        row = db.get(Item, task["id"])
        row.data = {**row.data, "note_references": [manual]}
    path = PREFIX + f"/tasks/{task['id']}/results"
    payload = {
        "operation_id": str(uuid4()),
        "expected_revision": task["revision"],
        "note": {
            "workspace_id": "workspace-a",
            "page_id": "page-a",
            "url": "https://note.pydemia.ai/#/w/workspace-a/page/page-a",
            "revision": "a" * 64,
            "content_hash": "b" * 64,
        },
        "runtime": {"service": "assistant", "run_id": "run-a"},
    }
    result = send("POST", path, payload)
    assert result.status_code == 200, result.text
    stored = result.json()["task"]
    assert stored["data"]["note_references"] == [manual]
    assert stored["data"]["assistant_result"]["note"] == payload["note"]
    with Session(engine) as db:
        refs = list_note_refs(db, identity, task["id"])
    assert len(refs) == 2
    assert refs[1]["url"] == payload["note"]["url"]
    assert refs[1]["verification"] == "unverified"
    assert "workspace_id" not in refs[1]
    assert send("POST", path, payload).json() == result.json()
    assert (
        send(
            "POST", path, {**payload, "operation_id": str(uuid4())}
        ).status_code
        == 409
    )
    bad_note = {**payload["note"], "workspace_id": "different"}
    assert send("POST", path, {**payload, "note": bad_note}).status_code == 422
