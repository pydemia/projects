from dataclasses import replace
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from projects.api import create_app
from projects.auth import LoginLimiter
from projects.config import ConfigurationError, Settings


def test_login_attempt_window_is_bounded_and_recovers():
    now = [100.0]
    limiter = LoginLimiter(clock=lambda: now[0])
    assert all(limiter.allowed("peer") for _ in range(10))
    assert not limiter.allowed("peer")
    assert limiter.allowed("other")
    now[0] += 60
    assert limiter.allowed("peer")
    assert len(limiter.peers) == 1


def test_closed_registration_keeps_existing_login(app, client):
    deployed = create_app(
        replace(
            app.state.settings, registration_enabled=False, secure_cookies=True
        ),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )
    with TestClient(deployed, base_url="https://projects.example") as browser:
        assert browser.get("/api/auth/options").json() == {
            "registration_enabled": False,
            "auth_mode": "password",
        }
        response = browser.post(
            "/api/auth/register",
            json={"username": "blocked", "password": "synthetic-password"},
        )
        assert response.status_code == 403
        response = browser.post(
            "/api/auth/login",
            json={"username": "tester", "password": "test-password-long"},
        )
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        assert "HttpOnly" in response.headers["set-cookie"]
        assert browser.get("/api/projects").status_code == 200


def test_built_web_does_not_mask_api_routes_or_expose_parent(app, tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<title>Projects deployment</title>")
    favicon = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'
    (web / "favicon.svg").write_bytes(favicon)
    (tmp_path / "private.txt").write_text("synthetic-private")
    deployed = create_app(
        replace(app.state.settings, web_dir=web),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )
    with TestClient(deployed) as browser:
        assert "Projects deployment" in browser.get("/").text
        icon_response = browser.get("/favicon.svg")
        assert icon_response.status_code == 200
        assert icon_response.headers["content-type"].startswith(
            "image/svg+xml"
        )
        assert icon_response.content == favicon
        assert browser.get("/health").json() == {"status": "ok"}
        assert browser.get("/api/projects").status_code == 401
        assert browser.get("/%2e%2e/private.txt").status_code == 404


def test_deployment_settings(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PROJECTS_REGISTRATION_ENABLED", "false")
    monkeypatch.setenv("PROJECTS_SECURE_COOKIES", "true")
    monkeypatch.setenv("PROJECTS_WEB_DIR", "web-dist")
    settings = Settings.from_env()
    assert settings.registration_enabled is False
    assert settings.secure_cookies is True
    assert str(settings.web_dir) == "web-dist"


def test_microsoft_proxy_identity_binds_to_existing_account(app, client):
    deployed = create_app(
        replace(
            app.state.settings,
            registration_enabled=False,
            secure_cookies=True,
            proxy_auth_email="pydemia@pydemia.ai",
            proxy_auth_username="tester",
        ),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )
    with TestClient(deployed, base_url="https://projects.example") as browser:
        assert browser.get("/api/auth/options").json() == {
            "registration_enabled": False,
            "auth_mode": "microsoft",
        }
        assert browser.get("/api/session").status_code == 401
        assert (
            browser.get(
                "/api/session",
                headers={"X-Forwarded-Email": "other@pydemia.ai"},
            ).status_code
            == 401
        )
        response = browser.get(
            "/api/session",
            headers={"X-Forwarded-Email": "pydemia@pydemia.ai"},
        )
        assert response.status_code == 200
        assert response.json()["user"]["username"] == "tester"
        assert "Secure" in response.headers["set-cookie"]
        assert browser.get("/api/projects").status_code == 401
        assert (
            browser.get(
                "/api/projects",
                headers={"X-Forwarded-Email": "pydemia@pydemia.ai"},
            ).status_code
            == 200
        )
        assert (
            browser.post(
                "/api/auth/login",
                headers={"X-Forwarded-Email": "pydemia@pydemia.ai"},
                json={"username": "tester", "password": "test-password-long"},
            ).status_code
            == 403
        )


def test_proxy_auth_configuration_fails_closed(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PROJECTS_PROXY_AUTH_EMAIL", "pydemia@pydemia.ai")
    with pytest.raises(ConfigurationError):
        Settings.from_env()
    monkeypatch.setenv("PROJECTS_SECURE_COOKIES", "true")
    monkeypatch.setenv("PROJECTS_REGISTRATION_ENABLED", "false")
    settings = Settings.from_env()
    assert settings.proxy_auth_email == "pydemia@pydemia.ai"
    assert settings.proxy_auth_username == "pydemia"


def test_production_proxy_is_the_only_host_port():
    compose = yaml.safe_load(Path("compose.production.yaml").read_text())
    services = compose["services"]
    assert "ports" not in services["app"]
    assert "ports" not in services["db"]
    assert services["oauth2-proxy"]["ports"] == ["127.0.0.1:14323:4180"]
    assert compose["networks"]["backend"]["internal"] is True
    assert services["oauth2-proxy"]["depends_on"]["app"] == {
        "condition": "service_healthy"
    }
    assert services["app"]["environment"]["PROJECTS_PROXY_AUTH_EMAIL"] == (
        "pydemia@pydemia.ai"
    )
    assert "139.59.246.134" not in Path("deploy/projects.caddy").read_text()
