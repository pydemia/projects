"""Story HTTP routes assembled with the host application's auth and session."""

from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from projects.database import Account
from projects.stories import (
    StoryVerificationInput,
    project_stories,
    story_verifications,
    verify_story,
)


def create_story_router(
    db_dependency: Callable[..., Iterator[Session]],
    user_dependency: Callable[..., Account],
) -> APIRouter:
    router = APIRouter()
    DB = Annotated[Session, Depends(db_dependency, scope="function")]
    User = Annotated[Account, Depends(user_dependency)]

    @router.get("/api/projects/{project_id}/stories")
    def stories(project_id: str, db: DB, user: User) -> dict:
        return project_stories(db, project_id, user.id)

    @router.get("/api/items/{item_id}/story-verifications")
    def verifications(item_id: str, db: DB, user: User) -> list[dict]:
        return story_verifications(db, item_id, user.id)

    @router.post("/api/items/{item_id}/story-verifications", status_code=201)
    def verify(
        item_id: str, payload: StoryVerificationInput, db: DB, user: User
    ) -> dict:
        return verify_story(db, item_id, user.id, payload)

    return router
