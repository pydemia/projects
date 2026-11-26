"""Fail-closed signed service API; browser identities never select owners."""

import base64
import copy
import hashlib
import hmac
import json
import os
import re
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.assistant_result import (
    AssistantNoteResult,
    AssistantRuntimeResult,
)
from projects.database import Account, AssistantOperation, Item, Project
from projects.domain import Problem, TaskState
from projects.project_access import accessible_project_ids, lock_project_access
from projects.records import (
    create_item,
    item_for_user,
    project_for_user,
    revise_item,
    serialize,
)
from projects.task_queries import TaskQuery, query_tasks

PREFIX = "/api/integrations/assistant/v1"
router = APIRouter(prefix=PREFIX)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Principal(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    revision: int = Field(ge=1)
    enabled: bool
    kid: str = Field(min_length=1, max_length=200)
    secretFile: str
    accountId: str = Field(min_length=1, max_length=36)
    projectIds: list[str] = Field(max_length=1000)
    scopes: list[
        Literal[
            "projects:read",
            "tasks:read",
            "tasks:create",
            "tasks:update",
            "results:attach",
        ]
    ]


class IntegrationConfig(StrictModel):
    version: Literal[1]
    principals: list[Principal]


def decode_canonical(value: str) -> bytes:
    if not value or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("Invalid encoding")
    decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if base64.urlsafe_b64encode(decoded).decode().rstrip("=") != value:
        raise ValueError("Noncanonical encoding")
    return decoded


def canonical_uuid(value: str) -> str:
    if str(UUID(value)) != value:
        raise ValueError("Expected canonical UUID")
    return value


async def authenticate(request: Request) -> Principal:
    config_file = os.environ.get("PROJECTS_ASSISTANT_INTEGRATION_FILE")
    if not config_file:
        raise Problem(503, "Integration unconfigured")
    try:
        config_path = Path(config_file)
        config = IntegrationConfig.model_validate_json(
            config_path.read_bytes()
        )
        if len({p.kid for p in config.principals}) != len(
            config.principals
        ) or len({p.id for p in config.principals}) != len(config.principals):
            raise ValueError("Duplicate principal or key")
    except (OSError, ValueError):
        raise Problem(503, "Integration configuration unavailable") from None
    try:
        authorization = request.headers.getlist("authorization")
        if len(authorization) != 1 or not authorization[0].startswith(
            "Bearer "
        ):
            raise ValueError("Bearer required")
        token = authorization[0][7:]
        if len(token) > 8192:
            raise ValueError("Oversized token")
        encoded, signed = token.split(".")
        values = json.loads(decode_canonical(encoded))
        if not isinstance(values, list) or len(values) != 11:
            raise ValueError("Invalid claims")
        (
            version,
            audience,
            kid,
            issued,
            expires,
            nonce,
            method,
            path,
            body_hash,
            binding,
            revision,
        ) = values
        if type(version) is not int or version != 1 or audience != "projects":
            raise ValueError("Invalid audience")
        if (
            not all(
                isinstance(v, str)
                for v in (kid, nonce, method, path, body_hash, binding)
            )
            or type(revision) is not int
        ):
            raise ValueError("Invalid claims types")
        if type(issued) is not int or type(expires) is not int:
            raise ValueError("Invalid timestamps")
        now = int(time.time())
        if (
            not 0 < expires - issued <= 60
            or issued > now + 30
            or expires < now - 30
        ):
            raise ValueError("Expired token")
        canonical_uuid(nonce)
        principal = next((p for p in config.principals if p.kid == kid), None)
        if (
            principal is None
            or not principal.enabled
            or principal.id != binding
            or principal.revision != revision
        ):
            raise ValueError("Invalid binding")
        key_path = Path(principal.secretFile)
        if not key_path.is_absolute():
            key_path = config_path.parent / key_path
        key = decode_canonical(key_path.read_text().strip())
        if len(key) != 32:
            raise ValueError("Invalid key")
        signature = decode_canonical(signed)
        if not hmac.compare_digest(
            signature, hmac.digest(key, encoded.encode("ascii"), "sha256")
        ):
            raise ValueError("Invalid signature")
        raw_path = request.scope["raw_path"].decode("ascii")
        if request.scope["query_string"]:
            raw_path += "?" + request.scope["query_string"].decode("ascii")
        if method != request.method or path != raw_path:
            raise ValueError("Request mismatch")
        if body_hash != hashlib.sha256(await request.body()).hexdigest():
            raise ValueError("Body mismatch")
        request.state.assistant_wire = {
            "request_method": method,
            "request_path": path,
            "request_body_sha256": body_hash,
        }
        return principal
    except (OSError, ValueError, TypeError, UnicodeError):
        raise Problem(401, "Integration authentication required") from None


PrincipalDep = Annotated[Principal, Depends(authenticate)]


def session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as db, db.begin():
        yield db


DB = Annotated[Session, Depends(session, scope="function")]


def authorize(
    db: Session, principal: Principal, scope: str, *, write: bool = False
) -> None:
    if scope not in principal.scopes:
        raise Problem(403, "Integration scope forbidden")
    statement = select(Account).where(Account.id == principal.accountId)
    if write:
        # Same owner lock ordering as browser writes; serializes cross-principal writes.
        statement = statement.with_for_update()
    if db.scalar(statement) is None:
        raise Problem(403, "Integration account unavailable")


def allowed_project(
    db: Session,
    principal: Principal,
    project_id: str,
    permission: str = "project.read",
    *,
    lock: bool = False,
) -> Project:
    if project_id not in principal.projectIds:
        raise Problem(404, "Resource unavailable")
    try:
        return project_for_user(
            db, project_id, principal.accountId, permission, lock=lock
        )
    except Problem as exc:
        if exc.status == 404:
            raise Problem(404, "Resource unavailable") from None
        raise


def allowed_task(
    db: Session,
    principal: Principal,
    task_id: str,
    permission: str = "project.read",
    *,
    lock: bool = False,
) -> Item:
    snapshot = db.execute(
        select(Item.project_id, Item.kind).where(Item.id == task_id)
    ).one_or_none()
    if (
        snapshot is None
        or snapshot.kind != "task"
        or snapshot.project_id not in principal.projectIds
    ):
        raise Problem(404, "Resource unavailable")
    if lock:
        lock_project_access(db, [snapshot.project_id])
        if (
            db.scalar(select(Item.project_id).where(Item.id == task_id))
            != snapshot.project_id
        ):
            raise Problem(409, "Task project changed")
    try:
        task = item_for_user(
            db, task_id, principal.accountId, permission, lock=lock
        )
        allowed_project(db, principal, task.project_id)
    except Problem as exc:
        if exc.status == 404:
            raise Problem(404, "Resource unavailable") from None
        raise
    if task.kind != "task":
        raise Problem(404, "Resource unavailable")
    return task


class OperationInput(StrictModel):
    operation_id: str

    @field_validator("operation_id")
    @classmethod
    def valid_operation(cls, value: str) -> str:
        return canonical_uuid(value)


class CreateTask(OperationInput):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(default="", max_length=500000)
    acceptance_criteria: list[str] = Field(
        default_factory=list, max_length=100
    )
    requires_test: bool = True


class UpdateValues(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=500000)
    # Keep the request spelling in persisted operation hashes for legacy retries.
    state: TaskState | Literal["cancelled"] | None = None
    acceptance_criteria: list[str] | None = Field(default=None, max_length=100)
    result_url: str | None = Field(default=None, max_length=2000)
    cancellation_reason: str | None = Field(default=None, max_length=10000)


class UpdateTask(OperationInput):
    expected_revision: int = Field(ge=1)
    values: UpdateValues


class AttachResult(OperationInput):
    expected_revision: int = Field(ge=1)
    note: AssistantNoteResult
    runtime: AssistantRuntimeResult
    state: Literal["in_review", "done"] = "in_review"


def operation_hash(action: str, target: str, payload: OperationInput) -> str:
    data = json.dumps(
        [1, action, target, payload.model_dump()],
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(data.encode()).hexdigest()


def existing(
    db: Session,
    principal: Principal,
    operation_id: str,
    request_hash: str | None = None,
) -> dict | None:
    operation = db.scalar(
        select(AssistantOperation).where(
            AssistantOperation.principal_id == principal.id,
            AssistantOperation.operation_id == operation_id,
        )
    )
    if operation is None:
        return None
    allowed_project(db, principal, operation.project_id)
    task = allowed_task(db, principal, operation.task_id)
    if operation.owner_id != principal.accountId:
        raise Problem(404, "Resource unavailable")
    required = {
        "create": "tasks:create",
        "update": "tasks:update",
        "result": "results:attach",
    }[operation.action]
    authorize(db, principal, required)
    permission = {
        "create": "task.create",
        "update": "task.update",
        "result": "task.update",
    }[operation.action]
    # ACL changes and transfers share these project locks. Lock both historical
    # and current projects in the platform's order before rechecking the grant.
    current_project_id = task.project_id
    lock_project_access(db, [operation.project_id, current_project_id])
    if (
        db.scalar(select(Item.project_id).where(Item.id == task.id))
        != current_project_id
    ):
        raise Problem(409, "Task project changed")
    allowed_project(db, principal, operation.project_id, permission)
    allowed_task(db, principal, operation.task_id, permission)
    if request_hash is not None and request_hash != operation.request_hash:
        raise Problem(409, "Operation payload conflict")
    return copy.deepcopy(operation.receipt)


def record(
    request: Request,
    db: Session,
    principal: Principal,
    payload: OperationInput,
    request_hash: str,
    action: str,
    task: Item,
) -> dict:
    receipt = {
        "operation_id": payload.operation_id,
        "request_hash": request_hash,
        **request.state.assistant_wire,
        "task": serialize(task),
    }
    db.add(
        AssistantOperation(
            principal_id=principal.id,
            owner_id=principal.accountId,
            operation_id=payload.operation_id,
            request_hash=request_hash,
            **request.state.assistant_wire,
            action=action,
            project_id=task.project_id,
            task_id=task.id,
            receipt=receipt,
        )
    )
    db.flush()
    return receipt


@router.get("/capabilities")
def capabilities(principal: PrincipalDep, db: DB) -> dict:
    if not principal.scopes:
        raise Problem(403, "Integration scope forbidden")
    authorize(db, principal, principal.scopes[0])

    def permitted(scope: str, permission: str) -> bool:
        return scope in principal.scopes and bool(
            db.scalar(
                select(
                    accessible_project_ids(db, principal.accountId, permission)
                    .where(Project.id.in_(principal.projectIds))
                    .exists()
                )
            )
        )

    return {
        "version": 1,
        "projectsRead": permitted("projects:read", "project.read"),
        "tasksRead": permitted("tasks:read", "project.read"),
        "tasksCreate": permitted("tasks:create", "task.create"),
        "tasksUpdate": permitted("tasks:update", "task.update"),
        "resultsAttach": permitted("results:attach", "task.update"),
        "idempotency": True,
        "cas": True,
    }


@router.get("/projects")
def projects(principal: PrincipalDep, db: DB) -> list[dict]:
    authorize(db, principal, "projects:read")
    return [
        serialize(project)
        for project in db.scalars(
            select(Project)
            .where(
                Project.id.in_(
                    accessible_project_ids(db, principal.accountId)
                ),
                Project.id.in_(principal.projectIds),
            )
            .order_by(Project.name, Project.id)
        )
    ]


@router.get("/tasks")
def tasks(request: Request, principal: PrincipalDep, db: DB) -> dict:
    authorize(db, principal, "tasks:read")
    try:
        query = TaskQuery.model_validate(dict(request.query_params))
    except ValidationError:
        raise Problem(422, "Invalid task query") from None
    if not query.project_id:
        raise Problem(422, "project_id is required")
    allowed_project(db, principal, query.project_id)
    return query_tasks(db, principal.accountId, query)


@router.get("/tasks/{task_id}")
def task(task_id: str, principal: PrincipalDep, db: DB) -> dict:
    authorize(db, principal, "tasks:read")
    return serialize(allowed_task(db, principal, task_id))


@router.get("/projects/{project_id}/tasks")
def project_tasks(
    project_id: str, request: Request, principal: PrincipalDep, db: DB
) -> dict:
    authorize(db, principal, "tasks:read")
    allowed_project(db, principal, project_id)
    supplied = dict(request.query_params)
    if supplied.get("project_id", project_id) != project_id:
        raise Problem(422, "Project query mismatch")
    try:
        query = TaskQuery.model_validate(
            {**supplied, "project_id": project_id}
        )
    except ValidationError:
        raise Problem(422, "Invalid task query") from None
    return query_tasks(db, principal.accountId, query)


@router.post("/projects/{project_id}/tasks")
def create(
    request: Request,
    project_id: str,
    payload: CreateTask,
    principal: PrincipalDep,
    db: DB,
) -> dict:
    authorize(db, principal, "tasks:create", write=True)
    allowed_project(db, principal, project_id)
    digest = operation_hash("create", project_id, payload)
    replay = existing(db, principal, payload.operation_id, digest)
    if replay is not None:
        return replay
    allowed_project(db, principal, project_id, "task.create", lock=True)
    task = create_item(
        db,
        project_id,
        "task",
        payload.title,
        payload.body,
        {
            "workflow": "delivery",
            "state": "todo",
            "acceptance_criteria": payload.acceptance_criteria,
            "requires_test": payload.requires_test,
        },
    )
    return record(request, db, principal, payload, digest, "create", task)


@router.patch("/tasks/{task_id}")
def update(
    request: Request,
    task_id: str,
    payload: UpdateTask,
    principal: PrincipalDep,
    db: DB,
) -> dict:
    authorize(db, principal, "tasks:update", write=True)
    allowed_task(db, principal, task_id)
    digest = operation_hash("update", task_id, payload)
    replay = existing(db, principal, payload.operation_id, digest)
    if replay is not None:
        return replay
    task = allowed_task(db, principal, task_id, "task.update", lock=True)
    values = payload.values.model_dump(exclude_unset=True)
    if not values or any(value is None for value in values.values()):
        raise Problem(422, "Expected nonnull update values")
    title, body = (
        values.pop("title", task.title),
        values.pop("body", task.body),
    )
    data = {**task.data, **values}
    revise_item(
        db,
        task,
        payload.expected_revision,
        title,
        body,
        data,
        status=task.status,
        actor_id=principal.accountId,
    )
    return record(request, db, principal, payload, digest, "update", task)


@router.post("/tasks/{task_id}/results")
def attach(
    request: Request,
    task_id: str,
    payload: AttachResult,
    principal: PrincipalDep,
    db: DB,
) -> dict:
    authorize(db, principal, "results:attach", write=True)
    allowed_task(db, principal, task_id)
    digest = operation_hash("result", task_id, payload)
    replay = existing(db, principal, payload.operation_id, digest)
    if replay is not None:
        return replay
    task = allowed_task(db, principal, task_id, "task.update", lock=True)
    data = copy.deepcopy(task.data)
    data["assistant_result"] = {
        "note": payload.note.model_dump(),
        "runtime": payload.runtime.model_dump(),
    }
    data["result_url"] = payload.note.url
    data["state"] = payload.state
    # Existing note_references use a different, legacy URL grammar. Preserve
    # them verbatim; never strip the workspace or invent an alias URL.
    revise_item(
        db,
        task,
        payload.expected_revision,
        task.title,
        task.body,
        data,
        status=task.status,
        actor_id=principal.accountId,
    )
    return record(request, db, principal, payload, digest, "result", task)


@router.get("/operations/{operation_id}")
def operation(operation_id: str, principal: PrincipalDep, db: DB) -> dict:
    try:
        canonical_uuid(operation_id)
    except ValueError:
        raise Problem(422, "Invalid operation ID") from None
    result = existing(db, principal, operation_id)
    if result is None:
        raise Problem(404, "Resource unavailable")
    return result
