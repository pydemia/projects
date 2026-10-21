"""DB나 HTTP framework에 의존하지 않는 실행 입력·출력."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class RuntimeFailure(Exception):
    """호출자가 구분할 수 있는 runtime 실패 코드와 설명."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


Identifier = Annotated[str, Field(min_length=1, max_length=256)]
Title = Annotated[str, Field(min_length=1, max_length=300)]
Text = Annotated[str, Field(max_length=500_000)]
TextList = Annotated[list[Text], Field(max_length=100)]
IdentifierList = Annotated[list[Identifier], Field(max_length=100)]
Operation = Literal[
    "write_document",
    "revise_document",
    "review_document",
    "analyze_idea",
    "plan",
]


class RunRequest(RuntimeModel):
    operation: Operation
    instruction: Annotated[str, Field(min_length=1, max_length=100_000)]
    target: Text | None = None
    sources: list[dict[str, JsonValue]] = Field(
        default_factory=list,
        max_length=1000,
    )
    reference_manifest: dict[str, JsonValue] = Field(default_factory=dict)


class DesignChange(RuntimeModel):
    artifact_id: Identifier
    instruction: Text


class TaskCandidate(RuntimeModel):
    title: Title
    body: Text
    acceptance_criteria: TextList


class TestCandidate(RuntimeModel):
    title: Title
    steps: TextList
    expected: Text


class Candidate(RuntimeModel):
    title: Title
    body: Text
    acceptance_criteria: TextList
    feature_ids: IdentifierList
    disposition: Literal[
        "new",
        "extend",
        "change",
        "merge",
        "duplicate",
        "conflict",
        "defer",
    ]
    rationale: Text
    design_changes: list[DesignChange] = Field(max_length=100)
    tasks: list[TaskCandidate] = Field(max_length=100)
    tests: list[TestCandidate] = Field(max_length=100)


class RunResult(RuntimeModel):
    document: Text | None
    review: Text
    requirements: list[Candidate] = Field(max_length=100)
    assumptions: TextList
    questions: TextList
    source_ids: IdentifierList
