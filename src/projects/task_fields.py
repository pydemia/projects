"""Typed field definitions and owner-scoped value validation."""

import math
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import (
    ProjectTaskFieldDefinition,
    TaskFieldDefinition,
)
from projects.domain import Problem


def field_definition(
    db: Session, owner_id: str, field_id: str, *, project_id: str | None = None
) -> TaskFieldDefinition | ProjectTaskFieldDefinition | None:
    if project_id is None:
        return db.get(TaskFieldDefinition, (owner_id, field_id))
    definition = db.get(ProjectTaskFieldDefinition, (project_id, field_id))
    if definition is not None:
        return definition
    return None


def attach_personal_fields(
    db: Session, actor_id: str, project_id: str, values: dict
) -> None:
    """An explicit field use may copy the actor's own library with schema rights."""
    from projects.project_access import require_project_access

    for field_id in values:
        if (
            db.get(ProjectTaskFieldDefinition, (project_id, field_id))
            is not None
        ):
            continue
        require_project_access(
            db, project_id, actor_id, "field.manage", lock=True
        )
        source = db.get(TaskFieldDefinition, (actor_id, field_id))
        if source is None:
            raise Problem(422, "사용할 수 없는 사용자 필드입니다.")
        db.add(
            ProjectTaskFieldDefinition(
                project_id=project_id,
                id=source.id,
                name=source.name,
                type=source.type,
                options=list(source.options),
                revision=source.revision,
                created_at=source.created_at,
            )
        )
    db.flush()


def validate_custom_values(
    db: Session, owner_id: str, values: dict, *, project_id: str | None = None
) -> None:
    for field_id, value in values.items():
        definition = field_definition(
            db, owner_id, field_id, project_id=project_id
        )
        if definition is None:
            raise Problem(422, "사용할 수 없는 사용자 필드입니다.")
        if value is None:
            continue
        valid = False
        if definition.type == "text":
            valid = type(value) is str and len(value) <= 4000
        elif definition.type == "number":
            if type(value) in (int, float):
                try:
                    valid = math.isfinite(value)
                except OverflowError:
                    valid = False
        elif definition.type == "checkbox":
            valid = type(value) is bool
        elif definition.type == "select":
            valid = type(value) is str and value in definition.options
        elif definition.type == "date" and type(value) is str:
            try:
                valid = date.fromisoformat(value).isoformat() == value
            except ValueError:
                pass
        if not valid:
            raise Problem(422, "사용자 필드 값의 형식이 올바르지 않습니다.")


def validate_view_fields(
    db: Session,
    owner_id: str,
    settings: dict,
    *,
    project_id: str | None = None,
) -> None:
    keys = [
        *settings.get("card_fields", []),
        *(settings.get("list_fields") or []),
    ]
    values = {key[7:]: None for key in keys if key.startswith("custom:")}
    if project_id is None:
        # Global personal views can refer to fields in any readable project,
        # but never to another account's unrelated personal field library.
        from projects.project_access import accessible_project_ids

        readable_fields = set(
            db.scalars(
                select(ProjectTaskFieldDefinition.id).where(
                    ProjectTaskFieldDefinition.project_id.in_(
                        accessible_project_ids(db, owner_id)
                    )
                )
            )
        )
        values = {
            key: value
            for key, value in values.items()
            if key not in readable_fields
        }
    validate_custom_values(
        db,
        owner_id,
        values,
        project_id=project_id,
    )
