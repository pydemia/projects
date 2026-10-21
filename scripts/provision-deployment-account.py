"""Create the private server account without putting its password in arguments."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PASSWORD = ROOT / ".projects" / "deployment" / "account-password"
REMOTE = (
    "cd /home/pydemia/git/projects && "
    "docker compose --env-file .secrets/server.env "
    "-f compose.production.yaml exec -T app "
    "uv run --no-sync projects create-user "
    "--username pydemia --password-stdin"
)


def main() -> None:
    password = PASSWORD.read_bytes()
    if len(password) < 32:
        raise ValueError("Deployment password is missing.")
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "codex-devbox", REMOTE],
        input=password,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("Private account provisioning failed.")
    print("Private Projects account provisioned.")


if __name__ == "__main__":
    main()
