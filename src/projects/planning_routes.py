"""Planning HTTP endpoints, using the host's existing session and auth policy."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.database import Account
from projects.domain import Problem
from projects.planning import (
    DraftCreate,
    DraftUpdate,
    PlanningApply,
    PlanningSelection,
    apply_draft,
    create_draft,
    draft_dto,
    draft_for_actor,
    preview_draft,
    update_draft,
)
from projects.planning_models import PlanningDraft
from projects.project_access import require_project_access


def install_planning_routes(
    app: FastAPI, get_db: Callable, signed_in: Callable
) -> None:
    @app.get("/api/projects/{project_id}/planning-drafts")
    def list_drafts(
        project_id: str,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> list[dict]:
        require_project_access(db, project_id, user.id)
        rows = db.scalars(
            select(PlanningDraft)
            .where(
                PlanningDraft.project_id == project_id,
                PlanningDraft.actor_id == user.id,
            )
            .order_by(PlanningDraft.updated_at.desc(), PlanningDraft.id)
        )
        result = []
        for draft in rows:
            try:
                draft_for_actor(db, draft.id, user.id)
            except Problem as exc:
                if exc.status not in {403, 404, 409}:
                    raise
                continue
            result.append(draft_dto(db, draft))
        return result

    @app.post("/api/projects/{project_id}/planning-drafts", status_code=201)
    def new_draft(
        project_id: str,
        payload: DraftCreate,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> dict:
        return draft_dto(db, create_draft(db, project_id, user.id, payload))

    @app.get("/api/planning-drafts/{draft_id}")
    def read_draft(
        draft_id: str,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> dict:
        return draft_dto(db, draft_for_actor(db, draft_id, user.id))

    @app.patch("/api/planning-drafts/{draft_id}")
    def patch_draft(
        draft_id: str,
        payload: DraftUpdate,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> dict:
        draft = draft_for_actor(db, draft_id, user.id, lock=True)
        return draft_dto(db, update_draft(db, draft, user.id, payload))

    @app.post("/api/planning-drafts/{draft_id}/preview")
    def preview(
        draft_id: str,
        payload: PlanningSelection,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> dict:
        return preview_draft(
            db,
            draft_for_actor(db, draft_id, user.id, lock=True),
            user.id,
            payload,
        )

    @app.post("/api/planning-drafts/{draft_id}/apply")
    def apply(
        draft_id: str,
        payload: PlanningApply,
        db: Annotated[Session, Depends(get_db, scope="function")],
        user: Annotated[Account, Depends(signed_in)],
    ) -> dict:
        return apply_draft(
            db,
            draft_for_actor(db, draft_id, user.id, lock=True),
            user.id,
            payload,
        )
