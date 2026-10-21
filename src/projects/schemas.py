from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from projects.domain import ItemKind, Relation


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(RequestModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[\w.-]+$")
    password: str = Field(min_length=12, max_length=256)


class ProjectInput(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    goal: str = Field(default="", max_length=20000)
    profile: Literal["simple", "standard"] = "simple"


class ItemInput(RequestModel):
    kind: ItemKind
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(default="", max_length=500000)
    data: dict = Field(default_factory=dict)


class ItemUpdate(RequestModel):
    expected_revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(max_length=500000)
    data: dict


class ExpectedRevision(RequestModel):
    expected_revision: int = Field(ge=1)


class RestoreInput(ExpectedRevision):
    revision: int = Field(ge=1)


class LinkInput(RequestModel):
    source_id: str
    target_id: str
    relation: Relation


class TestRunInput(RequestModel):
    outcome: Literal["passed", "failed", "aborted"]
    actual: str = Field(min_length=1, max_length=100000)
    environment: str = Field(min_length=1, max_length=1000)
    target_sha: str = Field(min_length=1, max_length=128)
    evidence_url: str = Field(default="", max_length=4000)


class BaselineInput(RequestModel):
    name: str = Field(min_length=1, max_length=200)


class ReviewInput(RequestModel):
    expected_source_revision: int = Field(ge=1)
    expected_target_revision: int = Field(ge=1)
    impact: Literal["none", "action_required"]
    reason: str = Field(min_length=1, max_length=10000)


class ResolveInput(RequestModel):
    skill_ids: list[str] = Field(min_length=1, max_length=12)


class RunInput(RequestModel):
    operation: Literal[
        "write_document",
        "revise_document",
        "review_document",
        "analyze_idea",
        "plan",
    ]
    instruction: str = Field(min_length=1, max_length=20000)
    target_id: str | None = None
    skill_ids: list[str] = Field(min_length=1, max_length=12)
    source_ids: list[str] = Field(default_factory=list, max_length=100)
    reference_manifest: dict = Field(default_factory=dict)


class ApplyInput(RequestModel):
    selected_indices: list[int] = Field(default_factory=list, max_length=100)
    apply_document: bool = False


class ReconnectInput(RequestModel):
    base_revision: int = Field(ge=1)
    base_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    body: str = Field(max_length=500000)
    provenance: dict | None = None
    preview: bool = True


class ImportInput(RequestModel):
    archive_base64: str = Field(max_length=11000000)
