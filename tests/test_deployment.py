from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from projects.api import create_app
from projects.auth import LoginLimiter
from projects.config import ConfigurationError, Settings
from projects.database import Account


@pytest.fixture
def domain_app(app, client):
    return create_app(
        replace(
            app.state.settings,
            registration_enabled=False,
            secure_cookies=True,
            proxy_auth_email="pydemia@pydemia.ai",
            proxy_auth_username="tester",
            proxy_auth_domain="pydemia.ai",
        ),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )


def entra_headers(email="member@pydemia.ai", subject="member-subject"):
    return {"X-Forwarded-Email": email, "X-Forwarded-User": subject}


def test_domain_login_provisions_isolated_accounts(domain_app):
    with TestClient(domain_app, base_url="https://projects.example") as owner:
        owner.headers.update(entra_headers("pydemia@pydemia.ai", "owner"))
        session = owner.get("/api/session").json()
        assert session["user"]["username"] == "tester"
        owner.headers["X-CSRF-Token"] = session["csrf_token"]
        project = owner.post("/api/projects", json={"name": "Private"}).json()
        with TestClient(
            domain_app, base_url="https://projects.example"
        ) as member:
            member.headers.update(entra_headers("Member@Pydemia.AI"))
            response = member.get("/api/session")
            assert response.status_code == 200
            identity = response.json()["user"]
            assert identity["username"] == "member@pydemia.ai"
            assert identity["id"] != session["user"]["id"]
            assert member.get("/api/projects").json() == []
            assert (
                member.get(f"/api/projects/{project['id']}").status_code == 404
            )
            assert member.get("/api/session").json()["user"] == identity
            member.headers.update(entra_headers("renamed@pydemia.ai"))
            assert member.get("/api/session").json()["user"] == identity
            member.headers.update(
                entra_headers("member@pydemia.ai", "new-subject")
            )
            assert member.get("/api/projects").status_code == 401
            replacement = member.get("/api/session").json()["user"]
            assert replacement["id"] != identity["id"]
            assert member.get("/api/projects").json() == []
        owner.headers.update(entra_headers("pydemia@pydemia.ai", "impostor"))
        assert owner.get("/api/session").status_code == 401


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"X-Forwarded-Email": "member@pydemia.ai"},
        entra_headers("member@example.com"),
        entra_headers("member@sub.pydemia.ai"),
        entra_headers("member@pydemia.ai.example.com"),
        entra_headers("member@@pydemia.ai"),
        entra_headers("member @pydemia.ai"),
        entra_headers("member@pydemia.ai,other@pydemia.ai"),
        entra_headers(subject="invalid subject"),
        entra_headers(subject="x" * 256),
    ],
)
def test_domain_login_rejects_untrusted_identity(domain_app, headers):
    with TestClient(
        domain_app, base_url="https://projects.example"
    ) as browser:
        assert browser.get("/api/session", headers=headers).status_code == 401
        assert (
            browser.post(
                "/api/auth/register",
                json={"username": "blocked", "password": "synthetic-password"},
            ).status_code
            == 403
        )
        assert (
            browser.post(
                "/api/auth/login",
                json={"username": "tester", "password": "test-password-long"},
            ).status_code
            == 403
        )
        assert (
            browser.get("/api/auth/options").json()["auth_mode"] == "microsoft"
        )
    with Session(domain_app.state.engine) as db:
        assert len(list(db.scalars(select(Account)))) == 1


def test_domain_first_login_is_idempotent_under_concurrency(domain_app):
    def sign_in(_):
        with TestClient(
            domain_app, base_url="https://projects.example"
        ) as browser:
            response = browser.get("/api/session", headers=entra_headers())
            assert response.status_code == 200
            return response.json()["user"]["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(sign_in, range(4)))
    assert len(set(ids)) == 1


def test_domain_login_never_claims_matching_local_username(domain_app):
    with Session(domain_app.state.engine) as db, db.begin():
        local = Account(
            username="member@pydemia.ai", password_hash="synthetic"
        )
        db.add(local)
        db.flush()
        local_id = local.id
    with TestClient(
        domain_app, base_url="https://projects.example"
    ) as browser:
        response = browser.get("/api/session", headers=entra_headers())
        assert response.status_code == 200
        assert response.json()["user"]["id"] != local_id


def test_domain_only_mode_and_long_email(domain_app):
    domain_app.state.settings = replace(
        domain_app.state.settings, proxy_auth_email=""
    )
    email = "m" * 70 + "@pydemia.ai"
    with TestClient(
        domain_app, base_url="https://projects.example"
    ) as browser:
        response = browser.get("/api/session", headers=entra_headers(email))
        assert response.status_code == 200
        assert len(response.json()["user"]["username"]) <= 80


def test_proxy_mapping_must_belong_to_allowed_domain(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PROJECTS_PROXY_AUTH_DOMAIN", "pydemia.ai")
    monkeypatch.setenv("PROJECTS_PROXY_AUTH_EMAIL", "owner@example.com")
    monkeypatch.setenv("PROJECTS_SECURE_COOKIES", "true")
    monkeypatch.setenv("PROJECTS_REGISTRATION_ENABLED", "false")
    with pytest.raises(ConfigurationError):
        Settings.from_env()


@pytest.mark.parametrize(
    "domain",
    [
        "*",
        "@pydemia.ai",
        "pydemia.ai.evil/",
        "pydemia.ai,example.com",
        "pydemia..ai",
    ],
)
def test_proxy_domain_configuration_rejects_invalid_domains(
    monkeypatch, tmp_path, domain
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PROJECTS_PROXY_AUTH_DOMAIN", domain)
    monkeypatch.setenv("PROJECTS_SECURE_COOKIES", "true")
    monkeypatch.setenv("PROJECTS_REGISTRATION_ENABLED", "false")
    with pytest.raises(ConfigurationError):
        Settings.from_env()


def test_proxy_domain_configuration_requires_secure_closed_registration(
    monkeypatch, tmp_path
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PROJECTS_PROXY_AUTH_DOMAIN", "Pydemia.AI")
    with pytest.raises(ConfigurationError):
        Settings.from_env()
    monkeypatch.setenv("PROJECTS_SECURE_COOKIES", "true")
    monkeypatch.setenv("PROJECTS_REGISTRATION_ENABLED", "false")
    settings = Settings.from_env()
    assert settings.proxy_auth_domain == "pydemia.ai"
    assert settings.proxy_auth_enabled


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
    assert (
        services["app"]["environment"]["PROJECTS_PROXY_AUTH_DOMAIN"]
        == "pydemia.ai"
    )
    command = services["oauth2-proxy"]["command"]
    assert "--email-domain=pydemia.ai" in command
    assert (
        "--entra-id-allowed-tenant=fb44f64f-973f-480d-ab48-f30f3bababb6"
        in command
    )
    assert not any(
        value.startswith("--authenticated-emails-file=") for value in command
    )
    assert "--insecure-oidc-skip-issuer-verification=true" not in command
    assert "--skip-auth-strip-headers=true" in command
    assert "--pass-user-headers=true" in command
    assert "139.59.246.134" not in Path("deploy/projects.caddy").read_text()
