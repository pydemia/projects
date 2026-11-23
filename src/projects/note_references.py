"""Owned task relationships to Note; metadata stays explicitly unverified."""

from typing import Literal, Self
from uuid import NAMESPACE_URL, uuid4, uuid5

from pydantic import Field, ValidationError, model_validator
from sqlalchemy.orm import Session

from projects.assistant_result import AssistantNoteResult
from projects.database import Item
from projects.domain import Problem
from projects.note_reference_data import (
    AddNoteReference,
    NoteReference,
    RemoveNoteReference,
    StrictReferenceData,
    canonical_note_page_id,
)
from projects.records import item_for_user, require_revision, revise_item


class _AssistantNoteReferenceView(StrictReferenceData):
    """Read-only DTO; the manual-reference write grammar remains unchanged."""

    workspace_id: str = Field(exclude=True)
    id: str
    provider: Literal["note"] = "note"
    page_id: str
    url: str
    revision: str
    content_hash: str
    verification: Literal["unverified"] = "unverified"

    @model_validator(mode="after")
    def scoped_reference(self) -> Self:
        note = AssistantNoteResult(
            workspace_id=self.workspace_id,
            page_id=self.page_id,
            url=self.url,
            revision=self.revision,
            content_hash=self.content_hash,
        )
        if self.id != str(uuid5(NAMESPACE_URL, note.url)):
            raise ValueError("Expected stable scoped Note reference identity")
        return self


def _task(
    db: Session, user_id: str, item_id: str, *, lock: bool = False
) -> Item:
    item = item_for_user(
        db,
        item_id,
        user_id,
        lock=lock,
        permission="task.update" if lock else "project.read",
    )
    if item.kind != "task":
        raise Problem(422, "Note 참조는 작업에 연결합니다.")
    return item


def list_note_refs(db: Session, user_id: str, item_id: str) -> list[dict]:
    item = _task(db, user_id, item_id)
    references = [
        NoteReference.model_validate(ref).model_dump()
        for ref in item.data.get("note_references", [])
    ]
    result = item.data.get("assistant_result")
    if not isinstance(result, dict):
        return references
    try:
        note = AssistantNoteResult.model_validate(result.get("note"))
        projected = _AssistantNoteReferenceView(
            id=str(uuid5(NAMESPACE_URL, note.url)), **note.model_dump()
        ).model_dump()
    except ValidationError:
        # Invalid stored metadata must not create a clickable external target.
        return references
    # result_url repeats this same scoped resource; project it only once.
    # Legacy manual references have no workspace identity, so a matching page
    # alone cannot establish equivalence or replace their revision metadata.
    references.append(projected)
    return references


def add_note_ref(
    db: Session, user_id: str, item_id: str, payload: AddNoteReference
) -> Item:
    item = _task(db, user_id, item_id, lock=True)
    require_revision(item, payload.expected_revision)
    references = list(item.data.get("note_references", []))
    if len(references) >= 100:
        raise Problem(422, "Note 참조는 작업마다 100개까지 연결합니다.")
    if any(
        ref["url"] == payload.url
        and ref.get("revision") == payload.revision
        and ref.get("content_hash") == payload.content_hash
        for ref in references
    ):
        raise Problem(409, "같은 Note 참조가 이미 연결되어 있습니다.")
    reference = NoteReference(
        id=str(uuid4()),
        page_id=canonical_note_page_id(payload.url),
        url=payload.url,
        revision=payload.revision,
        content_hash=payload.content_hash,
    )
    references.append(reference.model_dump())
    return revise_item(
        db,
        item,
        payload.expected_revision,
        item.title,
        item.body,
        {**item.data, "note_references": references},
        status=item.status,
    )


def remove_note_ref(
    db: Session,
    user_id: str,
    item_id: str,
    reference_id: str,
    payload: RemoveNoteReference,
) -> Item:
    item = _task(db, user_id, item_id, lock=True)
    require_revision(item, payload.expected_revision)
    references = list(item.data.get("note_references", []))
    remaining = [ref for ref in references if ref["id"] != reference_id]
    if len(remaining) == len(references):
        raise Problem(404, "Note 참조를 찾을 수 없습니다.")
    return revise_item(
        db,
        item,
        payload.expected_revision,
        item.title,
        item.body,
        {**item.data, "note_references": remaining},
        status=item.status,
    )
