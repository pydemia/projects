"""Prepare private credentials for the existing Projects server."""

import argparse
import json
import os
import secrets
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / ".projects" / "deployment"
REMOTE = "/home/pydemia/git/projects/.secrets"


def _send(name: str, content: bytes) -> None:
    if name not in {"server.env", "projects.local.yaml", "auth.json"}:
        raise ValueError("Unexpected deployment credential name.")
    subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "codex-devbox",
            f"umask 077; cat > {REMOTE}/{name}; chmod 600 {REMOTE}/{name}",
        ],
        input=content,
        capture_output=True,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-hash", required=True)
    args = parser.parse_args()
    source_hash = args.source_hash
    if len(source_hash) != 64 or any(
        character not in "0123456789abcdef" for character in source_hash
    ):
        raise ValueError("Invalid deployment source hash.")
    PRIVATE.mkdir(parents=True, exist_ok=True)
    pg_password = PRIVATE / "postgres-password"
    if not pg_password.exists():
        pg_password.write_text(secrets.token_hex(32), encoding="ascii")
    password = pg_password.read_text(encoding="ascii")
    if len(password) != 64 or any(
        char not in "0123456789abcdef" for char in password
    ):
        raise ValueError("Invalid private PostgreSQL password.")

    account = PRIVATE / "account-password"
    if not account.exists():
        account.write_text(secrets.token_urlsafe(36), encoding="ascii")
    if len(account.read_text(encoding="ascii")) < 32:
        raise ValueError("Invalid private account password.")

    environment = (
        f"POSTGRES_PASSWORD={password}\n"
        f"PROJECTS_DATABASE_URL=postgresql+psycopg://projects:{password}@db:5432/projects\n"
        f"PROJECTS_IMAGE=pydemia-projects:{source_hash[:16]}\n"
    ).encode("ascii")
    config = (
        b"llm:\n"
        b"  provider: codex_login\n"
        b"  auth_file: /run/secrets/auth.json\n"
        b"  timeout_seconds: 120\n"
    )
    auth_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    auth_source = auth_home / "auth.json"
    auth = auth_source.read_bytes()
    if len(auth) > 256 * 1024 or not isinstance(json.loads(auth), dict):
        raise ValueError("Codex authentication source is invalid.")

    _send("server.env", environment)
    _send("projects.local.yaml", config)
    _send("auth.json", auth)
    (PRIVATE / "access.txt").write_text(
        "Projects: https://projects.pydemia.ai\n"
        "Username: pydemia\n"
        f"Password: {account.read_text(encoding='ascii')}\n",
        encoding="utf-8",
    )
    print(
        "Private server configuration transferred. Access details are in .projects/deployment/access.txt."
    )


if __name__ == "__main__":
    main()
