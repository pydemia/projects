"""Unverified, canonical external Note references; never fetch document content."""

import re
import unicodedata
from typing import Literal
from urllib.parse import quote, unquote
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class StrictReferenceData(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def canonical_note_page_id(url: str) -> str:
    prefix = "https://note.pydemia.ai/#/page/"
    if not url.startswith(prefix):
        raise ValueError("Note의 정식 문서 URL을 입력해 주세요.")
    encoded = url[len(prefix) :]
    page_id = unquote(encoded, errors="strict")
    if not 1 <= len(page_id) <= 128 or not all(
        char in "_-" or unicodedata.category(char)[0] in "LN"
        for char in page_id
    ):
        raise ValueError("Note 문서 ID가 올바르지 않습니다.")
    if url != prefix + quote(page_id, safe="_-"):
        raise ValueError("Note의 정식 문서 URL을 입력해 주세요.")
    return page_id


class AddNoteReference(StrictReferenceData):
    expected_revision: int = Field(ge=1)
    url: str = Field(max_length=2000)
    revision: str | None = None
    content_hash: str | None = None

    @field_validator("url")
    @classmethod
    def valid_url(cls, value: str) -> str:
        canonical_note_page_id(value)
        return value

    @field_validator("revision", "content_hash")
    @classmethod
    def valid_hash(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("64자리 소문자 SHA-256을 입력해 주세요.")
        return value


class RemoveNoteReference(StrictReferenceData):
    expected_revision: int = Field(ge=1)


class NoteReference(StrictReferenceData):
    id: str
    provider: Literal["note"] = "note"
    page_id: str
    url: str
    revision: str | None = None
    content_hash: str | None = None
    verification: Literal["unverified"] = "unverified"

    @model_validator(mode="after")
    def valid_reference(self) -> "NoteReference":
        if str(UUID(self.id)) != self.id:
            raise ValueError("참조 ID가 올바르지 않습니다.")
        if canonical_note_page_id(self.url) != self.page_id:
            raise ValueError("Note 문서 ID와 URL이 다릅니다.")
        AddNoteReference(
            expected_revision=1,
            url=self.url,
            revision=self.revision,
            content_hash=self.content_hash,
        )
        return self
