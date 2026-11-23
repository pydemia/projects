"""One public policy for the Entra proxy and application identity boundary."""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"


@dataclass(frozen=True)
class EntraTenant:
    id: str
    name: str
    email_domains: tuple[str, ...]


@dataclass(frozen=True)
class EntraPolicy:
    legacy_tenant_id: str
    tenants: tuple[EntraTenant, ...]

    @property
    def authority(self) -> str:
        tenant = self.tenants[0].id
        if len(self.tenants) > 1:
            tenant = (
                "common"
                if any(row.id == CONSUMER_TENANT for row in self.tenants)
                else "organizations"
            )
        return f"https://login.microsoftonline.com/{tenant}/v2.0"


def load_entra_policy(path: Path) -> EntraPolicy:
    """Reject unknown/wildcard issuers and malformed policy without source values."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if set(raw) != {"schema_version", "legacy_tenant_id", "tenants"}:
            raise ValueError
        if (
            type(raw["schema_version"]) is not int
            or raw["schema_version"] != 1
        ):
            raise ValueError
        if (
            not isinstance(raw["tenants"], list)
            or not 1 <= len(raw["tenants"]) <= 32
        ):
            raise ValueError
        tenants = []
        for row in raw["tenants"]:
            if set(row) != {"id", "name", "email_domains"}:
                raise ValueError
            tenant_id = str(UUID(row["id"]))
            if row["id"] != tenant_id:
                raise ValueError
            name = row["name"]
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                raise ValueError
            domains = row["email_domains"]
            if not isinstance(domains, list) or not 1 <= len(domains) <= 32:
                raise ValueError
            if any(
                not isinstance(domain, str)
                or not re.fullmatch(
                    r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
                    domain,
                )
                for domain in domains
            ):
                raise ValueError
            tenants.append(
                EntraTenant(tenant_id, name.strip(), tuple(domains))
            )
        ids = [row.id for row in tenants]
        legacy = str(UUID(raw["legacy_tenant_id"]))
        if len(ids) != len(set(ids)) or legacy not in ids:
            raise ValueError
        return EntraPolicy(legacy, tuple(tenants))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        raise ValueError("Invalid Entra tenant policy.") from None


def proxy_configuration(policy: EntraPolicy) -> dict:
    """JSON is also valid YAML; credentials are substituted only inside the proxy."""
    return {
        "server": {"bindAddress": "0.0.0.0:4180", "secureBindAddress": "-"},
        "upstreamConfig": {
            "upstreams": [
                {
                    "id": "projects",
                    "path": "/",
                    "uri": "http://app:8000/",
                    "passHostHeader": True,
                }
            ],
        },
        "providers": [
            {
                "id": "entra",
                "provider": "entra-id",
                "clientID": "${OAUTH2_PROXY_CLIENT_ID}",
                "clientSecret": "${OAUTH2_PROXY_CLIENT_SECRET}",
                "scope": "openid profile email",
                "code_challenge_method": "S256",
                "loginURLParameters": [
                    {"name": "prompt", "default": ["select_account"]}
                ],
                "additionalClaims": ["tid", "iss"],
                "oidcConfig": {
                    "issuerURL": policy.authority,
                    "emailClaim": "preferred_username",
                    "userIDClaim": "sub",
                    "insecureSkipNonce": False,
                    "insecureSkipIssuerVerification": len(policy.tenants) > 1,
                },
                "microsoftEntraIDConfig": {
                    "allowedTenants": [row.id for row in policy.tenants]
                },
            }
        ],
        "injectRequestHeaders": [
            {
                "name": name,
                "preserveRequestValue": False,
                "values": [{"claimSource": {"claim": claim}}],
            }
            for name, claim in (
                ("X-Forwarded-User", "user"),
                ("X-Forwarded-Email", "email"),
                ("X-Forwarded-Preferred-Username", "preferred_username"),
                ("X-Projects-Entra-Tenant", "tid"),
                ("X-Projects-Entra-Issuer", "iss"),
            )
        ],
    }
