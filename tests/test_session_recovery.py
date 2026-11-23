"""Session metadata supports recovery without changing identity or CSRF rules."""

from dataclasses import replace
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from projects.api import create_app
from projects.auth import create_session, token_hash
from projects.database import Account, LoginSession, utcnow


def test_session_is_visible_to_other_connections_before_response_start(app):
    visible_at_response = []

    async def response_boundary(scope, receive, send):
        async def inspect_response(message):
            if (
                scope.get("path") == "/api/auth/register"
                and message["type"] == "http.response.start"
                and message["status"] == 201
            ):
                with Session(app.state.engine) as independent:
                    count = independent.scalar(
                        select(func.count()).select_from(LoginSession)
                    )
                    visible_at_response.append(count == 1)
            await send(message)

        await app(scope, receive, inspect_response)

    with TestClient(response_boundary) as browser:
        result = browser.post(
            "/api/auth/register",
            json={"username": "tester", "password": "test-password-long"},
        )
        assert result.status_code == 201
    assert visible_at_response == [True]


def test_password_sessions_report_auth_mode(app):
    with TestClient(app) as browser:
        registered = browser.post(
            "/api/auth/register",
            json={"username": "tester", "password": "test-password-long"},
        )
        assert registered.status_code == 201
        assert registered.json()["auth_mode"] == "password"
        identity = registered.json()["user"]
        assert browser.get("/api/session").json() == registered.json()
        browser.cookies.clear()
        logged_in = browser.post(
            "/api/auth/login",
            json={"username": "tester", "password": "test-password-long"},
        )
        assert logged_in.status_code == 200
        assert logged_in.json()["auth_mode"] == "password"
        assert logged_in.json()["user"] == identity
        assert browser.get("/api/session").json() == logged_in.json()


def test_expired_password_session_remains_unauthorized(app, client):
    with Session(app.state.engine) as db, db.begin():
        stored = db.get(
            LoginSession, token_hash(client.cookies["projects_session"])
        )
        stored.expires_at = utcnow() - timedelta(seconds=1)
    for path in ("/api/session", "/api/projects"):
        response = client.get(path)
        assert response.status_code == 401
        assert "set-cookie" not in response.headers
    assert (
        client.post("/api/projects", json={"name": "expired"}).status_code
        == 401
    )


@pytest.fixture
def proxy_app(app, client):
    return create_app(
        replace(
            app.state.settings,
            registration_enabled=False,
            secure_cookies=True,
            proxy_auth_email="owner@pydemia.ai",
            proxy_auth_username="tester",
            proxy_auth_domain="pydemia.ai",
        ),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )


def test_proxy_session_reuse_reports_mode_and_rejects_identity_change(
    proxy_app,
):
    with TestClient(proxy_app, base_url="https://projects.example") as browser:
        browser.headers.update(
            {
                "X-Forwarded-Email": "owner@pydemia.ai",
                "X-Forwarded-User": "owner",
            }
        )
        first = browser.get("/api/session")
        assert first.status_code == 200
        assert first.json()["auth_mode"] == "microsoft"
        assert "Secure" in first.headers["set-cookie"]
        assert "HttpOnly" in first.headers["set-cookie"]
        assert "SameSite=lax" in first.headers["set-cookie"]
        reused = browser.get("/api/session")
        assert reused.json() == first.json()
        assert "set-cookie" not in reused.headers
        browser.headers["X-Forwarded-User"] = "impostor"
        assert browser.get("/api/projects").status_code == 401
        assert browser.get("/api/session").status_code == 401
        del browser.headers["X-Forwarded-Email"]
        assert browser.get("/api/session").status_code == 401


@pytest.mark.parametrize(
    "cookie_state", ["missing", "invalid", "expired", "other"]
)
def test_proxy_session_recreation_preserves_owner_and_rotates_csrf(
    proxy_app, project, cookie_state
):
    with TestClient(proxy_app, base_url="https://projects.example") as browser:
        browser.headers.update(
            {
                "X-Forwarded-Email": "owner@pydemia.ai",
                "X-Forwarded-User": "owner",
            }
        )
        first = browser.get("/api/session").json()
        token = browser.cookies["projects_session"]
        browser.cookies.clear()
        if cookie_state == "expired":
            with Session(proxy_app.state.engine) as db, db.begin():
                stored = db.get(LoginSession, token_hash(token))
                stored.expires_at = utcnow() - timedelta(seconds=1)
        elif cookie_state == "other":
            with Session(proxy_app.state.engine) as db, db.begin():
                other = Account(username="other", password_hash="synthetic")
                db.add(other)
                db.flush()
                token, _ = create_session(db, other, 3600)
        elif cookie_state == "invalid":
            token = "synthetic-invalid-session"
        if cookie_state != "missing":
            browser.cookies.set("projects_session", token)
        assert browser.get("/api/projects").status_code == 401
        recovered = browser.get("/api/session")
        assert recovered.status_code == 200
        assert recovered.json()["auth_mode"] == "microsoft"
        assert recovered.json()["user"] == first["user"]
        assert recovered.json()["csrf_token"] != first["csrf_token"]
        assert "set-cookie" in recovered.headers
        assert [row["id"] for row in browser.get("/api/projects").json()] == [
            project["id"]
        ]
        assert (
            browser.post(
                "/api/projects",
                json={"name": "stale CSRF"},
                headers={"X-CSRF-Token": first["csrf_token"]},
            ).status_code
            == 403
        )
        assert (
            browser.post(
                "/api/projects",
                json={"name": "explicitly resumed"},
                headers={"X-CSRF-Token": recovered.json()["csrf_token"]},
            ).status_code
            == 201
        )
