"""Business validation independent of HTTP and persistence."""

import re
from collections import defaultdict
from datetime import date
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

type ItemKind = Literal[
    "idea",
    "feature",
    "requirement",
    "artifact",
    "task",
    "test_case",
    "decision",
]
type Relation = Literal[
    "source", "implements", "verifies", "depends_on", "relates_to"
]


class Problem(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


class StrictData(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class IdeaData(StrictData):
    source_url: str = ""
    notes: str = ""


class FeatureData(StrictData):
    current_behavior: str = ""
    evidence_url: str = ""
    target_sha: str = ""


class RequirementData(StrictData):
    category: Literal["functional", "nonfunctional"] = "functional"
    acceptance_criteria: list[str] = Field(
        default_factory=list, max_length=100
    )
    priority: Literal["low", "medium", "high"] = "medium"
    disposition: Literal[
        "new", "extend", "change", "merge", "duplicate", "conflict", "defer"
    ] = "new"
    feature_ids: list[str] = Field(default_factory=list, max_length=100)
    excluded_reason: str = ""


class ArtifactData(StrictData):
    artifact_type: str = "application-design"
    template_ref: str | None = None
    template_version: str | None = None
    example_refs: list[str] = Field(default_factory=list, max_length=30)
    inspection_status: Literal["unverified", "verified", "inaccessible"] = (
        "unverified"
    )
    project_source_refs: list[str] = Field(
        default_factory=list, max_length=100
    )


class TaskData(StrictData):
    workflow: Literal["delivery", "personal"] = "delivery"
    state: Literal["todo", "in_progress", "in_review", "done", "cancelled"] = (
        "todo"
    )
    list_name: str = Field(default="Inbox", max_length=80)
    planned_date: str = ""
    due_date: str = ""
    estimated_minutes: int = Field(default=0, ge=0, le=100000)
    context: str = Field(default="", max_length=80)
    energy: Literal["any", "low", "medium", "high"] = "any"
    next_action: bool = True
    abc_priority: Literal["none", "A", "B", "C"] = "none"
    abc_order: int = Field(default=0, ge=0, le=999)
    goal: str = Field(default="", max_length=300)
    github_issue_url: str = Field(default="", max_length=4000)
    acceptance_criteria: list[str] = Field(
        default_factory=list, max_length=100
    )
    result_url: str = ""
    target_sha: str = ""
    requires_test: bool = True
    cancellation_reason: str = ""

    @field_validator("planned_date", "due_date")
    @classmethod
    def valid_iso_date(cls, value: str) -> str:
        if value:
            if date.fromisoformat(value).isoformat() != value:
                raise ValueError("Use an ISO date")
        return value

    @field_validator("github_issue_url")
    @classmethod
    def valid_github_issue(cls, value: str) -> str:
        if value and not re.fullmatch(
            r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[1-9][0-9]*",
            value,
        ):
            raise ValueError("Use a canonical GitHub issue URL")
        return value


class TestCaseData(StrictData):
    steps: list[str] = Field(default_factory=list, max_length=100)
    expected: str = ""


class DecisionData(StrictData):
    reason: str = ""
    alternatives: list[str] = Field(default_factory=list, max_length=100)


DATA_MODELS: dict[str, type[StrictData]] = {
    "idea": IdeaData,
    "feature": FeatureData,
    "requirement": RequirementData,
    "artifact": ArtifactData,
    "task": TaskData,
    "test_case": TestCaseData,
    "decision": DecisionData,
}


def validate_item_data(kind: str, data: dict) -> dict:
    model = DATA_MODELS.get(kind)
    if model is None:
        raise Problem(422, "알 수 없는 업무 종류입니다.")
    try:
        validated = model.model_validate(data).model_dump()
    except ValidationError as exc:
        raise Problem(422, "종류별 데이터 형식이 올바르지 않습니다.") from exc
    if kind == "task" and validated["state"] == "cancelled":
        if not validated["cancellation_reason"].strip():
            raise Problem(422, "작업을 취소한 사유를 기록해 주세요.")
    return validated


def check_dependency_cycle(
    source: str,
    target: str,
    edges: list[tuple[str, str]],
) -> None:
    graph: dict[str, list[str]] = defaultdict(list)
    for left, right in edges:
        graph[left].append(right)
    stack = [target]
    visited: set[str] = set()
    while stack:
        node = stack.pop()
        if node == source:
            raise Problem(409, "작업 의존 관계가 순환합니다.")
        if node not in visited:
            visited.add(node)
            stack.extend(graph[node])
