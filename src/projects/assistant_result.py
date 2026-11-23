"""Strict, unverified cross-service result references."""

import re
from typing import Literal
from urllib.parse import quote, urlsplit

from pydantic import Field, field_validator, model_validator

from projects.note_reference_data import StrictReferenceData


class AssistantNoteResult(StrictReferenceData):
    workspace_id: str = Field(min_length=1, max_length=128)
    page_id: str = Field(min_length=1, max_length=128)
    url: str = Field(max_length=2000)
    revision: str
    content_hash: str

    @field_validator("revision", "content_hash")
    @classmethod
    def valid_hash(cls, value: str) -> str:
        if not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("Expected lowercase SHA-256")
        return value

    @model_validator(mode="after")
    def consistent_page(self) -> "AssistantNoteResult":
        for value in (self.workspace_id, self.page_id):
            if not re.fullmatch(r"[\w-]{1,128}", value):
                raise ValueError("Invalid Note resource ID")
        expected = (
            "https://note.pydemia.ai/#/w/"
            + quote(self.workspace_id, safe="_-")
            + "/page/"
            + quote(self.page_id, safe="_-")
        )
        if self.url != expected:
            raise ValueError("Note workspace, page and canonical URL differ")
        return self


class AssistantRuntimeResult(StrictReferenceData):
    service: Literal["assistant", "teams", "tasks"]
    run_id: str = Field(
        min_length=1, max_length=200, pattern=r"^[A-Za-z0-9_-]+$"
    )
    url: str | None = Field(default=None, max_length=2000)

    @field_validator("url")
    @classmethod
    def valid_url(cls, value: str | None) -> str | None:
        if value is not None:
            parsed = urlsplit(value)
            if (
                parsed.scheme != "https"
                or parsed.hostname
                not in {
                    "assistant.pydemia.ai",
                    "tasks.pydemia.ai",
                    "teams.pydemia.ai",
                }
                or parsed.username
                or parsed.password
                or parsed.port not in {None, 443}
            ):
                raise ValueError("Expected a canonical runtime URL")
        return value


class AssistantResult(StrictReferenceData):
    note: AssistantNoteResult
    runtime: AssistantRuntimeResult
