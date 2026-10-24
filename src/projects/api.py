"""HTTP composition and transactional project actions."""

import hmac
import os
import shutil
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from projects.auth import (
    LoginLimiter,
    authenticate,
    authenticate_proxy,
    create_session,
    password_hash,
    resolve_session,
)
from projects.config import Settings
from projects.database import (
    Account,
    Baseline,
    Item,
    Link,
    Project,
    RepositoryActivity,
    Revision,
    SkillRun,
    TaskView,
    TestRun,
    make_engine,
    utcnow,
)
from projects.domain import Problem, validate_item_data
from projects.records import (
    add_link,
    create_baseline,
    create_item,
    item_for_user,
    project_for_user,
    project_links,
    project_summary,
    require_revision,
    revise_item,
    search_items,
    serialize,
    trace,
)
from projects.repository_import import GitHubInspector
from projects.schemas import (
    ApplyInput,
    BaselineInput,
    Credentials,
    ExpectedRevision,
    GitImportInput,
    GitPreviewInput,
    ImportInput,
    ItemInput,
    ItemUpdate,
    LinkInput,
    ProjectInput,
    ReconnectInput,
    ResolveInput,
    RestoreInput,
    ReviewInput,
    RunInput,
    TaskBulkChange,
    TaskMove,
    TaskQuickCreate,
    TaskViewInput,
    TaskViewUpdate,
    TestRunInput,
)
from projects.task_board import (
    board_orders,
    bulk_change_tasks,
    move_task,
    quick_create_task,
)


def db_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as db, db.begin():
        yield db


DB = Annotated[Session, Depends(db_session)]


def signed_in(request: Request, db: DB) -> Account:
    session = resolve_session(db, request.cookies.get("projects_session"))
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        supplied = request.headers.get("X-CSRF-Token", "")
        if not hmac.compare_digest(supplied, session.csrf_token):
            raise Problem(403, "CSRF 토큰을 확인해 주세요.")
    user = db.get(Account, session.user_id)
    if user is None:
        raise Problem(401, "로그인이 필요합니다.")
    if request.app.state.settings.proxy_auth_enabled:
        proxy_user = proxy_account(request, db)
        if proxy_user.id != user.id:
            raise Problem(401, "로그인이 필요합니다.")
    return user


User = Annotated[Account, Depends(signed_in)]


def proxy_account(request: Request, db: Session) -> Account:
    settings: Settings = request.app.state.settings
    return authenticate_proxy(
        db,
        settings,
        request.headers.get("X-Forwarded-Email", ""),
        request.headers.get("X-Forwarded-User", ""),
    )


class BrowserBoundary(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            origin = request.headers.get("origin")
            if origin and urlsplit(origin).netloc != request.headers.get(
                "host"
            ):
                return JSONResponse(
                    {"detail": "다른 출처의 변경 요청입니다."}, status_code=403
                )
            size = request.headers.get("content-length")
            if size and (
                not size.isdigit()
                or int(size) > request.app.state.settings.max_request_bytes
            ):
                return JSONResponse(
                    {"detail": "요청 크기 한도를 초과했습니다."},
                    status_code=413,
                )
            if request.url.path in {"/api/auth/login", "/api/auth/register"}:
                peer = request.client.host if request.client else "unknown"
                if not request.app.state.login_limiter.allowed(peer):
                    return JSONResponse(
                        {
                            "detail": "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요."
                        },
                        status_code=429,
                        headers={"Retry-After": "60"},
                    )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        return response


def create_app(
    settings: Settings | None = None,
    *,
    engine: Engine | None = None,
    resolver: object | None = None,
    runner: object | None = None,
) -> FastAPI:
    settings = settings if settings is not None else Settings.from_env()
    actual_engine = (
        engine if engine is not None else make_engine(settings.database_url)
    )
    from projects.jobs import Worker
    from projects.runtime import (
        BundleResolver,
        ReferenceCatalog,
        RuntimeFailure,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        with actual_engine.connect() as connection:
            connection.execute(text("SELECT 1 FROM alembic_version"))
        worker = Worker(app.state) if settings.worker_enabled else None
        if worker:
            worker.start()
        try:
            yield
        finally:
            if worker:
                worker.stop()
            close_runner = getattr(app.state.runner, "close", None)
            if callable(close_runner):
                close_runner()
            close_github = getattr(app.state.github, "close", None)
            if callable(close_github):
                close_github()
            if engine is None:
                actual_engine.dispose()

    app = FastAPI(title="Projects", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.login_limiter = LoginLimiter()
    app.state.engine = actual_engine
    app.state.resolver = resolver or BundleResolver(
        settings.data_dir / "skills", settings.hub_url
    )
    app.state.catalog = ReferenceCatalog(settings.registry_path)
    app.state.runner = runner
    app.state.github = GitHubInspector(
        settings.github_token, settings.github_private_repos
    )
    app.add_middleware(BrowserBoundary)

    @app.exception_handler(Problem)
    async def problem_handler(request: Request, exc: Problem) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status)

    @app.exception_handler(IntegrityError)
    async def integrity_handler(
        request: Request, exc: IntegrityError
    ) -> JSONResponse:
        return JSONResponse(
            {"detail": "중복되거나 유효하지 않은 연결입니다."}, status_code=409
        )

    @app.exception_handler(RuntimeFailure)
    async def runtime_handler(
        request: Request, exc: RuntimeFailure
    ) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.get("/health")
    def health(db: DB) -> dict:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    def session_response(
        db: Session, user: Account, response: Response
    ) -> dict:
        token, session = create_session(db, user, settings.session_seconds)
        response.set_cookie(
            "projects_session",
            token,
            httponly=True,
            secure=settings.secure_cookies,
            samesite="lax",
            max_age=settings.session_seconds,
        )
        return {
            "user": {"id": user.id, "username": user.username},
            "csrf_token": session.csrf_token,
        }

    @app.get("/api/auth/options")
    def auth_options() -> dict:
        return {
            "registration_enabled": settings.registration_enabled,
            "auth_mode": "microsoft"
            if settings.proxy_auth_enabled
            else "password",
        }

    @app.post("/api/auth/register", status_code=201)
    def register(payload: Credentials, response: Response, db: DB) -> dict:
        if not settings.registration_enabled or settings.proxy_auth_enabled:
            raise Problem(
                403,
                "신규 계정 생성이 닫혀 있습니다. 발급된 계정으로 로그인해 주세요.",
            )
        user = Account(
            username=payload.username.lower(),
            password_hash=password_hash(payload.password),
        )
        db.add(user)
        db.flush()
        return session_response(db, user, response)

    @app.post("/api/auth/login")
    def login(payload: Credentials, response: Response, db: DB) -> dict:
        if settings.proxy_auth_enabled:
            raise Problem(403, "Microsoft 계정으로 로그인해 주세요.")
        user = authenticate(db, payload.username, payload.password)
        return session_response(db, user, response)

    @app.get("/api/session")
    def session_info(request: Request, response: Response, db: DB) -> dict:
        if settings.proxy_auth_enabled:
            user = proxy_account(request, db)
            token = request.cookies.get("projects_session")
            if token:
                try:
                    session = resolve_session(db, token)
                except Problem:
                    session = None
                if session is not None and session.user_id == user.id:
                    return {
                        "user": {"id": user.id, "username": user.username},
                        "csrf_token": session.csrf_token,
                    }
            return session_response(db, user, response)
        user = signed_in(request, db)
        session = resolve_session(db, request.cookies.get("projects_session"))
        return {
            "user": {"id": user.id, "username": user.username},
            "csrf_token": session.csrf_token,
        }

    @app.post("/api/auth/logout")
    def logout(
        request: Request, response: Response, db: DB, user: User
    ) -> dict:
        db.delete(resolve_session(db, request.cookies.get("projects_session")))
        response.delete_cookie("projects_session")
        return {
            "ok": True,
            "auth_mode": "microsoft"
            if settings.proxy_auth_enabled
            else "password",
        }

    @app.get("/api/projects")
    def projects(db: DB, user: User) -> list[dict]:
        rows = db.scalars(
            select(Project)
            .where(Project.owner_id == user.id)
            .order_by(Project.created_at, Project.id)
        )
        return [serialize(x) for x in rows]

    @app.post("/api/projects", status_code=201)
    def new_project(payload: ProjectInput, db: DB, user: User) -> dict:
        if not payload.name.strip():
            raise Problem(422, "프로젝트 이름을 입력해 주세요.")
        project = Project(owner_id=user.id, **payload.model_dump())
        db.add(project)
        db.flush()
        return serialize(project)

    @app.post("/api/projects/from-git/preview")
    def preview_git(
        request: Request, payload: GitPreviewInput, db: DB, user: User
    ) -> dict:
        return request.app.state.github.inspect(
            payload.repository_url, payload.path
        )

    @app.post("/api/projects/from-git", status_code=201)
    def import_git(
        request: Request, payload: GitImportInput, db: DB, user: User
    ) -> dict:
        if not payload.name.strip():
            raise Problem(422, "프로젝트 이름을 입력해 주세요.")
        preview = request.app.state.github.inspect(
            payload.repository_url, payload.path
        )
        if preview["sha"] != payload.expected_sha:
            raise Problem(
                409,
                "기본 branch가 변경되었습니다. 저장소를 다시 분석해 주세요.",
            )
        duplicate = db.scalar(
            select(Project).where(
                Project.owner_id == user.id,
                Project.repository_url == preview["repository_url"],
                Project.repository_path == preview["path"],
            )
        )
        if duplicate is not None:
            raise Problem(409, "이미 가져온 저장소와 폴더입니다.")
        project = Project(
            owner_id=user.id,
            name=payload.name.strip(),
            goal=payload.goal.strip() or preview["suggested_goal"],
            profile=payload.profile,
            repository_url=preview["repository_url"],
            repository_path=preview["path"],
            repository_branch=preview["branch"],
            repository_sha=preview["sha"],
            repository_kind=preview["kind"],
            repository_manifest=preview["manifest_path"],
            repository_imported_at=utcnow(),
        )
        db.add(project)
        db.flush()
        create_item(
            db,
            project.id,
            kind="idea",
            title="GitHub 저장소 이관 메모",
            body=(
                f"출처: {preview['repository_url']}\n"
                f"폴더: {preview['path'] or '(전체)'}\n"
                f"기본 branch: {preview['branch']}\n"
                f"commit: {preview['sha']}\n"
                f"manifest: {preview['manifest_path'] or '(없음)'}\n"
                f"이관 당시 commit·PR 요약 {len(preview['activities'])}건. "
                "저장소의 제목과 설명은 확인 전 입력입니다."
            ),
            data={
                "source_url": preview["repository_url"],
                "notes": "읽기 전용 이관",
            },
        )
        for activity in preview["activities"]:
            db.add(
                RepositoryActivity(
                    project_id=project.id,
                    **{
                        **activity,
                        "occurred_at": datetime.fromisoformat(
                            activity["occurred_at"]
                        ),
                    },
                )
            )
        db.flush()
        return serialize(project)

    # Import is registered before /projects/{project_id}.
    @app.post("/api/projects/import", status_code=201)
    def import_archive(payload: ImportInput, db: DB, user: User) -> dict:
        from projects.portable import import_project

        return serialize(import_project(db, user.id, payload.archive_base64))

    @app.get("/api/projects/{project_id}")
    def project_detail(project_id: str, db: DB, user: User) -> dict:
        return serialize(project_for_user(db, project_id, user.id))

    @app.get("/api/projects/{project_id}/repository-activity")
    def repository_activity(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        rows = db.scalars(
            select(RepositoryActivity)
            .where(RepositoryActivity.project_id == project_id)
            .order_by(
                RepositoryActivity.occurred_at.desc(), RepositoryActivity.id
            )
        )
        return [serialize(row) for row in rows]

    @app.get("/api/projects/{project_id}/summary")
    def summary(project_id: str, db: DB, user: User) -> dict:
        project_for_user(db, project_id, user.id)
        return project_summary(db, project_id)

    @app.get("/api/projects/{project_id}/items")
    def items(
        project_id: str,
        db: DB,
        user: User,
        kind: str | None = None,
        q: str = "",
    ) -> list[dict]:
        project_for_user(db, project_id, user.id)
        positions = board_orders(
            db,
            list(
                db.scalars(
                    select(Item).where(
                        Item.project_id == project_id, Item.kind == "task"
                    )
                )
            ),
        )
        rows = []
        for item in search_items(db, project_id, kind, q[:1000]):
            row = serialize(item)
            if item.kind == "task":
                row["board_order"] = positions[item.id]
            rows.append(row)
        return rows

    def validate_references(
        db: Session, project_id: str, kind: str, data: dict
    ) -> None:
        validated = validate_item_data(kind, data)
        if kind == "artifact":
            app.state.catalog.validate_manifest(validated)
        reference_ids = validated.get("feature_ids", []) + validated.get(
            "project_source_refs", []
        )
        for reference_id in reference_ids:
            reference = db.get(Item, reference_id)
            if reference is None or reference.project_id != project_id:
                raise Problem(
                    422, "같은 프로젝트의 유효한 참조를 선택해 주세요."
                )
            if (
                reference_id in validated.get("feature_ids", [])
                and reference.kind != "feature"
            ):
                raise Problem(422, "기능 참조에는 기능 항목을 선택해 주세요.")

    @app.post("/api/projects/{project_id}/items", status_code=201)
    def new_item(
        project_id: str, payload: ItemInput, db: DB, user: User
    ) -> dict:
        project_for_user(db, project_id, user.id)
        validate_references(db, project_id, payload.kind, payload.data)
        if payload.kind == "task" and payload.data.get("state") == "done":
            raise Problem(
                409, "초안 작업을 만든 뒤 완료 근거를 연결해 주세요."
            )
        return serialize(create_item(db, project_id, **payload.model_dump()))

    @app.post("/api/projects/{project_id}/tasks/quick", status_code=201)
    def quick_task(
        project_id: str, payload: TaskQuickCreate, db: DB, user: User
    ) -> dict:
        project_for_user(db, project_id, user.id)
        task = quick_create_task(db, project_id, payload)
        return {
            **serialize(task),
            "board_order": board_orders(db, _tasks(db, project_id))[task.id],
        }

    @app.post("/api/projects/{project_id}/tasks/bulk")
    def bulk_tasks(
        project_id: str, payload: TaskBulkChange, db: DB, user: User
    ) -> list[dict]:
        project_for_user(db, project_id, user.id)
        changed = bulk_change_tasks(db, project_id, payload)
        positions = board_orders(db, _tasks(db, project_id))
        return [
            {**serialize(task), "board_order": positions[task.id]}
            for task in changed
        ]

    def _tasks(db: Session, project_id: str) -> list[Item]:
        return list(
            db.scalars(
                select(Item).where(
                    Item.project_id == project_id, Item.kind == "task"
                )
            )
        )

    @app.get("/api/projects/{project_id}/task-views")
    def task_views(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        return [
            serialize(row)
            for row in db.scalars(
                select(TaskView)
                .where(
                    TaskView.project_id == project_id,
                    TaskView.owner_id == user.id,
                    TaskView.scope == "personal",
                )
                .order_by(TaskView.name, TaskView.id)
            )
        ]

    @app.post("/api/projects/{project_id}/task-views", status_code=201)
    def create_task_view(
        project_id: str, payload: TaskViewInput, db: DB, user: User
    ) -> dict:
        project_for_user(db, project_id, user.id)
        db.scalar(
            select(Project).where(Project.id == project_id).with_for_update()
        )
        if payload.is_default:
            for row in db.scalars(
                select(TaskView).where(
                    TaskView.project_id == project_id,
                    TaskView.owner_id == user.id,
                    TaskView.is_default.is_(True),
                )
            ):
                row.is_default = False
            db.flush()
        row = TaskView(
            project_id=project_id,
            owner_id=user.id,
            name=payload.name.strip(),
            scope="personal",
            settings=payload.settings.model_dump(),
            is_default=payload.is_default,
        )
        db.add(row)
        db.flush()
        return serialize(row)

    @app.put("/api/task-views/{view_id}")
    def update_task_view(
        view_id: str, payload: TaskViewUpdate, db: DB, user: User
    ) -> dict:
        row = db.get(TaskView, view_id)
        if row is None or row.owner_id != user.id:
            raise Problem(404, "저장된 보기를 찾을 수 없습니다.")
        project_for_user(db, row.project_id, user.id)
        db.scalar(
            select(Project)
            .where(Project.id == row.project_id)
            .with_for_update()
        )
        db.refresh(row, with_for_update=True)
        if row.revision != payload.expected_revision:
            raise Problem(409, "보기가 변경되었습니다. 다시 불러와 주세요.")
        if payload.is_default:
            for other in db.scalars(
                select(TaskView).where(
                    TaskView.project_id == row.project_id,
                    TaskView.owner_id == user.id,
                    TaskView.is_default.is_(True),
                    TaskView.id != row.id,
                )
            ):
                other.is_default = False
            db.flush()
        row.name = payload.name.strip()
        row.settings = payload.settings.model_dump()
        row.is_default = payload.is_default
        row.revision += 1
        db.flush()
        return serialize(row)

    @app.delete("/api/task-views/{view_id}")
    def delete_task_view(view_id: str, db: DB, user: User) -> dict:
        row = db.get(TaskView, view_id)
        if row is None or row.owner_id != user.id:
            raise Problem(404, "저장된 보기를 찾을 수 없습니다.")
        project_for_user(db, row.project_id, user.id)
        db.delete(row)
        return {"ok": True}

    @app.get("/api/items/{item_id}")
    def item_detail(item_id: str, db: DB, user: User) -> dict:
        return serialize(item_for_user(db, item_id, user.id))

    @app.put("/api/items/{item_id}")
    def update_item(
        item_id: str, payload: ItemUpdate, db: DB, user: User
    ) -> dict:
        item = item_for_user(db, item_id, user.id, lock=True)
        validate_references(db, item.project_id, item.kind, payload.data)
        return serialize(
            revise_item(
                db,
                item,
                payload.expected_revision,
                payload.title,
                payload.body,
                payload.data,
            )
        )

    @app.post("/api/items/{item_id}/move")
    def move_board_task(
        item_id: str, payload: TaskMove, db: DB, user: User
    ) -> dict:
        item = item_for_user(db, item_id, user.id, lock=True)
        position, undo_before, undo_after = move_task(db, item, payload)
        return {
            **serialize(item),
            "board_order": position,
            "undo_move": {
                "source_state": payload.target_state,
                "target_state": payload.source_state,
                "before_id": undo_before,
                "after_id": undo_after,
            },
        }

    @app.post("/api/items/{item_id}/confirm")
    def confirm_item(
        item_id: str, payload: ExpectedRevision, db: DB, user: User
    ) -> dict:
        item = item_for_user(db, item_id, user.id, lock=True)
        require_revision(item, payload.expected_revision)
        if item.status == "confirmed":
            return serialize(item)
        return serialize(
            revise_item(
                db,
                item,
                payload.expected_revision,
                item.title,
                item.body,
                item.data,
                status="confirmed",
            )
        )

    @app.get("/api/items/{item_id}/revisions")
    def revisions(item_id: str, db: DB, user: User) -> list[dict]:
        item_for_user(db, item_id, user.id)
        rows = db.scalars(
            select(Revision)
            .where(Revision.item_id == item_id)
            .order_by(Revision.revision.desc())
        )
        return [serialize(x) for x in rows]

    @app.post("/api/items/{item_id}/restore")
    def restore(
        item_id: str, payload: RestoreInput, db: DB, user: User
    ) -> dict:
        item = item_for_user(db, item_id, user.id, lock=True)
        old = db.get(Revision, (item.id, payload.revision))
        if old is None:
            raise Problem(404, "과거 버전을 찾을 수 없습니다.")
        return serialize(
            revise_item(
                db,
                item,
                payload.expected_revision,
                old.title,
                old.body,
                old.data,
            )
        )

    @app.get("/api/projects/{project_id}/links")
    def links(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        return [serialize(x) for x in project_links(db, project_id)]

    @app.post("/api/projects/{project_id}/links", status_code=201)
    def new_link(
        project_id: str, payload: LinkInput, db: DB, user: User
    ) -> dict:
        project_for_user(db, project_id, user.id)
        source = item_for_user(db, payload.source_id, user.id)
        target = item_for_user(db, payload.target_id, user.id)
        return serialize(
            add_link(db, project_id, source, target, payload.relation)
        )

    def owned_link(db: Session, user: Account, link_id: str) -> Link:
        link = db.scalar(
            select(Link).where(Link.id == link_id).with_for_update()
        )
        if link is None:
            raise Problem(404, "연결을 찾을 수 없습니다.")
        project_for_user(db, link.project_id, user.id)
        return link

    @app.delete("/api/links/{link_id}")
    def delete_link(link_id: str, db: DB, user: User) -> dict:
        db.delete(owned_link(db, user, link_id))
        return {"ok": True}

    @app.post("/api/links/{link_id}/review")
    def review_link(
        link_id: str, payload: ReviewInput, db: DB, user: User
    ) -> dict:
        link = owned_link(db, user, link_id)
        source = item_for_user(db, link.source_id, user.id, lock=True)
        target = item_for_user(db, link.target_id, user.id, lock=True)
        require_revision(source, payload.expected_source_revision)
        require_revision(target, payload.expected_target_revision)
        link.review = {
            "impact": payload.impact,
            "reason": payload.reason,
            "at": utcnow().isoformat(),
        }
        if payload.impact == "none":
            link.source_revision = source.revision
            link.target_revision = target.revision
        db.flush()
        return serialize(link)

    @app.get("/api/projects/{project_id}/test-runs")
    def test_runs(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        rows = db.scalars(
            select(TestRun)
            .where(TestRun.project_id == project_id)
            .order_by(TestRun.created_at.desc(), TestRun.id)
        )
        return [serialize(x) for x in rows]

    @app.post("/api/items/{item_id}/test-runs", status_code=201)
    def new_test_run(
        item_id: str, payload: TestRunInput, db: DB, user: User
    ) -> dict:
        case = item_for_user(db, item_id, user.id, lock=True)
        if case.kind != "test_case":
            raise Problem(422, "테스트 케이스에만 실행 결과를 연결합니다.")
        if (
            not any(x.strip() for x in case.data["steps"])
            or not case.data["expected"].strip()
        ):
            raise Problem(409, "케이스 절차와 기대 결과를 먼저 작성해 주세요.")
        if not all(
            value.strip()
            for value in (
                payload.actual,
                payload.environment,
                payload.target_sha,
            )
        ):
            raise Problem(422, "실제 결과·환경·대상 commit을 입력해 주세요.")
        run = TestRun(
            project_id=case.project_id,
            case_id=case.id,
            case_revision=case.revision,
            **payload.model_dump(),
        )
        db.add(run)
        db.flush()
        return serialize(run)

    @app.get("/api/projects/{project_id}/baselines")
    def baselines(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        return [
            serialize(x)
            for x in db.scalars(
                select(Baseline)
                .where(Baseline.project_id == project_id)
                .order_by(Baseline.created_at.desc())
            )
        ]

    @app.post("/api/projects/{project_id}/baselines", status_code=201)
    def new_baseline(
        project_id: str, payload: BaselineInput, db: DB, user: User
    ) -> dict:
        project_for_user(db, project_id, user.id)
        return serialize(create_baseline(db, project_id, payload.name))

    @app.get("/api/projects/{project_id}/trace")
    def trace_detail(project_id: str, db: DB, user: User) -> dict:
        project_for_user(db, project_id, user.id)
        return trace(db, project_id)

    @app.get("/api/catalog")
    def catalog(user: User) -> dict:
        return app.state.catalog.load()

    @app.get("/api/runtime")
    def runtime_info(user: User) -> dict:
        configured = (
            app.state.runner is not None
            or (
                settings.llm_provider == "openai_compatible"
                and bool(settings.llm_api_key and settings.llm_model)
            )
            or (
                settings.llm_provider == "codex_login"
                and shutil.which("codex") is not None
                and bool(
                    settings.llm_auth_inline
                    or (
                        settings.llm_auth_file
                        or Path(
                            os.getenv(
                                "CODEX_HOME", str(Path.home() / ".codex")
                            )
                        )
                        / "auth.json"
                    ).is_file()
                )
            )
        )
        return {
            "configured": configured,
            "provider": settings.llm_provider,
            "model": settings.llm_model,
            "capabilities": ["markdown", "text_files", "skill_bundles"],
        }

    @app.post("/api/skills/resolve")
    def resolve(payload: ResolveInput, user: User) -> dict:
        return {
            "bundles": [
                app.state.resolver.resolve(x)
                for x in dict.fromkeys(payload.skill_ids)
            ]
        }

    @app.get("/api/projects/{project_id}/runs")
    def runs(project_id: str, db: DB, user: User) -> list[dict]:
        project_for_user(db, project_id, user.id)
        return [
            serialize(x)
            for x in db.scalars(
                select(SkillRun)
                .where(SkillRun.project_id == project_id)
                .order_by(SkillRun.created_at.desc())
            )
        ]

    @app.post("/api/projects/{project_id}/runs", status_code=201)
    def new_run(
        project_id: str, payload: RunInput, db: DB, user: User
    ) -> dict:
        from projects.jobs import enqueue_run

        project_for_user(db, project_id, user.id)
        return serialize(
            enqueue_run(db, app.state, project_id, user.id, payload)
        )

    def owned_run(
        db: Session, user: Account, run_id: str, *, lock: bool = False
    ) -> SkillRun:
        statement = select(SkillRun).where(SkillRun.id == run_id)
        if lock:
            statement = statement.with_for_update()
        run = db.scalar(statement)
        if run is None:
            raise Problem(404, "실행을 찾을 수 없습니다.")
        project_for_user(db, run.project_id, user.id)
        return run

    @app.get("/api/runs/{run_id}")
    def run_detail(run_id: str, db: DB, user: User) -> dict:
        return serialize(owned_run(db, user, run_id))

    @app.post("/api/runs/{run_id}/cancel")
    def cancel(run_id: str, db: DB, user: User) -> dict:
        from projects.jobs import event

        run = owned_run(db, user, run_id, lock=True)
        if run.status in ("queued", "running", "review_ready"):
            run.status = "cancelled"
            event(run, "cancelled")
        db.flush()
        return serialize(run)

    @app.post("/api/runs/{run_id}/retry")
    def retry(run_id: str, db: DB, user: User) -> dict:
        from projects.jobs import event

        run = owned_run(db, user, run_id, lock=True)
        if run.status not in ("failed", "cancelled"):
            raise Problem(409, "실패·취소된 실행만 재개할 수 있습니다.")
        if run.attempt >= 3:
            raise Problem(
                409,
                "재시도 한도입니다. 입력을 검토한 뒤 새 실행을 만들어 주세요.",
            )
        run.status = "queued"
        run.error = None
        event(run, "queued", "사용자 요청으로 같은 입력·스킬을 재개합니다.")
        db.flush()
        return serialize(run)

    @app.post("/api/runs/{run_id}/apply")
    def apply(run_id: str, payload: ApplyInput, db: DB, user: User) -> dict:
        from projects.jobs import apply_result

        run = owned_run(db, user, run_id, lock=True)
        apply_result(
            db,
            run,
            user.id,
            payload.selected_indices,
            apply_document=payload.apply_document,
        )
        return serialize(run)

    @app.get("/api/items/{item_id}/portable")
    def portable(item_id: str, db: DB, user: User) -> Response:
        from projects.portable import export_document

        item = item_for_user(db, item_id, user.id)
        content = export_document(db, app.state, item)
        return Response(
            content,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="document-{item.id}.zip"'
            },
        )

    @app.post("/api/items/{item_id}/reconnect")
    def reconnect(
        item_id: str, payload: ReconnectInput, db: DB, user: User
    ) -> dict:
        from projects.portable import reconnect_document

        item = item_for_user(db, item_id, user.id, lock=True)
        return reconnect_document(db, item, payload)

    @app.get("/api/projects/{project_id}/export")
    def export(project_id: str, db: DB, user: User) -> Response:
        from projects.portable import export_project

        project = project_for_user(db, project_id, user.id)
        return Response(
            export_project(db, project),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="project-{project.id}.zip"'
            },
        )

    if settings.web_dir is not None:
        from starlette.staticfiles import StaticFiles

        app.mount(
            "/", StaticFiles(directory=settings.web_dir, html=True), name="web"
        )
    return app
