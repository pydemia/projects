"""Note links stay canonical, unverified and attached to revisioned tasks."""

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import Item, Project, Revision
from projects.domain import Problem
from projects.note_reference_data import (
    AddNoteReference,
    NoteReference,
    RemoveNoteReference,
)
from projects.note_references import (
    add_note_ref,
    list_note_refs,
    remove_note_ref,
)


@pytest.mark.parametrize(
    "url",
    [
        "http://note.pydemia.ai/#/page/a",
        "https://note.pydemia.ai.evil/#/page/a",
        "https://note.pydemia.ai@evil/#/page/a",
        "https://note.pydemia.ai/api/pages/a",
        "https://note.pydemia.ai/#/page/../x",
        "https://note.pydemia.ai/#/page/a?at=x",
        "https://note.pydemia.ai/#/page/%61",
        "https://note.pydemia.ai/#/page/a%2Fb",
    ],
)
def test_reject_unsafe_or_noncanonical_url(url):
    with pytest.raises(ValidationError):
        AddNoteReference(expected_revision=1, url=url)


def test_unverified_metadata_cannot_claim_verified():
    with pytest.raises(ValidationError):
        NoteReference(
            id="e2f8d9b9-1f86-4995-9a50-bba41a3da936",
            page_id="page-a",
            url="https://note.pydemia.ai/#/page/page-a",
            verification="verified",
        )
    with pytest.raises(ValidationError):
        AddNoteReference(
            expected_revision=1,
            url="https://note.pydemia.ai/#/page/a",
            revision="not-a-revision",
        )


def test_note_reference_preserves_data_history_and_ownership(
    engine, create_item
):
    task = create_item(
        kind="task", data={"workflow": "personal", "goal": "keep me"}
    )
    with Session(engine) as db:
        row = db.get(Item, task["id"])
        owner = db.get(Project, row.project_id).owner_id
        payload = AddNoteReference(
            expected_revision=row.revision,
            url="https://note.pydemia.ai/#/page/page-a",
            revision="a" * 64,
            content_hash="b" * 64,
        )
        saved = add_note_ref(db, owner, row.id, payload)
        db.commit()
        assert saved.data["goal"] == "keep me"
        refs = list_note_refs(db, owner, row.id)
        assert refs[0]["page_id"] == "page-a"
        assert refs[0]["verification"] == "unverified"
        assert refs[0]["revision"] == "a" * 64
        history = db.scalar(
            select(Revision).where(
                Revision.item_id == row.id, Revision.revision == saved.revision
            )
        )
        assert history.data["note_references"] == refs
        with pytest.raises(Problem) as denied:
            list_note_refs(db, "other-owner", row.id)
        assert denied.value.status == 404
        with pytest.raises(Problem) as stale:
            remove_note_ref(
                db,
                owner,
                row.id,
                refs[0]["id"],
                RemoveNoteReference(expected_revision=1),
            )
        assert stale.value.status == 409
        removed = remove_note_ref(
            db,
            owner,
            row.id,
            refs[0]["id"],
            RemoveNoteReference(expected_revision=saved.revision),
        )
        db.commit()
        assert removed.data["note_references"] == []
        assert history.data["note_references"] == refs
