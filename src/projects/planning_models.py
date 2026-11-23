"""Persisted planning drafts and immutable application receipts."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from projects.database import Base, new_id, utcnow


class PlanningDraft(Base):
    __tablename__ = "planning_drafts"
    __table_args__ = (
        CheckConstraint("version > 0"),
        CheckConstraint("status IN ('draft','cancelled','applied')"),
        CheckConstraint("mode IN ('initial','incremental')"),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), index=True
    )
    version: Mapped[int] = mapped_column(default=1)
    mode: Mapped[str] = mapped_column(String(20), default="incremental")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    intent: Mapped[str] = mapped_column(Text, default="")
    references: Mapped[list] = mapped_column(JSON, default=list)
    proposals: Mapped[list] = mapped_column(JSON, default=list)
    source_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("skill_runs.id")
    )
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class PlanningApplication(Base):
    __tablename__ = "planning_applications"
    operation_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    draft_id: Mapped[str] = mapped_column(
        ForeignKey("planning_drafts.id"), unique=True
    )
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    request_hash: Mapped[str] = mapped_column(String(64))
    receipt: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
