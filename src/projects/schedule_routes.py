"""HTTP boundary for optional schedules and date-only baseline comparisons."""

import re
from collections.abc import Callable
from datetime import date
from typing import Annotated, Literal, Self

from fastapi import Depends, FastAPI
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    model_validator,
)
from sqlalchemy.orm import Session

from projects import schedules
from projects.database import Account


def _iso_date(value: object) -> object:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}", value
    ):
        raise ValueError("YYYY-MM-DD 날짜만 입력해 주세요.")
    return date.fromisoformat(value)


CalendarDate = Annotated[date, BeforeValidator(_iso_date)]


class ScheduleFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=300)
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    due_date: CalendarDate | None = None
    confirmed_date: CalendarDate | None = None
    predecessor_id: str | None = None
    evidence: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def valid_dates(self) -> Self:
        if (
            self.start_date
            and self.end_date
            and self.end_date < self.start_date
        ):
            raise ValueError("종료 예정일은 시작 예정일 이후여야 합니다.")
        if self.confirmed_date and not self.evidence:
            raise ValueError("실제 확인일에는 확인 근거를 입력해 주세요.")
        return self


class ScheduleCreate(ScheduleFields):
    kind: Literal["epic", "phase", "milestone", "iteration"]


class ScheduleUpdate(ScheduleFields):
    expected_revision: int = Field(ge=1)
    reason: str = Field(default="", max_length=10000)


class ScheduleExpected(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    reason: str = Field(default="", max_length=10000)


class ScheduleMembers(ScheduleExpected):
    item_ids: list[str] = Field(max_length=schedules.MAX_SCHEDULE_MEMBERS)


class Carryover(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str
    target_phase_id: str


class PhaseClose(ScheduleExpected):
    carryovers: list[Carryover] = Field(
        default_factory=list, max_length=schedules.MAX_SCHEDULE_MEMBERS
    )


class TaskPhases(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phase_ids: list[str] = Field(max_length=2000)
    expected_revisions: dict[str, int]


class IterationAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_schedule_revision: int = Field(ge=0)
    iteration_id: str | None
    reason: str = Field(default="", max_length=10000)


class SnapshotCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1, max_length=10000)


def install_schedule_routes(
    app: FastAPI,
    get_db: Callable,
    signed_in: Callable,
) -> None:
    base = "/api/projects/{project_id}"
    database_dependency = Depends(get_db, scope="function")
    user_dependency = Depends(signed_in)

    @app.get(base + "/schedules")
    def get_schedules(
        project_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> list[dict]:
        return schedules.list_schedules(db, project_id, user.id)

    @app.post(base + "/schedules", status_code=201)
    def post_schedule(
        project_id: str,
        body: ScheduleCreate,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.create_schedule(
            db, project_id, user.id, body.model_dump()
        )

    @app.patch(base + "/schedules/{schedule_id}")
    def patch_schedule(
        project_id: str,
        schedule_id: str,
        body: ScheduleUpdate,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.update_schedule(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            body.model_dump(
                exclude={"expected_revision", "reason"}, exclude_unset=True
            ),
            body.reason,
        )

    @app.delete(base + "/schedules/{schedule_id}")
    def remove_schedule(
        project_id: str,
        schedule_id: str,
        body: ScheduleExpected,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.delete_schedule(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            body.reason,
        )

    @app.put(base + "/schedules/{schedule_id}/members")
    def put_members(
        project_id: str,
        schedule_id: str,
        body: ScheduleMembers,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.set_members(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            body.item_ids,
            body.reason,
        )

    @app.get(base + "/schedules/{schedule_id}/history")
    def get_history(
        project_id: str,
        schedule_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> list[dict]:
        return schedules.schedule_history(db, project_id, schedule_id, user.id)

    @app.post(base + "/schedules/{schedule_id}/start")
    def start_phase(
        project_id: str,
        schedule_id: str,
        body: ScheduleExpected,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.transition_phase(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            "start",
        )

    @app.post(base + "/schedules/{schedule_id}/reopen")
    def reopen_phase(
        project_id: str,
        schedule_id: str,
        body: ScheduleExpected,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.transition_phase(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            "reopen",
        )

    @app.post(base + "/schedules/{schedule_id}/close")
    def close_phase(
        project_id: str,
        schedule_id: str,
        body: PhaseClose,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.transition_phase(
            db,
            project_id,
            schedule_id,
            user.id,
            body.expected_revision,
            "close",
            [
                (entry.task_id, entry.target_phase_id)
                for entry in body.carryovers
            ],
        )

    @app.put(base + "/task-phases/{task_id}")
    def put_task_phases(
        project_id: str,
        task_id: str,
        body: TaskPhases,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.set_task_phases(
            db,
            project_id,
            task_id,
            user.id,
            body.phase_ids,
            body.expected_revisions,
        )

    @app.get(base + "/task-iterations/{task_id}")
    def get_assignment(
        project_id: str,
        task_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.task_iteration(db, project_id, task_id, user.id)

    @app.put(base + "/task-iterations/{task_id}")
    def put_assignment(
        project_id: str,
        task_id: str,
        body: IterationAssignment,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.assign_iteration(
            db,
            project_id,
            task_id,
            user.id,
            body.iteration_id,
            body.expected_schedule_revision,
            body.reason,
        )

    @app.get(base + "/task-iterations/{task_id}/history")
    def get_assignment_history(
        project_id: str,
        task_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> list[dict]:
        return schedules.iteration_history(db, project_id, task_id, user.id)

    @app.get(base + "/schedule-snapshots")
    def get_snapshots(
        project_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> list[dict]:
        return schedules.list_snapshots(db, project_id, user.id)

    @app.post(base + "/schedule-snapshots", status_code=201)
    def post_snapshot(
        project_id: str,
        body: SnapshotCreate,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.create_snapshot(
            db, project_id, user.id, body.title, body.reason
        )

    @app.get(base + "/schedule-snapshots/{snapshot_id}/diff")
    def get_snapshot_diff(
        project_id: str,
        snapshot_id: str,
        db: Session = database_dependency,
        user: Account = user_dependency,
    ) -> dict:
        return schedules.snapshot_diff(db, project_id, snapshot_id, user.id)
