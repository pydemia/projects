"""Owner-scoped task discovery with consistent, bounded pages."""

import base64
import hashlib
import json
from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)
from sqlalchemy import Integer, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from projects.database import Item, Project, TaskPosition
from projects.domain import Problem
from projects.project_access import access_fingerprint, accessible_project_ids
from projects.records import project_for_user, serialize


class TaskQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str | None = None
    project_ids: str | None = Field(default=None, max_length=4000)
    task_scope: Literal["all", "today", "inbox", "upcoming"] = "all"
    status: Literal[
        "all", "open", "todo", "in_progress", "in_review", "done", "cancelled"
    ] = "open"
    query: str = Field(default="", max_length=1000)
    sort: Literal["manual", "due_date", "deadline", "gtd", "abc"] = "due_date"
    context: str = Field(default="", max_length=80)
    minutes: int = Field(default=0, ge=0, le=100000)
    energy: Literal["any", "low", "medium", "high"] = "any"
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=2000)
    date: str | None = None
    timezone: Literal["Asia/Seoul"] = "Asia/Seoul"

    @field_validator("project_ids")
    @classmethod
    def valid_project_ids(cls, value: str | None) -> str | None:
        if not value:
            return None
        values = value.split(",")
        if len(values) > 100:
            raise ValueError("Select at most 100 projects")
        return ",".join(sorted({str(UUID(value.strip())) for value in values}))

    @model_validator(mode="after")
    def exclusive_project_filter(self) -> Self:
        if self.project_id and self.project_ids:
            raise ValueError("Use project_id or project_ids, not both")
        return self


def _snapshot(db: Session, user_id: str, project_ids: list[str] | None) -> str:
    statement = (
        select(
            func.count(Item.id),
            func.coalesce(func.sum(Item.revision), 0),
            func.max(Item.updated_at),
        )
        .join(Project, Project.id == Item.project_id)
        .where(
            Project.id.in_(accessible_project_ids(db, user_id)),
            Item.kind == "task",
        )
    )
    if project_ids is not None:
        statement = statement.where(Item.project_id.in_(project_ids))
    values = db.execute(statement).one()
    return hashlib.sha256(
        (str(tuple(values)) + access_fingerprint(db, user_id)).encode()
    ).hexdigest()


def query_tasks(db: Session, user_id: str, request: TaskQuery) -> dict:
    if request.project_id:
        project_for_user(db, request.project_id, user_id)
    project_ids = None
    if request.project_id:
        project_ids = [request.project_id]
    elif request.project_ids:
        project_ids = request.project_ids.split(",")
    try:
        day = (
            date.fromisoformat(request.date)
            if request.date
            else datetime.now(ZoneInfo(request.timezone)).date()
        ).isoformat()
    except ValueError as exc:
        raise Problem(422, "유효한 기준일을 입력해 주세요.") from exc
    state = Item.data["state"].as_string()
    planned = func.coalesce(Item.data["planned_date"].as_string(), "")
    due = func.coalesce(Item.data["due_date"].as_string(), "")
    opened = state.not_in(("done", "cancelled"))
    scopes = {
        "all": opened,
        "today": and_(
            opened,
            or_(
                and_(planned != "", planned <= day),
                and_(due != "", due <= day),
            ),
        ),
        "inbox": and_(opened, Item.data["list_name"].as_string() == "Inbox"),
        "upcoming": and_(
            opened,
            or_(planned > day, and_(planned == "", due > day)),
        ),
    }
    owner_filters = [
        Project.id.in_(accessible_project_ids(db, user_id)),
        Item.kind == "task",
    ]
    if project_ids is not None:
        owner_filters.append(Item.project_id.in_(project_ids))
    snapshot = _snapshot(db, user_id, project_ids)
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                **request.model_dump(exclude={"cursor"}),
                "date": day,
                "actor": user_id,
            },
            sort_keys=True,
        ).encode(),
    ).hexdigest()
    offset = 0
    if request.cursor:
        try:
            cursor = json.loads(base64.urlsafe_b64decode(request.cursor))
            offset = cursor["offset"]
            if (
                not isinstance(offset, int)
                or isinstance(offset, bool)
                or offset < 0
                or cursor["query"] != fingerprint
            ):
                raise ValueError("cursor query mismatch")
            if cursor["snapshot"] != snapshot:
                raise Problem(
                    409,
                    "작업 목록이 변경되었습니다. 처음부터 새로 불러와 주세요.",
                )
        except (ValueError, KeyError, TypeError) as exc:
            raise Problem(422, "목록 위치가 유효하지 않습니다.") from exc
    count_row = db.execute(
        select(
            *(func.count().filter(condition) for condition in scopes.values())
        )
        .select_from(Item)
        .join(Project, Project.id == Item.project_id)
        .where(*owner_filters),
    ).one()
    scope_counts = dict(zip(scopes, count_row, strict=True))
    filters = list(owner_filters)
    if request.task_scope != "all":
        filters.append(scopes[request.task_scope])
    if request.status == "open":
        filters.append(opened)
    elif request.status != "all":
        filters.append(state == request.status)
    if request.query:
        needle = (
            request.query.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        filters.append(
            func.concat_ws(
                " ",
                Item.title,
                Item.data["list_name"].as_string(),
                Item.data["context"].as_string(),
                Item.data["goal"].as_string(),
            ).ilike(f"%{needle}%", escape="\\")
        )
    total = (
        db.scalar(
            select(func.count())
            .select_from(Item)
            .join(Project, Project.id == Item.project_id)
            .where(*filters),
        )
        or 0
    )
    due_order = func.nullif(due, "").asc().nulls_last()
    if request.sort == "manual":
        ordering = [Item.project_id, func.coalesce(TaskPosition.position, 0)]
    elif request.sort == "deadline":
        ordering = [case((opened, 0), else_=1), due_order]
    elif request.sort == "abc":
        priority = Item.data["abc_priority"].as_string()
        ordering = [
            case(
                (priority == "A", 0),
                (priority == "B", 1),
                (priority == "C", 2),
                else_=3,
            ),
            func.nullif(cast(Item.data["abc_order"].as_string(), Integer), 0)
            .asc()
            .nulls_last(),
            due_order,
        ]
    elif request.sort == "gtd":
        rank: ColumnElement[int] = case(
            (Item.data["next_action"].as_boolean(), 0), else_=100
        )
        if request.context:
            context = func.coalesce(Item.data["context"].as_string(), "")
            rank = rank + case(
                (
                    and_(
                        context != "",
                        func.lower(context) != request.context.lower(),
                    ),
                    30,
                ),
                else_=0,
            )
        if request.energy != "any":
            energy = Item.data["energy"].as_string()
            level = case(
                (energy == "low", 1),
                (energy == "medium", 2),
                (energy == "high", 3),
                else_=0,
            )
            rank = rank + case(
                (
                    level > {"low": 1, "medium": 2, "high": 3}[request.energy],
                    20,
                ),
                else_=0,
            )
        if request.minutes:
            estimate = func.coalesce(
                cast(Item.data["estimated_minutes"].as_string(), Integer), 0
            )
            rank = rank + case(
                (estimate > request.minutes, 10), (estimate == 0, 5), else_=0
            )
        ordering = [
            rank,
            due_order,
        ]
    else:
        ordering = [due_order]
    rows = db.execute(
        select(Item, Project.name, TaskPosition.position)
        .join(Project, Project.id == Item.project_id)
        .outerjoin(TaskPosition, TaskPosition.item_id == Item.id)
        .where(*filters)
        .order_by(*ordering, Item.created_at, Item.id)
        .offset(min(offset, total))
        .limit(request.limit),
    ).all()
    if _snapshot(db, user_id, project_ids) != snapshot:
        raise Problem(409, "작업 목록이 변경되었습니다. 다시 불러와 주세요.")
    next_offset = offset + len(rows)
    cursor_value = None
    if next_offset < total:
        cursor_value = base64.urlsafe_b64encode(
            json.dumps(
                {
                    "offset": next_offset,
                    "query": fingerprint,
                    "snapshot": snapshot,
                }
            ).encode(),
        ).decode()
    return {
        "items": [
            {
                **serialize(item),
                "project_name": name,
                "board_order": position or 0,
            }
            for item, name, position in rows
        ],
        "total": total,
        "scope_counts": scope_counts,
        "next_cursor": cursor_value,
        "as_of": snapshot,
        "date": day,
        "timezone": request.timezone,
    }
