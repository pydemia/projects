"""Optional project plans; independent from item revision baselines."""

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from projects.database import Base, new_id, utcnow


class ProjectSchedule(Base):
    __tablename__ = "project_schedules"
    __table_args__ = (
        CheckConstraint("kind IN ('epic','phase','milestone','iteration')"),
        CheckConstraint("revision > 0"),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date"
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    confirmed_date: Mapped[date | None] = mapped_column(Date)
    evidence: Mapped[str] = mapped_column(Text, default="")
    member_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    predecessor_id: Mapped[str | None] = mapped_column(
        ForeignKey("project_schedules.id"), index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phase_results: Mapped[list[dict] | None] = mapped_column(JSON)
    deleted: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ScheduleChange(Base):
    __tablename__ = "schedule_changes"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    schedule_id: Mapped[str] = mapped_column(
        ForeignKey("project_schedules.id"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    reason: Mapped[str] = mapped_column(Text, default="")
    before: Mapped[dict] = mapped_column(JSON)
    after: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class TaskIteration(Base):
    __tablename__ = "task_iterations"
    task_id: Mapped[str] = mapped_column(
        ForeignKey("items.id"), primary_key=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    iteration_id: Mapped[str | None] = mapped_column(
        ForeignKey("project_schedules.id")
    )
    revision: Mapped[int] = mapped_column(Integer, default=1)


class TaskIterationChange(Base):
    __tablename__ = "task_iteration_changes"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    task_id: Mapped[str] = mapped_column(ForeignKey("items.id"), index=True)
    previous_iteration_id: Mapped[str | None] = mapped_column(
        ForeignKey("project_schedules.id")
    )
    iteration_id: Mapped[str | None] = mapped_column(
        ForeignKey("project_schedules.id")
    )
    revision: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ScheduleSnapshot(Base):
    __tablename__ = "schedule_snapshots"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    schedules: Mapped[list[dict]] = mapped_column(JSON)
    items: Mapped[list[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
