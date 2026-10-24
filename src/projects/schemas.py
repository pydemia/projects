from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

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


class GitPreviewInput(RequestModel):
    repository_url: str = Field(min_length=1, max_length=500)
    path: str = Field(default="", max_length=200)


class GitImportInput(GitPreviewInput):
    expected_sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    name: str = Field(min_length=1, max_length=200)
    goal: str = Field(default="", max_length=20000)
    profile: Literal["simple", "standard"] = "simple"


class GitZipPreviewInput(RequestModel):
    archive_base64: str = Field(min_length=1, max_length=11000000)
    archive_name: str = Field(default="", max_length=200)
    path: str = Field(default="", max_length=200)


class GitZipImportInput(GitZipPreviewInput):
    expected_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
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


class TaskMove(RequestModel):
    expected_revision: int = Field(ge=1)
    source_state: Literal[
        "todo", "in_progress", "in_review", "done", "cancelled"
    ]
    target_state: Literal[
        "todo", "in_progress", "in_review", "done", "cancelled"
    ]
    before_id: str | None = None
    after_id: str | None = None


class TaskQuickCreate(RequestModel):
    title: str = Field(min_length=1, max_length=300)
    state: Literal["todo", "in_progress", "in_review", "done", "cancelled"]
    cancellation_reason: str = Field(default="", max_length=2000)


class TaskRevision(RequestModel):
    id: str
    expected_revision: int = Field(ge=1)


class TaskBulkChange(RequestModel):
    tasks: list[TaskRevision] = Field(min_length=1, max_length=100)
    state: (
        Literal["todo", "in_progress", "in_review", "done", "cancelled"] | None
    ) = None
    planned_date: str | None = None
    list_name: str | None = Field(default=None, max_length=80)
    cancellation_reason: str | None = Field(default=None, max_length=2000)


class TaskViewSettings(RequestModel):
    mode: Literal["simple", "complex"]
    view: Literal[
        "today", "inbox", "upcoming", "list", "board", "calendar", "insights"
    ]
    query: str = Field(default="", max_length=1000)
    status: Literal[
        "all", "open", "todo", "in_progress", "in_review", "done", "cancelled"
    ] = "all"
    lens: Literal["gtd", "abc"] = "gtd"
    minutes: int = Field(default=0, ge=0, le=100000)
    context: str = Field(default="", max_length=80)
    energy: Literal["any", "low", "medium", "high"] = "any"
    grouping: Literal["state", "list", "none"] = "state"
    sort: Literal["manual", "gtd", "abc", "due_date"] = "manual"
    card_fields: list[
        Literal[
            "list_name",
            "planned_date",
            "due_date",
            "estimated_minutes",
            "abc_priority",
            "context",
            "goal",
            "github_issue_url",
        ]
    ] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def compatible_view(self) -> Self:
        simple = {"today", "inbox", "upcoming"}
        if (self.view in simple) != (self.mode == "simple"):
            raise ValueError("View and mode must match")
        if len(self.card_fields) != len(set(self.card_fields)):
            raise ValueError("Card fields must be unique")
        if self.view == "board" and self.grouping != "state":
            raise ValueError("Board columns group by state")
        return self


class TaskViewInput(RequestModel):
    name: str = Field(min_length=1, max_length=100)
    scope: Literal["personal"] = "personal"
    is_default: bool = False
    settings: TaskViewSettings

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("View name must not be blank")
        return value.strip()


class TaskViewUpdate(TaskViewInput):
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
