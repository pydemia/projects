"""Story acceptance, graph compatibility and ACLs on actual PostgreSQL."""

import copy
import io
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from zipfile import ZipFile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from projects.database import (
    Account,
    Item,
    Link,
    ProjectArchiveReferences,
    ProjectMembership,
    ProjectRole,
    Revision,
    SkillRun,
    new_id,
)
from projects.domain import Problem, validate_item_data
from projects.records import add_link
from projects.stories import (
    StoryVerificationInput,
    project_stories,
    verify_story,
)
from projects.story_models import StoryVerification


def payload(item, **overrides):
    return {
        "expected_revision": item["revision"],
        "evidence": "Acceptance run: observed expected result",
        "criterion_results": [
            {
                "criterion": criterion,
                "passed": True,
                "evidence": "Observed in run",
            }
            for criterion in item["data"]["acceptance_criteria"]
        ],
        **overrides,
    }


def update(client, item, **changes):
    return client.put(
        f"/api/items/{item['id']}",
        json={
            "expected_revision": item["revision"],
            "title": item["title"],
            "body": item["body"],
            "data": item["data"],
            **changes,
        },
    )


def test_story_verification_stale_scope_and_no_task_propagation(
    client, project, create_item
):
    story = create_item(
        "requirement",
        "Story",
        data={
            "acceptance_criteria": ["Can save", "Can read"],
            "expected_outcome": "Saved record",
            "scope": "Current account",
            "problem": "Missing record",
            "exclusions": "Other accounts",
        },
    )
    task = create_item("task", "Activity", data={"workflow": "personal"})
    assert story["data"]["processing_state"] == "raised"
    client.post(
        f"/api/projects/{project['id']}/links",
        json={
            "source_id": task["id"],
            "target_id": story["id"],
            "relation": "implements",
        },
    ).raise_for_status()
    completed = update(client, task, data={**task["data"], "state": "done"})
    assert completed.status_code == 200, completed.text
    task = completed.json()
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    assert (summary["task_done"], summary["story_fulfilled"]) == (1, 0)
    path = f"/api/items/{story['id']}/story-verifications"
    verified = client.post(path, json=payload(story))
    assert verified.status_code == 201, verified.text
    current = verified.json()["item"]
    history = client.get(path).json()
    assert history[0]["item_revision"] == story["revision"]
    assert history[0]["evidence"] == payload(story)["evidence"]
    assert current["status"] == story["status"]
    assert current["data"]["processing_state"] == "fulfilled"
    assert (
        client.get(f"/api/projects/{project['id']}/stories").json()[
            "story_fulfilled"
        ]
        == 1
    )
    changed = update(
        client, current, data={**current["data"], "scope": "New scope"}
    )
    assert changed.status_code == 200, changed.text
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    assert (
        summary["stories"][0]["item"]["data"]["processing_state"]
        == "fulfilled"
    )
    assert summary["stories"][0]["verification_current"] is False
    assert summary["story_fulfilled"] == 0
    assert client.get(path).json() == history
    assert client.post(path, json=payload(current)).status_code == 409
    reverified = client.post(path, json=payload(changed.json()))
    assert reverified.status_code == 201, reverified.text
    current = reverified.json()["item"]
    changed_criteria = update(
        client,
        current,
        data={
            **current["data"],
            "acceptance_criteria": ["Can save", "Can read", "Can search"],
        },
    )
    assert changed_criteria.status_code == 200, changed_criteria.text
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    assert summary["story_fulfilled"] == 0
    assert summary["stories"][0]["verification_current"] is False
    assert len(client.get(path).json()) == 2
    assert (
        client.get(f"/api/items/{task['id']}").json()["data"]["state"]
        == "done"
    )


def test_verification_rejects_incomplete_false_duplicate_and_generic_fulfillment(
    client, create_item
):
    forbidden = client.post(
        "/api/projects/" + create_item("idea")["project_id"] + "/items",
        json={
            "kind": "requirement",
            "title": "Forged",
            "data": {"processing_state": "fulfilled"},
        },
    )
    assert forbidden.status_code == 422
    story = create_item(
        "requirement", data={"acceptance_criteria": ["A", "B"]}
    )
    path = f"/api/items/{story['id']}/story-verifications"
    valid = payload(story)
    invalid = [
        {**valid, "evidence": " "},
        {**valid, "criterion_results": valid["criterion_results"][:1]},
        {**valid, "criterion_results": [valid["criterion_results"][0]] * 2},
        {
            **valid,
            "criterion_results": [
                {**row, "passed": False} for row in valid["criterion_results"]
            ],
        },
        {
            **valid,
            "criterion_results": [
                {**row, "evidence": " "} for row in valid["criterion_results"]
            ],
        },
    ]
    for candidate in invalid:
        response = client.post(path, json=candidate)
        assert response.status_code == 422, response.text
    forged = update(
        client, story, data={**story["data"], "processing_state": "fulfilled"}
    )
    assert forged.status_code == 422
    assert client.get(path).json() == []
    empty = create_item("requirement")
    assert (
        client.post(
            f"/api/items/{empty['id']}/story-verifications",
            json=payload(empty),
        ).status_code
        == 422
    )


def test_story_many_to_many_totals_and_symmetric_relationships(
    client, project, create_item
):
    s1, s2, empty = [
        create_item("requirement", title=title)
        for title in ("S1", "S2", "Empty")
    ]
    shared = create_item("task", "Shared", data={"workflow": "personal"})
    independent = create_item(
        "task", "Independent", data={"workflow": "personal"}
    )
    for story in (s1, s2):
        response = client.post(
            f"/api/projects/{project['id']}/links",
            json={
                "source_id": shared["id"],
                "target_id": story["id"],
                "relation": "implements",
            },
        )
        assert response.status_code == 201, response.text
    link_body = {
        "source_id": shared["id"],
        "target_id": independent["id"],
        "relation": "relates_to",
    }
    path = f"/api/projects/{project['id']}/links"
    forward = client.post(path, json=link_body).json()
    reverse = client.post(
        path,
        json={
            **link_body,
            "source_id": independent["id"],
            "target_id": shared["id"],
        },
    ).json()
    assert forward["id"] == reverse["id"]
    assert (
        client.post(
            path, json={**link_body, "target_id": shared["id"]}
        ).status_code
        == 422
    )
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    assert (summary["task_total"], summary["story_total"]) == (2, 3)
    rows = {row["item"]["id"]: row for row in summary["stories"]}
    assert (
        rows[s1["id"]]["task_ids"]
        == rows[s2["id"]]["task_ids"]
        == [shared["id"]]
    )
    assert rows[empty["id"]]["task_ids"] == []
    client.delete(f"/api/links/{forward['id']}").raise_for_status()
    assert client.get(f"/api/items/{shared['id']}").status_code == 200
    assert client.get(f"/api/items/{independent['id']}").status_code == 200


def test_legacy_missing_processing_state_and_reverse_contribution_preserved(
    engine, client, project, create_item
):
    story = create_item(
        "requirement",
        data={"acceptance_criteria": ["Legacy criterion"], "priority": "high"},
    )
    task = create_item("task", "Legacy task", data={"workflow": "personal"})
    with Session(engine) as db, db.begin():
        row = db.get(Item, story["id"])
        legacy = {
            key: value
            for key, value in row.data.items()
            if key
            not in (
                "problem",
                "expected_outcome",
                "scope",
                "exclusions",
                "processing_state",
            )
        }
        row.data = legacy
        revision = db.get(Revision, (row.id, row.revision))
        revision.data = legacy
        original = copy.deepcopy(legacy)
        db.add(
            Link(
                project_id=project["id"],
                source_id=row.id,
                target_id=task["id"],
                relation="implements",
                source_revision=row.revision,
                target_revision=task["revision"],
            )
        )
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    assert summary["stories"][0]["task_ids"] == []
    assert summary["stories"][0]["item"]["data"] == original
    assert summary["stories"][0]["item"]["revision"] == story["revision"]
    assert (
        validate_item_data("requirement", original)["processing_state"] is None
    )
    assert len(client.get(f"/api/projects/{project['id']}/links").json()) == 1
    with engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0015")
        command.upgrade(config, "head")
    after = client.get(f"/api/items/{story['id']}").json()
    assert (after["data"], after["revision"], after["status"]) == (
        original,
        story["revision"],
        story["status"],
    )


def test_dependencies_allow_start_but_preserve_completion_and_cycle_checks(
    client, project, create_item
):
    dependent = create_item("task", "Dependent", data={"workflow": "personal"})
    predecessor = create_item(
        "task", "Predecessor", data={"workflow": "personal"}
    )
    path = f"/api/projects/{project['id']}/links"
    response = client.post(
        path,
        json={
            "source_id": dependent["id"],
            "target_id": predecessor["id"],
            "relation": "depends_on",
        },
    )
    assert response.status_code == 201, response.text
    started = update(
        client, dependent, data={**dependent["data"], "state": "in_progress"}
    )
    assert started.status_code == 200, started.text
    current = started.json()
    assert (
        update(
            client, current, data={**current["data"], "state": "done"}
        ).status_code
        == 409
    )
    assert (
        client.post(
            path,
            json={
                "source_id": predecessor["id"],
                "target_id": dependent["id"],
                "relation": "depends_on",
            },
        ).status_code
        == 409
    )
    finished = update(
        client, predecessor, data={**predecessor["data"], "state": "done"}
    )
    assert finished.status_code == 200, finished.text
    assert (
        update(
            client, current, data={**current["data"], "state": "done"}
        ).status_code
        == 200
    )


def test_story_current_actor_acl_and_hidden_cross_project_task(
    engine, project, create_item
):
    story = create_item("requirement", data={"acceptance_criteria": ["A"]})
    with Session(engine) as db, db.begin():
        from projects.database import Project
        from projects.project_access import initialize_project_access
        from projects.records import create_item as service_create_item

        owner_id = db.get(Project, project["id"]).owner_id
        viewer = Account(
            id=new_id(), username=new_id(), password_hash="unused"
        )
        db.add(viewer)
        db.flush()
        viewer_id = viewer.id
        role = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == project["id"],
                ProjectRole.preset == "viewer",
            )
        )
        db.add(
            ProjectMembership(
                project_id=project["id"], account_id=viewer_id, role_id=role.id
            )
        )
        hidden = Project(owner_id=owner_id, name="Private other project")
        db.add(hidden)
        initialize_project_access(db, hidden)
        task = service_create_item(
            db,
            hidden.id,
            "task",
            "Hidden activity",
            "",
            {"workflow": "personal"},
        )
        add_link(
            db,
            project["id"],
            task,
            db.get(Item, story["id"]),
            "implements",
            actor_id=owner_id,
        )
        hidden_id = task.id
    with Session(engine) as db:
        summary = project_stories(db, project["id"], viewer_id)
        assert hidden_id not in json.dumps(summary)
        assert summary["stories"][0]["task_ids"] == []
        assert summary["task_total"] == 0
        with pytest.raises(Problem) as denied:
            verify_story(
                db,
                story["id"],
                viewer_id,
                StoryVerificationInput.model_validate(payload(story)),
            )
        assert denied.value.status == 403


def test_concurrent_verification_revision_lock_and_append_only(
    engine, project, create_item
):
    story = create_item("requirement", data={"acceptance_criteria": ["A"]})
    from projects.database import Project

    with Session(engine) as db:
        owner_id = db.get(Project, project["id"]).owner_id
    barrier = Barrier(2)

    def attempt():
        barrier.wait(timeout=10)
        with Session(engine) as db:
            try:
                with db.begin():
                    verify_story(
                        db,
                        story["id"],
                        owner_id,
                        StoryVerificationInput.model_validate(payload(story)),
                    )
                return 201
            except Problem as problem:
                return problem.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == [201, 409]
    with Session(engine) as db:
        assert (
            db.scalar(select(func.count()).select_from(StoryVerification)) == 1
        )
        with pytest.raises(DBAPIError, match="append-only"), db.begin_nested():
            db.execute(
                text("UPDATE story_verifications SET evidence = 'rewrite'")
            )
        with pytest.raises(DBAPIError, match="append-only"), db.begin_nested():
            db.execute(text("DELETE FROM story_verifications"))


def test_story_fields_survive_document_sources_and_project_archive(
    engine, client, project, create_item
):
    story = create_item(
        "requirement",
        data={
            "problem": "Need reliable save",
            "expected_outcome": "Saved record",
            "scope": "Selected project",
            "exclusions": "Other projects",
            "processing_state": "planned",
            "acceptance_criteria": ["Saves"],
        },
    )
    document = create_item("artifact", "Story-derived document")
    with Session(engine) as db, db.begin():
        db.add(
            SkillRun(
                project_id=project["id"],
                operation="create_document",
                instruction="Use the selected Story",
                target_id=document["id"],
                target_revision=document["revision"],
                status="succeeded",
                source_snapshots=[story],
                skills_lock=[],
                reference_manifest={},
            )
        )
    response = client.get(f"/api/items/{document['id']}/portable")
    assert response.status_code == 200, response.text
    with ZipFile(io.BytesIO(response.content)) as archive:
        sources = json.loads(archive.read("sources.json"))
    assert sources[0]["data"] == story["data"]
    archive = client.get(f"/api/projects/{project['id']}/export")
    assert archive.status_code == 200, archive.text
    with ZipFile(io.BytesIO(archive.content)) as bundle:
        exported = json.loads(bundle.read("data.json"))
    source = next(
        item for item in exported["items"] if item["id"] == story["id"]
    )
    assert source["data"] == story["data"]


def test_previous_proof_does_not_revive_after_reverted_scope_or_state(
    client, project, create_item
):
    story = create_item(
        "requirement", data={"acceptance_criteria": ["A"], "scope": "A"}
    )
    path = f"/api/items/{story['id']}/story-verifications"
    verified = client.post(path, json=payload(story))
    assert verified.status_code == 201, verified.text
    current = verified.json()["item"]
    changed = update(client, current, data={**current["data"], "scope": "B"})
    assert changed.status_code == 200, changed.text
    changed = changed.json()
    reverted = update(client, changed, data={**changed["data"], "scope": "A"})
    assert reverted.status_code == 200, reverted.text
    summary_path = f"/api/projects/{project['id']}/stories"
    summary = client.get(summary_path).json()
    assert summary["story_fulfilled"] == 0
    assert summary["stories"][0]["verification_current"] is False
    explicit = client.post(path, json=payload(reverted.json()))
    assert explicit.status_code == 201, explicit.text
    assert client.get(summary_path).json()["story_fulfilled"] == 1
    current = explicit.json()["item"]
    held = update(
        client,
        current,
        data={**current["data"], "processing_state": "on_hold"},
    )
    assert held.status_code == 200, held.text
    held = held.json()
    assert (
        update(
            client,
            held,
            data={**held["data"], "processing_state": "fulfilled"},
        ).status_code
        == 422
    )
    assert client.post(path, json=payload(held)).status_code == 201


def test_archived_proof_is_visible_provenance_without_current_attestation(
    engine, client, project, create_item
):
    story = create_item("requirement", data={"acceptance_criteria": ["A"]})
    path = f"/api/items/{story['id']}/story-verifications"
    response = client.post(path, json=payload(story))
    assert response.status_code == 201, response.text
    original = response.json()["verification"]
    # Model the portable import policy: preserve the source attestation in the
    # archive references, never insert an archive-supplied local attestation.
    archived = {**original, "id": new_id(), "actor_id": new_id()}
    with Session(engine) as db, db.begin():
        db.add(
            ProjectArchiveReferences(
                project_id=project["id"],
                data={
                    "planning": {"story_verifications": [archived]},
                },
            )
        )
    history = client.get(path).json()
    assert history[0] == original
    assert history[1] == {**archived, "archived_unverified": True}
    fresh = create_item("requirement", data={"acceptance_criteria": ["B"]})
    with Session(engine) as db, db.begin():
        refs = db.get(ProjectArchiveReferences, project["id"])
        refs.data = {
            "planning": {
                "story_verifications": [{**archived, "item_id": fresh["id"]}]
            }
        }
    summary = client.get(f"/api/projects/{project['id']}/stories").json()
    row = next(
        row for row in summary["stories"] if row["item"]["id"] == fresh["id"]
    )
    assert row["verification_current"] is False
    assert summary["story_fulfilled"] == 1
