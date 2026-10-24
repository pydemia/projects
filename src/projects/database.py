"""PostgreSQL persistence. Writes use row locks and immutable revisions."""

from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    entra_subject: Mapped[str | None] = mapped_column(String(255), unique=True)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        Index(
            "uq_projects_owner_repository_scope",
            "owner_id",
            "repository_url",
            "repository_path",
            unique=True,
            postgresql_where=text("repository_url IS NOT NULL"),
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    goal: Mapped[str] = mapped_column(Text, default="")
    profile: Mapped[str] = mapped_column(String(20), default="simple")
    repository_url: Mapped[str | None] = mapped_column(String(500))
    repository_path: Mapped[str] = mapped_column(String(200), default="")
    repository_branch: Mapped[str | None] = mapped_column(String(200))
    repository_sha: Mapped[str | None] = mapped_column(String(40))
    repository_kind: Mapped[str | None] = mapped_column(String(30))
    repository_manifest: Mapped[str | None] = mapped_column(String(250))
    repository_imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class RepositoryActivity(Base):
    __tablename__ = "repository_activities"
    __table_args__ = (UniqueConstraint("project_id", "kind", "external_id"),)
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    external_id: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str] = mapped_column(String(500))
    state: Mapped[str] = mapped_column(String(20))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("project_id", "id"),
        CheckConstraint("revision > 0"),
        CheckConstraint(
            "kind IN ('idea','feature','requirement','artifact','task',"
            "'test_case','decision')",
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class Revision(Base):
    __tablename__ = "revisions"
    item_id: Mapped[str] = mapped_column(
        ForeignKey("items.id"),
        primary_key=True,
    )
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class TaskPosition(Base):
    __tablename__ = "task_positions"
    item_id: Mapped[str] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class TaskView(Base):
    __tablename__ = "task_views"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    scope: Mapped[str] = mapped_column(String(20), default="personal")
    settings: Mapped[dict] = mapped_column(JSON)
    is_default: Mapped[bool] = mapped_column(default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class Link(Base):
    __tablename__ = "links"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "relation"),
        ForeignKeyConstraint(
            ["project_id", "source_id"],
            ["items.project_id", "items.id"],
        ),
        ForeignKeyConstraint(
            ["project_id", "target_id"],
            ["items.project_id", "items.id"],
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    source_id: Mapped[str] = mapped_column(String(36))
    target_id: Mapped[str] = mapped_column(String(36))
    relation: Mapped[str] = mapped_column(String(30))
    source_revision: Mapped[int] = mapped_column(Integer)
    target_revision: Mapped[int] = mapped_column(Integer)
    review: Mapped[dict] = mapped_column(JSON, default=dict)


class TestRun(Base):
    __tablename__ = "test_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["case_id", "case_revision"],
            ["revisions.item_id", "revisions.revision"],
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    case_id: Mapped[str] = mapped_column(String(36))
    case_revision: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(20))
    actual: Mapped[str] = mapped_column(Text)
    environment: Mapped[str] = mapped_column(Text)
    target_sha: Mapped[str] = mapped_column(String(128))
    evidence_url: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class Baseline(Base):
    __tablename__ = "baselines"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    revisions: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class SkillRun(Base):
    __tablename__ = "skill_runs"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    operation: Mapped[str] = mapped_column(String(40))
    instruction: Mapped[str] = mapped_column(Text)
    target_id: Mapped[str | None] = mapped_column(ForeignKey("items.id"))
    target_revision: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        String(30), default="queued", index=True
    )
    skills_lock: Mapped[list] = mapped_column(JSON, default=list)
    skill_ids: Mapped[list] = mapped_column(JSON, default=list)
    reference_manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    source_snapshots: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text)
    applied_ids: Mapped[list] = mapped_column(JSON, default=list)
    events: Mapped[list] = mapped_column(JSON, default=list)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


def make_engine(url: str) -> Engine:
    if not url.startswith("postgresql+psycopg://"):
        raise ValueError(
            "PROJECTS_DATABASE_URL은 PostgreSQL psycopg URL이어야 합니다."
        )
    return create_engine(url, pool_pre_ping=True)


def session_scope(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
