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
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
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


class EntraIdentity(Base):
    __tablename__ = "entra_identities"
    tenant_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    account_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), unique=True
    )


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    goal: Mapped[str] = mapped_column(Text, default="")
    profile: Mapped[str] = mapped_column(String(20), default="simple")
    sort_order: Mapped[int | None] = mapped_column(Integer)
    repository_url: Mapped[str | None] = mapped_column(String(500))
    repository_path: Mapped[str] = mapped_column(String(200), default="")
    repository_branch: Mapped[str | None] = mapped_column(String(200))
    repository_sha: Mapped[str | None] = mapped_column(String(40))
    repository_kind: Mapped[str | None] = mapped_column(String(30))
    repository_manifest: Mapped[str | None] = mapped_column(String(250))
    repository_imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    access_revision: Mapped[int] = mapped_column(Integer, default=1)
    archived: Mapped[bool] = mapped_column(default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


class ProjectRole(Base):
    __tablename__ = "project_roles"
    __table_args__ = (
        UniqueConstraint("project_id", "id"),
        UniqueConstraint("project_id", "name"),
        CheckConstraint("preset IN ('owner','editor','viewer','custom')"),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    preset: Mapped[str] = mapped_column(String(10))
    permissions: Mapped[list[str]] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class ProjectMembership(Base):
    __tablename__ = "project_memberships"
    __table_args__ = (
        UniqueConstraint("project_id", "account_id"),
        ForeignKeyConstraint(
            ["project_id", "role_id"],
            ["project_roles.project_id", "project_roles.id"],
        ),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), index=True
    )
    role_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ProjectPreference(Base):
    __tablename__ = "project_preferences"
    account_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), primary_key=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int | None] = mapped_column(Integer)


class ProjectInvitation(Base):
    __tablename__ = "project_invitations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "role_id"],
            ["project_roles.project_id", "project_roles.id"],
        ),
        CheckConstraint("kind IN ('membership','ownership')"),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    role_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20), default="membership")
    token_hash: Mapped[str] = mapped_column(String(64))
    target_account_id: Mapped[str | None] = mapped_column(
        ForeignKey("accounts.id")
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    claimed_by: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class ProjectAccessEvent(Base):
    __tablename__ = "project_access_events"
    __table_args__ = (
        UniqueConstraint("project_id", "actor_id", "operation_id"),
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    action: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(36))
    before: Mapped[dict] = mapped_column(JSON, default=dict)
    after: Mapped[dict] = mapped_column(JSON, default=dict)
    operation_id: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ProjectTaskFieldDefinition(Base):
    __tablename__ = "project_task_field_definitions"
    __table_args__ = (
        CheckConstraint("revision > 0"),
        CheckConstraint(
            "type IN ('text','number','date','select','checkbox')"
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(20))
    options: Mapped[list[str]] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
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


class TaskFieldDefinition(Base):
    __tablename__ = "task_field_definitions"
    __table_args__ = (
        CheckConstraint("revision > 0"),
        CheckConstraint(
            "type IN ('text','number','date','select','checkbox')"
        ),
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id"), primary_key=True
    )
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(20))
    options: Mapped[list[str]] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class TaskView(Base):
    __tablename__ = "task_views"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    scope_type: Mapped[str] = mapped_column(String(20), default="project")
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
    __table_args__ = (UniqueConstraint("source_id", "target_id", "relation"),)
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), index=True
    )
    source_id: Mapped[str] = mapped_column(ForeignKey("items.id"))
    target_id: Mapped[str] = mapped_column(ForeignKey("items.id"))
    relation: Mapped[str] = mapped_column(String(30))
    source_revision: Mapped[int] = mapped_column(Integer)
    target_revision: Mapped[int] = mapped_column(Integer)
    review: Mapped[dict] = mapped_column(JSON, default=dict)


class ProjectArchiveReferences(Base):
    __tablename__ = "project_archive_references"
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), primary_key=True
    )
    data: Mapped[dict] = mapped_column(JSON)


class TaskTransfer(Base):
    __tablename__ = "task_transfers"
    __table_args__ = (UniqueConstraint("owner_id", "operation_id"),)
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    owner_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    operation_id: Mapped[str] = mapped_column(String(100))
    payload_hash: Mapped[str] = mapped_column(String(64))
    changes: Mapped[list] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class AssistantOperation(Base):
    __tablename__ = "assistant_operations"
    __table_args__ = (UniqueConstraint("principal_id", "operation_id"),)
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    principal_id: Mapped[str] = mapped_column(String(200))
    owner_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    operation_id: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str] = mapped_column(String(64))
    request_method: Mapped[str] = mapped_column(String(10))
    request_path: Mapped[str] = mapped_column(Text)
    request_body_sha256: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(30))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    task_id: Mapped[str] = mapped_column(ForeignKey("items.id"))
    receipt: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


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
    requested_by: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    requested_membership_id: Mapped[str | None] = mapped_column(String(36))
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
