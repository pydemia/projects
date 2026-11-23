from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from projects.api import create_app
from projects.database import Account
from projects.entra_policy import EntraPolicy, EntraTenant, load_entra_policy

PRIMARY = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


def headers(tenant=PRIMARY, subject="member", email="member@pydemia.ai"):
    return {
        "X-Forwarded-Email": email,
        "X-Forwarded-User": subject,
        "X-Projects-Entra-Tenant": tenant,
        "X-Projects-Entra-Issuer": f"https://login.microsoftonline.com/{tenant}/v2.0",
    }


@pytest.fixture
def realm_app(app, client):
    return create_app(
        replace(
            app.state.settings,
            registration_enabled=False,
            secure_cookies=True,
            proxy_auth_email="pydemia@pydemia.ai",
            proxy_auth_username="tester",
            proxy_auth_domain="pydemia.ai",
            proxy_auth_policy=EntraPolicy(
                PRIMARY,
                (
                    EntraTenant(PRIMARY, "Primary", ("pydemia.ai",)),
                    EntraTenant(
                        OTHER, "Other", ("pydemia.ai", "other.example")
                    ),
                ),
            ),
        ),
        engine=app.state.engine,
        resolver=app.state.resolver,
        runner=app.state.runner,
    )


def test_same_subject_and_email_in_different_tenants_stay_private(realm_app):
    with TestClient(realm_app, base_url="https://projects.example") as first:
        first.headers.update(headers())
        session = first.get("/api/session")
        assert session.status_code == 200
        first.headers["X-CSRF-Token"] = session.json()["csrf_token"]
        project = first.post("/api/projects", json={"name": "Private"}).json()
        task = first.post(
            f"/api/projects/{project['id']}/tasks/quick",
            json={"title": "Private task", "state": "todo"},
        )
        assert task.status_code == 201
        with TestClient(
            realm_app, base_url="https://projects.example"
        ) as second:
            second.headers.update(headers(OTHER))
            other = second.get("/api/session")
            assert other.status_code == 200
            assert other.json()["user"]["id"] != session.json()["user"]["id"]
            second.headers["X-CSRF-Token"] = other.json()["csrf_token"]
            assert second.get("/api/projects").json() == []
            for path in [
                f"/api/projects/{project['id']}",
                f"/api/projects/{project['id']}/export",
                f"/api/items/{task.json()['id']}",
            ]:
                assert second.get(path).status_code == 404
            assert (
                second.patch(
                    f"/api/projects/{project['id']}",
                    json={"expected_version": 1, "name": "Taken"},
                ).status_code
                == 404
            )
        identity = session.json()["user"]
        first.headers.update(headers(email="renamed@pydemia.ai"))
        assert first.get("/api/session").json()["user"] == identity
        assert first.get("/api/projects").json()[0]["name"] == "Private"


@pytest.mark.parametrize(
    "patch",
    [
        {"X-Projects-Entra-Tenant": ""},
        {"X-Projects-Entra-Issuer": ""},
        {"X-Projects-Entra-Tenant": "33333333-3333-4333-8333-333333333333"},
        {"X-Projects-Entra-Tenant": OTHER},
        {"X-Projects-Entra-Issuer": f"https://evil.example/{PRIMARY}/v2.0"},
        {
            "X-Projects-Entra-Issuer": f"https://login.microsoftonline.com/{PRIMARY}/v2.0/"
        },
        {"X-Forwarded-User": ""},
        {"X-Forwarded-Email": "member@evil.example"},
    ],
)
def test_tenant_headers_are_required_and_match_verified_issuer(
    realm_app, patch
):
    with TestClient(realm_app, base_url="https://projects.example") as browser:
        assert (
            browser.get(
                "/api/session", headers={**headers(), **patch}
            ).status_code
            == 401
        )
    with Session(realm_app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Account)) == 1


def test_existing_subject_migrates_only_in_original_tenant(realm_app):
    with Session(realm_app.state.engine) as db, db.begin():
        account = db.scalar(
            select(Account).where(Account.username == "tester")
        )
        account.entra_subject = "existing-owner"
        original_id = account.id
    with TestClient(realm_app, base_url="https://projects.example") as owner:
        owner.headers.update(
            headers(subject="existing-owner", email="pydemia@pydemia.ai")
        )
        assert owner.get("/api/session").json()["user"]["id"] == original_id
        owner.headers.update(
            headers(subject="impostor", email="pydemia@pydemia.ai")
        )
        assert owner.get("/api/session").status_code == 401
    with TestClient(realm_app, base_url="https://projects.example") as foreign:
        foreign.headers.update(
            headers(OTHER, "existing-owner", "pydemia@pydemia.ai")
        )
        response = foreign.get("/api/session")
        assert response.status_code == 200
        assert response.json()["user"]["id"] != original_id


def test_concurrent_first_login_converges_without_orphan_accounts(realm_app):
    def login(_):
        with TestClient(
            realm_app, base_url="https://projects.example"
        ) as browser:
            response = browser.get("/api/session", headers=headers())
            assert response.status_code == 200
            return response.json()["user"]["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        identities = list(pool.map(login, range(4)))
    assert len(set(identities)) == 1
    with Session(realm_app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Account)) == 2


def test_policy_rejects_wildcards_duplicates_and_unknown_fields(tmp_path):
    import json

    original = json.loads(Path("deploy/entra-policy.json").read_text())
    mutations = [
        {**original, "extra": "value"},
        {**original, "tenants": []},
        {**original, "tenants": original["tenants"] * 2},
        {
            **original,
            "tenants": [{**original["tenants"][0], "email_domains": ["*"]}],
        },
        {**original, "legacy_tenant_id": OTHER},
        {**original, "tenants": [{**original["tenants"][0], "id": "common"}]},
    ]
    path = tmp_path / "policy.json"
    for value in mutations:
        path.write_text(json.dumps(value))
        with pytest.raises(ValueError, match="Invalid Entra tenant policy"):
            load_entra_policy(path)
