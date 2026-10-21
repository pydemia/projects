"""Transfer an Entra client credential without command-line or log disclosure."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_FILE = ROOT / ".projects" / "deployment" / "entra-client.json"
REMOTE_COMMAND = "python3 /home/pydemia/git/projects/deploy/activate-entra.py"


def main() -> None:
    credential = json.loads(PRIVATE_FILE.read_text(encoding="utf-8"))
    if set(credential) != {"client_id", "tenant_id", "client_secret"}:
        raise ValueError("Unexpected private credential fields.")
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "codex-devbox", REMOTE_COMMAND],
        input=json.dumps(credential).encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("Could not activate the Entra client credential.")
    print("Entra client credential transferred to private server settings.")


if __name__ == "__main__":
    main()
