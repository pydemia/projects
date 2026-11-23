"""Real pinned proxy with synthetic signed OIDC tokens; never uses Entra credentials.

Run: uv run --with cryptography python scripts/verify-entra-proxy.py
"""

import base64
import copy
import hashlib
import json
import os
import secrets
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import yaml
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from projects.entra_policy import EntraPolicy, EntraTenant, proxy_configuration

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
CLIENT = "33333333-3333-4333-8333-333333333333"


def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    private_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048
    )
    numbers = private_key.public_key().public_numbers()
    jwks = {
        "keys": [
            {
                "kty": "RSA",
                "kid": "qa-key",
                "alg": "RS256",
                "use": "sig",
                "n": b64(numbers.n.to_bytes(256)),
                "e": b64(numbers.e.to_bytes(3)),
            }
        ]
    }
    state = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send_json(self, value):
            data = json.dumps(value).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/jwks":
                self.send_json(jwks)
            else:
                self.send_json(
                    {
                        name: self.headers.get(name)
                        for name in (
                            "X-Forwarded-User",
                            "X-Forwarded-Email",
                            "X-Projects-Entra-Tenant",
                            "X-Projects-Entra-Issuer",
                            "Authorization",
                            "X-Forwarded-Access-Token",
                        )
                    }
                )

        def do_POST(self):
            form = parse_qs(
                self.rfile.read(int(self.headers["Content-Length"])).decode()
            )
            assert (
                b64(hashlib.sha256(form["code_verifier"][0].encode()).digest())
                == state["challenge"]
            )
            now = int(time.time())
            claims = {
                "iss": f"https://login.microsoftonline.com/{state['tenant']}/v2.0",
                "tid": state["tenant"],
                "sub": "qa-subject",
                "aud": CLIENT,
                "iat": now,
                "nbf": now - 5,
                "exp": now + 300,
                "nonce": state["nonce"],
                "preferred_username": "member@pydemia.ai",
            }
            if state.get("invalid") == "nonce":
                claims["nonce"] = "wrong-nonce"
            if state.get("invalid") == "audience":
                claims["aud"] = "wrong-client"
            if state.get("email"):
                claims["email"] = "member@pydemia.ai"
            payload = (
                b64(json.dumps({"alg": "RS256", "kid": "qa-key"}).encode())
                + "."
                + b64(json.dumps(claims).encode())
            )
            signature = private_key.sign(
                payload.encode(), padding.PKCS1v15(), hashes.SHA256()
            )
            self.send_json(
                {
                    "id_token": payload + "." + b64(signature),
                    "access_token": "synthetic-only",
                    "token_type": "Bearer",
                    "expires_in": 300,
                }
            )

    server = ThreadingHTTPServer(("0.0.0.0", free_port()), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://host.docker.internal:{server.server_port}"
    production_proxy = yaml.safe_load(
        (ROOT / "compose.production.yaml").read_text()
    )["services"]["oauth2-proxy"]
    image = production_proxy["image"]
    anonymous_routes = [
        flag
        for flag in production_proxy["command"]
        if flag.startswith("--skip-auth-route=")
    ]
    policy = EntraPolicy(
        PRIMARY,
        (
            EntraTenant(PRIMARY, "One", ("pydemia.ai",)),
            EntraTenant(OTHER, "Two", ("pydemia.ai",)),
        ),
    )
    template = proxy_configuration(policy)
    template["upstreamConfig"]["upstreams"][0]["uri"] = origin + "/"
    provider = template["providers"][0]
    provider["clientID"] = CLIENT
    provider["clientSecret"] = "synthetic-secret-only"
    provider["loginURL"] = origin + "/authorize"
    provider["redeemURL"] = origin + "/token"
    provider["skipClaimsFromProfileURL"] = True
    provider["oidcConfig"].update(skipDiscovery=True, jwksURL=origin + "/jwks")
    try:
        with tempfile.TemporaryDirectory(
            prefix="projects-entra-proxy-"
        ) as directory:
            for old, multi in [(True, False), (False, False), (False, True)]:
                config = copy.deepcopy(template)
                if not multi:
                    config["providers"][0]["oidcConfig"].update(
                        issuerURL=f"https://login.microsoftonline.com/{PRIMARY}/v2.0",
                        insecureSkipIssuerVerification=False,
                    )
                    config["providers"][0]["microsoftEntraIDConfig"][
                        "allowedTenants"
                    ] = [PRIMARY]
                config["providers"][0]["oidcConfig"]["emailClaim"] = (
                    "email" if old else "preferred_username"
                )
                config["providers"][0]["oidcConfig"]["userIDClaim"] = (
                    "email" if old else "sub"
                )
                path = Path(directory) / "config.json"
                path.write_text(json.dumps(config))
                port = free_port()
                name = "projects-entra-qa-" + secrets.token_hex(8)
                command = [
                    "docker",
                    "run",
                    "--pull=never",
                    "-d",
                    "--name",
                    name,
                    "-p",
                    f"127.0.0.1:{port}:4180",
                    "-v",
                    f"{path}:/etc/proxy.json:ro",
                    "-e",
                    "OAUTH2_PROXY_COOKIE_SECRET=" + b64(os.urandom(32)),
                    image,
                    "--alpha-config=/etc/proxy.json",
                    "--email-domain=" + ("pydemia.ai" if old else "*"),
                    "--cookie-secure=false",
                    "--cookie-name=projects_qa",
                    "--redirect-url="
                    + f"http://127.0.0.1:{port}/oauth2/callback",
                    "--request-logging=false",
                    "--auth-logging=false",
                ]
                command += ["--api-route=^/api"]
                if not old:
                    command += anonymous_routes
                launched = subprocess.run(
                    command, capture_output=True, text=True
                )
                assert launched.returncode == 0, "QA proxy launch failed"
                try:
                    base = f"http://127.0.0.1:{port}"
                    ready = False
                    for _ in range(80):
                        status = subprocess.run(
                            [
                                "docker",
                                "inspect",
                                name,
                                "--format",
                                "{{.State.Running}}",
                            ],
                            capture_output=True,
                            text=True,
                        )
                        if status.stdout.strip() != "true":
                            break
                        try:
                            ready = (
                                httpx.get(
                                    base + "/ping", timeout=1
                                ).status_code
                                == 200
                            )
                        except httpx.HTTPError:
                            pass
                        if ready:
                            break
                        time.sleep(0.15)
                    if not ready:
                        # This container contains synthetic data only.
                        logs = subprocess.run(
                            ["docker", "logs", name],
                            capture_output=True,
                            text=True,
                        )
                        raise RuntimeError(
                            "Synthetic proxy did not start: "
                            + logs.stderr[-1600:]
                        )
                    if not old:
                        with httpx.Client(
                            base_url=base, follow_redirects=True
                        ) as anonymous:
                            for public in [
                                "/",
                                "/assets/index-test.js",
                                "/assets/index-test.css",
                                "/favicon-dark-32.png",
                                "/api/auth/options",
                                "/health",
                            ]:
                                assert (
                                    anonymous.get(public).status_code == 200
                                ), public
                            for protected in [
                                "/api/session",
                                "/api/projects",
                                "/api/project-invitations/example/preview",
                                "/api/auth/options/other",
                                "/assets/%2e%2e/api/projects",
                                "/assets/index.js%2f..%2fapi%2fprojects",
                            ]:
                                assert (
                                    anonymous.get(protected).status_code != 200
                                ), protected
                            assert (
                                anonymous.post("/api/projects").status_code
                                == 401
                            )
                        print(
                            "PASS anonymous login shell/assets preserve protected data API and traversal boundary",
                            "multi" if multi else "single",
                        )
                    cases = [(PRIMARY, False, "")]
                    if not old:
                        cases += [
                            (PRIMARY, True, ""),
                            (PRIMARY, False, "nonce"),
                            (PRIMARY, False, "audience"),
                            (
                                "44444444-4444-4444-8444-444444444444",
                                False,
                                "tenant",
                            ),
                        ]
                        if multi:
                            cases += [(OTHER, False, "")]
                    for tenant, email, invalid in cases:
                        with httpx.Client(
                            base_url=base, follow_redirects=False
                        ) as browser:
                            auth = browser.get(
                                "/oauth2/start", params={"rd": "/qa"}
                            )
                            assert auth.status_code == 302
                            params = parse_qs(
                                urlsplit(auth.headers["location"]).query
                            )
                            assert params["prompt"] == ["select_account"]
                            assert params["code_challenge_method"] == ["S256"]
                            state.update(
                                tenant=tenant,
                                email=email,
                                invalid=invalid,
                                nonce=params["nonce"][0],
                                challenge=params["code_challenge"][0],
                            )
                            callback = browser.get(
                                "/oauth2/callback?"
                                + urlencode(
                                    {
                                        "code": "synthetic-code",
                                        "state": params["state"][0],
                                    }
                                )
                            )
                            if old:
                                if callback.status_code != 500:
                                    logs = subprocess.run(
                                        ["docker", "logs", name],
                                        capture_output=True,
                                        text=True,
                                    )
                                    raise AssertionError(
                                        f"Original synthetic callback status {callback.status_code}, location {callback.headers.get('location')}: "
                                        + (logs.stdout + logs.stderr)[-2400:]
                                    )
                                print(
                                    "PASS original missing-email callback reproduced HTTP 500"
                                )
                                continue
                            if invalid:
                                assert callback.status_code != 302, (
                                    f"invalid {invalid} was accepted"
                                )
                                assert browser.get("/qa").status_code != 200
                                print(
                                    "PASS rejected invalid",
                                    invalid,
                                    "multi" if multi else "single",
                                )
                                continue
                            assert callback.status_code == 302, (
                                f"fixed synthetic callback status {callback.status_code}"
                            )
                            result = browser.get(
                                "/qa",
                                headers={
                                    "X-Forwarded-User": "forged",
                                    "X-Forwarded-Email": "forged@evil.example",
                                    "X-Projects-Entra-Tenant": "forged",
                                    "X-Projects-Entra-Issuer": "forged",
                                },
                            )
                            assert result.status_code == 200, (
                                f"upstream status {result.status_code}"
                            )
                            data = result.json()
                            assert data["X-Forwarded-User"] == "qa-subject"
                            assert (
                                data["X-Forwarded-Email"]
                                == "member@pydemia.ai"
                            )
                            assert data["X-Projects-Entra-Tenant"] == tenant
                            assert (
                                data["X-Projects-Entra-Issuer"]
                                == f"https://login.microsoftonline.com/{tenant}/v2.0"
                            )
                            assert (
                                data["Authorization"] is None
                                and data["X-Forwarded-Access-Token"] is None
                            )
                            print(
                                "PASS fixed signed callback, tenant headers, spoof removal, no forwarded tokens",
                                "with email" if email else "without email",
                            )
                finally:
                    subprocess.run(
                        ["docker", "rm", "-f", name],
                        capture_output=True,
                        check=False,
                    )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
