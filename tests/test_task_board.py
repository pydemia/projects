"""Board moves must persist order and reuse ordinary task completion gates."""


def create_task(client, project, title, *, workflow="personal"):
    response = client.post(
        f"/api/projects/{project['id']}/items",
        json={"kind": "task", "title": title, "data": {"workflow": workflow}},
    )
    assert response.status_code == 201, response.text
    return response.json()


def move(client, task, target_state, *, before_id=None, after_id=None):
    return client.post(
        f"/api/items/{task['id']}/move",
        json={
            "expected_revision": task["revision"],
            "source_state": task["data"]["state"],
            "target_state": target_state,
            "before_id": before_id,
            "after_id": after_id,
        },
    )


def test_board_move_persists_state_and_manual_order(client, project):
    first = create_task(client, project, "first")
    second = create_task(client, project, "second")
    moved = move(client, second, "in_progress")
    assert moved.status_code == 200, moved.text
    second = moved.json()
    assert second["data"]["state"] == "in_progress"
    assert second["revision"] == 2
    moved = move(client, first, "in_progress", after_id=second["id"])
    assert moved.status_code == 200, moved.text
    first = moved.json()
    moved = move(client, first, "in_progress", before_id=second["id"])
    assert moved.status_code == 200, moved.text
    tasks = [
        item
        for item in client.get(f"/api/projects/{project['id']}/items").json()
        if item["kind"] == "task" and item["data"]["state"] == "in_progress"
    ]
    assert [
        item["id"]
        for item in sorted(tasks, key=lambda item: item["board_order"])
    ] == [first["id"], second["id"]]
    assert [
        item["revision"]
        for item in sorted(tasks, key=lambda item: item["board_order"])
    ] == [3, 2]


def test_board_move_rejects_stale_revision_and_wrong_neighbor(client, project):
    first = create_task(client, project, "first")
    second = create_task(client, project, "second")
    assert move(client, first, "in_progress").status_code == 200
    assert move(client, first, "done").status_code == 409
    assert (
        move(
            client, second, "in_progress", before_id="not-an-item"
        ).status_code
        == 422
    )
    tasks = client.get(f"/api/projects/{project['id']}/items").json()
    current = next(item for item in tasks if item["id"] == second["id"])
    assert current["data"]["state"] == "todo"
    assert current["revision"] == 1


def test_board_move_anchors_on_visible_neighbor_without_discarding_hidden_tasks(
    client, project
):
    first = create_task(client, project, "visible first")
    hidden = create_task(client, project, "filtered out")
    last = create_task(client, project, "visible last")
    moved = create_task(client, project, "dragged")
    first = move(client, first, "in_progress").json()
    hidden = move(client, hidden, "in_progress", after_id=first["id"]).json()
    last = move(client, last, "in_progress", after_id=hidden["id"]).json()

    result = move(client, moved, "in_progress", before_id=last["id"])
    assert result.status_code == 200, result.text
    rows = client.get(f"/api/projects/{project['id']}/items").json()
    ordered = sorted(
        (row for row in rows if row["data"]["state"] == "in_progress"),
        key=lambda row: row["board_order"],
    )
    assert [row["id"] for row in ordered] == [
        first["id"],
        hidden["id"],
        moved["id"],
        last["id"],
    ]


def test_board_move_returns_revision_checked_undo_anchor(client, project):
    first = create_task(client, project, "first")
    second = create_task(client, project, "second")
    moved = move(client, second, "in_progress")
    assert moved.status_code == 200, moved.text
    payload = moved.json()
    assert payload["undo_move"] == {
        "source_state": "in_progress",
        "target_state": "todo",
        "before_id": None,
        "after_id": first["id"],
    }
    undo = client.post(
        f"/api/items/{second['id']}/move",
        json={
            "expected_revision": payload["revision"],
            **payload["undo_move"],
        },
    )
    assert undo.status_code == 200, undo.text
    assert undo.json()["data"]["state"] == "todo"
    assert undo.json()["revision"] == 3
    assert (
        client.post(
            f"/api/items/{second['id']}/move",
            json={
                "expected_revision": payload["revision"],
                **payload["undo_move"],
            },
        ).status_code
        == 409
    )


def test_board_move_cannot_bypass_delivery_completion(client, project):
    delivery = create_task(client, project, "delivery", workflow="delivery")
    rejected = move(client, delivery, "done")
    assert rejected.status_code == 409
    current = client.get(f"/api/items/{delivery['id']}").json()
    assert current["data"]["state"] == "todo"
    assert current["revision"] == 1
    personal = create_task(client, project, "personal")
    accepted = move(client, personal, "done")
    assert accepted.status_code == 200, accepted.text
