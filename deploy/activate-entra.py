"""Atomically install an approved Entra client credential from standard input."""

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from uuid import UUID

ENV_FILE = Path("/home/pydemia/git/projects/.secrets/oauth.env")
TENANT = UUID("fb44f64f-973f-480d-ab48-f30f3bababb6")
SECRET_PATTERN = re.compile(r"[A-Za-z0-9._~-]{30,256}\Z")


def main() -> None:
    data = json.load(sys.stdin)
    if UUID(data["tenant_id"]) != TENANT:
        raise ValueError("Unexpected Entra tenant.")
    client_id = str(UUID(data["client_id"]))
    secret = data["client_secret"]
    if not isinstance(secret, str) or not SECRET_PATTERN.fullmatch(secret):
        raise ValueError("Unexpected client secret format.")

    original = ENV_FILE.read_text(encoding="utf-8").splitlines()
    keys = [line.split("=", 1)[0] for line in original]
    required = {
        "OAUTH2_PROXY_CLIENT_ID",
        "OAUTH2_PROXY_CLIENT_SECRET",
        "OAUTH2_PROXY_COOKIE_SECRET",
        "OAUTH2_PROXY_OIDC_ISSUER_URL",
    }
    if set(keys) != required or len(keys) != len(required):
        raise ValueError("Unexpected OAuth environment keys.")
    issuer = next(
        line.split("=", 1)[1]
        for line in original
        if line.startswith("OAUTH2_PROXY_OIDC_ISSUER_URL=")
    )
    if issuer != f"https://login.microsoftonline.com/{TENANT}/v2.0":
        raise ValueError("Unexpected Entra issuer.")

    updated = []
    for line in original:
        key = line.split("=", 1)[0]
        if key == "OAUTH2_PROXY_CLIENT_ID":
            updated.append(f"{key}={client_id}")
        elif key == "OAUTH2_PROXY_CLIENT_SECRET":
            updated.append(f"{key}={secret}")
        else:
            updated.append(line)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=ENV_FILE.parent,
        prefix=".oauth-",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        os.chmod(temporary, 0o600)
        output.write("\n".join(updated) + "\n")
    os.replace(temporary, ENV_FILE)
    print("Entra client credential installed in private server settings.")


if __name__ == "__main__":
    main()
