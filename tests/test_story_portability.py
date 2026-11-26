"""Actual PostgreSQL schema3 restoration and untrusted-proof boundaries."""

import base64
import copy
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from projects.database import Account, Item, Project, ProjectArchiveReferences
from projects.domain import Problem
from projects.portable import (
    export_project,
    import_project,
    json_bytes,
    read_archive,
    sha256,
    zip_files,
)
from projects.schedule_models import (
    ProjectSchedule,
    ScheduleChange,
    ScheduleSnapshot,
    TaskIteration,
    TaskIterationChange,
)
from projects.schedules import transition_phase
from projects.stories import project_stories, story_verifications
from projects.story_models import StoryVerification


@pytest.fixture
def restore_engine(engine):
    control = create_engine(engine.url)
    schema = "projects_test_" + uuid4().hex
    with control.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    restored = create_engine(
        engine.url, connect_args={"options": f"-csearch_path={schema}"}
    )
    try:
        with restored.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield restored
    finally:
        restored.dispose()
        assert schema.startswith("projects_test_") and len(schema) == 46
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        control.dispose()


def encoded(data):
    content = json_bytes(data)
    return base64.b64encode(
        zip_files(
            {
                "data.json": content,
                "manifest.json": json_bytes(
                    {
                        "schema_version": data["schema_version"],
                        "kind": "project_archive",
                        "files": {"data.json": sha256(content)},
                    }
                ),
            }
        )
    ).decode()


def archive(client, project):
    response = client.get(f"/api/projects/{project['id']}/export")
    assert response.status_code == 200, response.text
    return read_archive(base64.b64encode(response.content).decode())


def restore(db, data):
    user = Account(username="restore-actor", password_hash="unused")
    db.add(user)
    db.flush()
    return user, import_project(db, user.id, encoded(data))


def populated(client, project, create_item):
    story = create_item(
        "requirement",
        "Story",
        data={
            "acceptance_criteria": ["첫 조건", "두 조건"],
            "expected_outcome": "결과",
            "scope": "범위",
            "exclusions": "제외",
        },
    )
    verified = client.post(
        f"/api/items/{story['id']}/story-verifications",
        json={
            "expected_revision": story["revision"],
            "evidence": "서버 검증 이력",
            "criterion_results": [
                {"criterion": "두 조건", "passed": True, "evidence": "둘"},
                {"criterion": "첫 조건", "passed": True, "evidence": "하나"},
            ],
        },
    )
    assert verified.status_code == 201, verified.text
    task = create_item("task", "공유 Task", data={"workflow": "personal"})
    base = f"/api/projects/{project['id']}"
    phase = client.post(
        base + "/schedules",
        json={"kind": "phase", "title": "단계", "start_date": "2026-11-01"},
    )
    assert phase.status_code == 201, phase.text
    phase = phase.json()
    members = client.put(
        base + f"/schedules/{phase['id']}/members",
        json={
            "expected_revision": 1,
            "item_ids": [story["id"], task["id"]],
        },
    )
    assert members.status_code == 200, members.text
    iteration = client.post(
        base + "/schedules", json={"kind": "iteration", "title": "반복"}
    )
    assert iteration.status_code == 201, iteration.text
    assigned = client.put(
        base + f"/task-iterations/{task['id']}",
        json={
            "expected_schedule_revision": 0,
            "iteration_id": iteration.json()["id"],
        },
    )
    assert assigned.status_code == 200, assigned.text
    snapshot = client.post(
        base + "/schedule-snapshots",
        json={"title": "원안", "reason": "계획 승인"},
    )
    assert snapshot.status_code == 201, snapshot.text
    return story, task, phase


def test_schema3_round_trip_preserves_history_without_importing_attestation(
    client,
    project,
    create_item,
    restore_engine,
):
    story, task, phase = populated(client, project, create_item)
    data = archive(client, project)
    assert data["schema_version"] == 3
    assert (
        "planning_drafts" not in data and "planning_applications" not in data
    )
    with Session(restore_engine) as db, db.begin():
        user, restored = restore(db, data)
        assert (
            db.get(Item, story["id"]).data["processing_state"] == "fulfilled"
        )
        assert (
            db.scalar(select(func.count()).select_from(StoryVerification)) == 0
        )
        assert (
            project_stories(db, restored.id, user.id)["stories"][0][
                "verification_current"
            ]
            is False
        )
        assert (
            db.get(TaskIteration, task["id"]).iteration_id
            == data["planning"]["task_iterations"][0]["iteration_id"]
        )
        assert db.get(ProjectSchedule, phase["id"]).revision == 2
        assert db.scalar(select(func.count()).select_from(ScheduleChange)) == 3
        assert (
            db.scalar(select(func.count()).select_from(TaskIterationChange))
            == 1
        )
        assert (
            db.scalar(select(func.count()).select_from(ScheduleSnapshot)) == 1
        )
        history = db.get(ProjectArchiveReferences, restored.id).data[
            "planning"
        ]
        assert (
            history["story_verifications"]
            == data["planning"]["story_verifications"]
        )
        assert story_verifications(db, story["id"], user.id) == [
            {**proof, "archived_unverified": True}
            for proof in data["planning"]["story_verifications"]
        ]
        reexport = read_archive(
            base64.b64encode(
                export_project(db, restored, actor_id=user.id)
            ).decode()
        )
        assert reexport["planning"] == data["planning"]
        assert reexport["items"] == data["items"]
        assert reexport["revisions"] == data["revisions"]


@pytest.mark.parametrize("version", [1, 2])
def test_old_archive_has_empty_optional_history_without_rewriting_legacy(
    client,
    project,
    create_item,
    restore_engine,
    version,
):
    story = create_item("requirement", "기존 요구사항")
    data = archive(client, project)
    data["schema_version"] = version
    data.pop("planning", None)
    for row in [*data["items"], *data["revisions"]]:
        for key in (
            "problem",
            "expected_outcome",
            "scope",
            "exclusions",
            "processing_state",
        ):
            row["data"].pop(key, None)
    with Session(restore_engine) as db, db.begin():
        user, restored = restore(db, data)
        reexport = read_archive(
            base64.b64encode(
                export_project(db, restored, actor_id=user.id)
            ).decode()
        )
        assert reexport["items"] == data["items"]
        assert reexport["revisions"] == data["revisions"]
        assert "processing_state" not in db.get(Item, story["id"]).data
        assert "planning" not in reexport


@pytest.mark.parametrize(
    "tamper",
    [
        "proof_hash",
        "foreign_member",
        "assignment",
        "duplicate",
        "unknown_column",
    ],
)
def test_rehashed_tampered_extensions_are_rejected_atomically(
    client,
    project,
    create_item,
    restore_engine,
    tamper,
):
    populated(client, project, create_item)
    data = archive(client, project)
    planning = data["planning"]
    if tamper == "proof_hash":
        planning["story_verifications"][0]["criteria_hash"] = "f" * 64
    elif tamper == "foreign_member":
        planning["schedules"][0]["member_ids"] = [str(uuid4())]
    elif tamper == "assignment":
        planning["task_iterations"][0]["iteration_id"] = str(uuid4())
    elif tamper == "duplicate":
        planning["schedule_snapshots"].append(
            copy.deepcopy(planning["schedule_snapshots"][0])
        )
    else:
        planning["schedules"][0]["inline_auth"] = "must-reject"
    with Session(restore_engine) as db, db.begin():
        user = Account(username="restore-actor", password_hash="unused")
        db.add(user)
        db.flush()
        with pytest.raises(Problem) as rejected:
            import_project(db, user.id, encoded(data))
        assert rejected.value.status == 422
        assert db.scalar(select(func.count()).select_from(Project)) == 0
        assert db.scalar(select(func.count()).select_from(Item)) == 0
        assert (
            db.scalar(select(func.count()).select_from(ProjectSchedule)) == 0
        )


def test_export_prunes_moved_task_from_all_schedule_snapshots(
    client,
    project,
    create_item,
    engine,
):
    _, task, _ = populated(client, project, create_item)
    hidden = client.post(
        "/api/projects", json={"name": "다른 프로젝트"}
    ).json()
    with Session(engine) as db, db.begin():
        moved = db.get(Item, task["id"])
        moved.project_id = hidden["id"]
    data = archive(client, project)
    assert task["id"] not in json_bytes(data["planning"]).decode()
    assert data["planning"]["task_iterations"] == []
    assert data["planning"]["iteration_changes"] == []


def test_forged_valid_hash_proof_never_creates_current_authority(
    client,
    project,
    create_item,
    restore_engine,
):
    populated(client, project, create_item)
    data = archive(client, project)
    with Session(restore_engine) as db, db.begin():
        user = Account(username="restore-actor", password_hash="unused")
        db.add(user)
        db.flush()
        # A recalculated ZIP hash and an existing privileged actor ID are not
        # signatures. They must never create a current server judgment.
        forged = data["planning"]["story_verifications"][0]
        forged["actor_id"] = user.id
        forged["evidence"] = "forged source claim"
        restored = import_project(db, user.id, encoded(data))
        assert (
            db.scalar(select(func.count()).select_from(StoryVerification)) == 0
        )
        assert (
            project_stories(db, restored.id, user.id)["stories"][0][
                "verification_current"
            ]
            is False
        )
        reexported = read_archive(
            base64.b64encode(
                export_project(db, restored, actor_id=user.id)
            ).decode()
        )
        assert (
            reexported["planning"]["story_verifications"][0]["evidence"]
            == "forged source claim"
        )
        assert "planning" not in reexported["external_references"]


def closed_phase_pair(client, project, create_item):
    _, task, first = populated(client, project, create_item)
    base = f"/api/projects/{project['id']}"
    schedules = base + "/schedules"
    response = client.post(
        schedules,
        json={
            "kind": "phase",
            "title": "successor",
            "predecessor_id": first["id"],
        },
    )
    assert response.status_code == 201
    second = response.json()
    assert (
        client.post(
            f"{schedules}/{first['id']}/start", json={"expected_revision": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{schedules}/{first['id']}/close",
            json={
                "expected_revision": 3,
                "carryovers": [
                    {"task_id": task["id"], "target_phase_id": second["id"]}
                ],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{schedules}/{second['id']}/start", json={"expected_revision": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(
            base + "/schedule-snapshots",
            json={"title": "Phase results", "reason": "after closure"},
        ).status_code
        == 201
    )
    return first, second, task


def test_phase_carryover_restores_graph_and_immutable_history(
    client, project, create_item, restore_engine
):
    first, second, task = closed_phase_pair(client, project, create_item)
    data = archive(client, project)
    # A successor can precede its parent in the ZIP.
    data["planning"]["schedules"].sort(
        key=lambda row: row["id"] != second["id"]
    )
    with Session(restore_engine) as db, db.begin():
        user, restored = restore(db, data)
        with pytest.raises(Problem) as rejected:
            transition_phase(
                db, restored.id, first["id"], user.id, 4, "reopen"
            )
        assert rejected.value.status == 409
        phase = db.get(ProjectSchedule, first["id"])
        assert phase.phase_results == [
            {
                "task_id": task["id"],
                "title": task["title"],
                "reason": "",
                "result": "carryover",
                "target_phase_id": second["id"],
            }
        ]
        reexport = read_archive(
            base64.b64encode(
                export_project(db, restored, actor_id=user.id)
            ).decode()
        )
        for name, rows in data["planning"].items():
            returned = reexport["planning"][name]
            if isinstance(rows, list):
                assert sorted(rows, key=json_bytes) == sorted(
                    returned, key=json_bytes
                )
            else:
                assert rows == returned


def test_legacy_schedule_columns_and_snapshots_round_trip(
    client, project, create_item, restore_engine
):
    _, _, first = populated(client, project, create_item)
    data = archive(client, project)
    planning = data["planning"]
    for row in planning["schedules"]:
        for key in (
            "predecessor_id",
            "started_at",
            "closed_at",
            "phase_results",
        ):
            del row[key]
    for change in planning["schedule_changes"]:
        for side in ("before", "after"):
            change[side].pop("phase", None)
    for snapshot in planning["schedule_snapshots"]:
        for row in snapshot["schedules"]:
            row.pop("phase", None)
    with Session(restore_engine) as db, db.begin():
        user, restored = restore(db, data)
        restored_phase = db.get(ProjectSchedule, first["id"])
        assert restored_phase.started_at is None
        reexport = read_archive(
            base64.b64encode(
                export_project(db, restored, actor_id=user.id)
            ).decode()
        )
        assert reexport["planning"] == planning
        assert (
            transition_phase(
                db, restored.id, first["id"], user.id, 2, "start"
            )["phase"]["status"]
            == "in_progress"
        )


def test_phase_archive_prunes_transferred_tasks_from_all_results(
    client, project, create_item, engine
):
    _, _, task = closed_phase_pair(client, project, create_item)
    other = client.post("/api/projects", json={"name": "destination"}).json()
    with Session(engine) as db, db.begin():
        db.get(Item, task["id"]).project_id = other["id"]
    data = archive(client, project)
    assert task["id"] not in json_bytes(data["planning"]).decode()
    assert task["title"] not in json_bytes(data["planning"]).decode()


def test_phase_archive_rejects_invalid_dependencies_and_results(
    client, project, create_item, restore_engine
):
    first, second, _ = closed_phase_pair(client, project, create_item)
    original = archive(client, project)
    cases = (
        "cycle",
        "foreign_target",
        "bad_clock",
        "bad_status",
        "foreign_task",
        "duplicate_task",
        "partial_columns",
    )
    with Session(restore_engine) as db, db.begin():
        user = Account(username="restore-actor", password_hash="unused")
        db.add(user)
        db.flush()
        for case in cases:
            data = copy.deepcopy(original)
            plans = data["planning"]
            source = next(
                row for row in plans["schedules"] if row["id"] == first["id"]
            )
            snapshot = next(
                row
                for row in plans["schedule_snapshots"]
                if row["title"] == "Phase results"
            )
            recorded = next(
                row
                for row in snapshot["schedules"]
                if row["id"] == first["id"]
            )["phase"]
            if case == "cycle":
                source["predecessor_id"] = second["id"]
            elif case == "foreign_target":
                source["phase_results"][0]["target_phase_id"] = str(uuid4())
            elif case == "bad_clock":
                source["closed_at"] = "2000-01-01T00:00:00+00:00"
            elif case == "bad_status":
                recorded["status"] = "in_progress"
            elif case == "foreign_task":
                recorded["results"][0]["task_id"] = str(uuid4())
            elif case == "duplicate_task":
                recorded["results"] *= 2
            else:
                del source["closed_at"]
            with pytest.raises(Problem) as rejected:
                import_project(db, user.id, encoded(data))
            assert rejected.value.status == 422, case
            assert db.scalar(select(func.count()).select_from(Project)) == 0
