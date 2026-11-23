"""Render public proxy configuration; no credential values are read or written."""

import json
from pathlib import Path

from projects.entra_policy import load_entra_policy, proxy_configuration

root = Path(__file__).resolve().parents[1]
policy = load_entra_policy(root / "deploy/entra-policy.json")
(root / "deploy/entra-proxy.json").write_text(
    json.dumps(proxy_configuration(policy), indent=4) + "\n", encoding="utf-8"
)
print("Rendered public Entra proxy policy.")
