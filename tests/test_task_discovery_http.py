import base64
import io
import json
from uuid import uuid4
from zipfile import ZipFile

from projects.portable import json_bytes, sha256, zip_files


def test_transfer_http_and_note_reference_survive(
    client, project, create_item
):
    target = client.post("/api/projects", json={"name": "이동 대상"}).json()
    item = create_item("task", "실제 HTTP 이동", data={"workflow": "personal"})
    linked = client.post(
        f"/api/items/{item['id']}/note-references",
        json={
            "expected_revision": item["revision"],
            "url": "https://note.pydemia.ai/#/page/task-plan",
            "revision": "a" * 64,
            "content_hash": "b" * 64,
        },
    )
    assert linked.status_code == 201, linked.text
    item = linked.json()
    ref = item["data"]["note_references"][0]
    request = {
        "tasks": [{"id": item["id"], "expected_revision": item["revision"]}],
        "target_project_id": target["id"],
    }
    preview = client.post("/api/task-transfers/preview", json=request)
    assert preview.status_code == 200, preview.text
    operation = str(uuid4())
    commit = {
        **request,
        "preview_token": preview.json()["preview_token"],
        "operation_id": operation,
    }
    moved = client.post(f"/api/items/{item['id']}/transfer", json=commit)
    assert moved.status_code == 200, moved.text
    assert moved.json()["tasks"][0]["data"]["note_references"] == [ref]
    assert (
        client.get(f"/api/task-transfers/by-operation/{operation}").json()
        == moved.json()
    )
    assert (
        client.post("/api/task-transfers", json=commit).json() == moved.json()
    )
    refs = client.get(f"/api/items/{item['id']}/note-references").json()
    assert refs == [ref] and ref["verification"] == "unverified"
    undone = client.post(
        f"/api/task-transfers/{moved.json()['transfer_id']}/undo",
        json={"operation_id": str(uuid4())},
    )
    assert undone.status_code == 200, undone.text
    assert undone.json()["tasks"][0]["project_id"] == project["id"]
    context = client.get(f"/api/items/{item['id']}/task-context")
    assert context.status_code == 200, context.text
    assert len(context.json()["transfers"]) == 2
    assert (
        context.json()["transfers"][0]["target_project_name"]
        == project["name"]
    )
    assert client.get(f"/api/items/{item['id']}/note-references").json() == [
        ref
    ]


def test_legacy_and_version_two_saved_view_validation(client, project):
    endpoint = f"/api/projects/{project['id']}/task-views"
    legacy = {
        "name": "이전 오늘",
        "settings": {"mode": "simple", "view": "today"},
    }
    assert client.post(endpoint, json=legacy).status_code == 201
    bad = {
        "name": "유효하지 않은 이전 조합",
        "settings": {"mode": "simple", "view": "board"},
    }
    assert client.post(endpoint, json=bad).status_code == 422
    v2 = {
        "name": "간편 보드",
        "settings": {
            "schema_version": 2,
            "mode": "simple",
            "view": "board",
            "task_scope": "today",
            "grouping": "state",
        },
    }
    response = client.post(endpoint, json=v2)
    assert response.status_code == 201, response.text
    assert response.json()["settings"]["task_scope"] == "today"


def test_legacy_task_archive_preserves_pre_note_revision(
    client, project, create_item
):
    original = create_item(
        "task", "Note 필드 이전의 작업", data={"workflow": "personal"}
    )
    archive = client.get(f"/api/projects/{project['id']}/export").content
    with ZipFile(io.BytesIO(archive)) as bundle:
        data = json.loads(bundle.read("data.json"))
    project_id, task_id = str(uuid4()), str(uuid4())
    data["schema_version"] = 1
    data["project"]["id"] = project_id
    for item in data["items"]:
        item["id"], item["project_id"] = task_id, project_id
        item["data"].pop("note_references", None)
    for revision in data["revisions"]:
        revision["item_id"] = task_id
        revision["data"].pop("note_references", None)
    for position in data.get("task_positions", []):
        position["item_id"] = task_id
    data.pop("external_references", None)
    data.pop("task_transfers", None)
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
    task = client.get(f"/api/items/{task_id}").json()
    assert "note_references" not in task["data"]
    assert task["title"] == original["title"]
    assert client.get(f"/api/items/{task_id}/note-references").json() == []
