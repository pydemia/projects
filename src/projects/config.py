"""Explicit process configuration; no credentials in serialized settings."""

import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(".projects"))
    database_url: str = field(
        repr=False,
        default=(
            "postgresql+psycopg://projects:projects@127.0.0.1:5432/projects"
        ),
    )
    registry_path: Path = field(
        default_factory=lambda: Path(
            "docs/planning/references/artifact-templates.json",
        ),
    )
    hub_url: str = "https://skills.pydemia.ai"
    llm_provider: str = "codex_login"
    llm_base_url: str = field(default="https://api.openai.com/v1", repr=False)
    llm_model: str = field(default="", repr=False)
    llm_api_key: str = field(default="", repr=False)
    llm_auth_file: Path | None = field(default=None, repr=False)
    llm_auth_inline: dict[str, Any] | None = field(default=None, repr=False)
    llm_timeout_seconds: float = 120
    secure_cookies: bool = False
    registration_enabled: bool = True
    proxy_auth_email: str = ""
    proxy_auth_username: str = "pydemia"
    web_dir: Path | None = None
    worker_enabled: bool = True
    session_seconds: int = 60 * 60 * 24 * 7
    max_request_bytes: int = 12 * 1024 * 1024

    @classmethod
    def from_env(cls) -> "Settings":
        llm = load_llm_config()
        data_dir = Path(os.getenv("PROJECTS_DATA_DIR", ".projects"))
        proxy_email = (
            os.getenv("PROJECTS_PROXY_AUTH_EMAIL", "").strip().lower()
        )
        proxy_username = os.getenv("PROJECTS_PROXY_AUTH_USERNAME", "pydemia")
        secure_cookies = os.getenv("PROJECTS_SECURE_COOKIES") == "true"
        registration_enabled = (
            os.getenv("PROJECTS_REGISTRATION_ENABLED", "true") == "true"
        )
        if proxy_email and (
            proxy_email.count("@") != 1
            or not proxy_username
            or registration_enabled
            or not secure_cookies
        ):
            raise ConfigurationError(
                "Proxy authentication requires one email, a username, "
                "closed registration, and secure cookies."
            )
        return cls(
            data_dir=data_dir,
            database_url=os.getenv(
                "PROJECTS_DATABASE_URL",
                "postgresql+psycopg://projects:projects@127.0.0.1:5432/projects",
            ),
            registry_path=Path(
                os.getenv(
                    "PROJECTS_REGISTRY_PATH",
                    "docs/planning/references/artifact-templates.json",
                ),
            ),
            **llm,
            secure_cookies=secure_cookies,
            registration_enabled=registration_enabled,
            proxy_auth_email=proxy_email,
            proxy_auth_username=proxy_username,
            web_dir=Path(os.environ["PROJECTS_WEB_DIR"])
            if os.getenv("PROJECTS_WEB_DIR")
            else None,
            worker_enabled=os.getenv("PROJECTS_WORKER", "true") != "false",
        )


class ConfigurationError(ValueError):
    """Configuration error containing no source values."""


class UniqueSafeLoader(yaml.SafeLoader):
    pass


def _mapping(loader: UniqueSafeLoader, node: yaml.MappingNode) -> dict:
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if not isinstance(key, str) or key in result:
            raise ConfigurationError(
                "Configuration keys must be unique strings."
            )
        result[key] = loader.construct_object(value_node)
    return result


UniqueSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _mapping,
)


def load_llm_config() -> dict[str, Any]:
    explicit = os.getenv("PROJECTS_CONFIG")
    path = Path(explicit or "projects.local.yaml").resolve()
    raw: Any = {}
    try:
        if path.exists():
            with path.open("rb") as stream:
                content = stream.read(256 * 1024 + 1)
            if len(content) > 256 * 1024:
                raise ConfigurationError("Configuration file is too large.")
            raw = yaml.load(content, Loader=UniqueSafeLoader)
        elif explicit:
            raise ConfigurationError("Configuration file was not found.")
    except (OSError, yaml.YAMLError, UnicodeError, RecursionError):
        raise ConfigurationError(
            "Configuration file could not be read."
        ) from None
    if not isinstance(raw, dict) or set(raw) - {"llm"}:
        raise ConfigurationError(
            "Configuration must contain only an llm mapping."
        )
    llm = raw.get("llm", {})
    allowed = {
        "provider",
        "base_url",
        "model",
        "api_key",
        "auth_file",
        "auth_inline",
        "timeout_seconds",
    }
    if not isinstance(llm, dict) or set(llm) - allowed:
        raise ConfigurationError("Invalid LLM configuration fields.")
    values = dict(llm)
    for key in ("provider", "base_url", "model", "api_key"):
        value = os.getenv("PROJECTS_LLM_" + key.upper())
        if value is not None:
            values[key] = value
    values.setdefault("provider", "codex_login")
    values.setdefault("base_url", "https://api.openai.com/v1")
    values.setdefault("model", "")
    values.setdefault("api_key", "")
    for key in ("provider", "base_url", "model", "api_key"):
        if not isinstance(values[key], str):
            raise ConfigurationError("LLM text settings must be strings.")
    if values["provider"] not in {
        "codex_login",
        "openai_compatible",
        "unconfigured",
    }:
        raise ConfigurationError("Unsupported LLM provider.")
    if "auth_file" in values and "auth_inline" in values:
        raise ConfigurationError("Specify only one authentication source.")
    if "auth_file" in values:
        if not isinstance(values["auth_file"], str) or not values["auth_file"]:
            raise ConfigurationError("Authentication file must be a path.")
        values["auth_file"] = (
            path.parent / Path(values["auth_file"]).expanduser()
        ).resolve()
    if "auth_inline" in values:
        auth = values["auth_inline"]
        try:
            if not isinstance(auth, dict) or not auth:
                raise ValueError()
            json.dumps(auth, allow_nan=False)
        except (ValueError, TypeError, RecursionError):
            raise ConfigurationError(
                "Authentication must be a JSON object."
            ) from None
    if values["provider"] != "codex_login" and (
        {"auth_file", "auth_inline"} & values.keys()
    ):
        raise ConfigurationError(
            "Codex authentication requires the Codex provider."
        )
    if values["provider"] == "codex_login" and values["api_key"]:
        raise ConfigurationError(
            "API keys require the OpenAI-compatible provider."
        )
    try:
        url = urlsplit(values["base_url"])
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError()
    except ValueError:
        raise ConfigurationError("Invalid LLM base URL.") from None
    timeout = values.get("timeout_seconds", 120)
    if (
        isinstance(timeout, bool)
        or not isinstance(timeout, (int, float))
        or not math.isfinite(timeout)
        or not 0 < timeout <= 300
    ):
        raise ConfigurationError(
            "LLM timeout must be within (0, 300] seconds."
        )
    return {"llm_" + key: value for key, value in values.items()}
