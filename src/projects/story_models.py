"""Append-only Story acceptance judgments against an immutable revision."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from projects.database import Base, new_id, utcnow


class StoryVerification(Base):
    __tablename__ = "story_verifications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["item_id", "item_revision"],
            ["revisions.item_id", "revisions.revision"],
        ),
        UniqueConstraint("item_id", "item_revision"),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    item_id: Mapped[str] = mapped_column(String(36), index=True)
    item_revision: Mapped[int] = mapped_column()
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    evidence: Mapped[str] = mapped_column(Text)
    criterion_results: Mapped[list[dict]] = mapped_column(JSON)
    criteria_hash: Mapped[str] = mapped_column(String(64))
