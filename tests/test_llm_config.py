import json

import pytest

from projects.config import ConfigurationError, Settings


def test_default_login(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for name in (
        "PROJECTS_CONFIG",
        "PROJECTS_LLM_PROVIDER",
        "PROJECTS_LLM_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    assert Settings.from_env().llm_provider == "codex_login"


def test_yaml_auth_relative_and_redaction(monkeypatch, tmp_path):
    path = tmp_path / "settings.yaml"
    path.write_text("llm:\n  auth_file: auth.json\n  model: private-model\n")
    monkeypatch.setenv("PROJECTS_CONFIG", str(path))
    settings = Settings.from_env()
    assert settings.llm_auth_file == tmp_path / "auth.json"
    assert "private-model" not in repr(settings)
    assert "auth.json" not in repr(settings)


@pytest.mark.parametrize(
    "content",
    [
        "llm:\n  provider: codex_login\n  provider: other\n",
        "llm:\n  auth_file: a\n  auth_inline: {}\n",
        "llm: !!python/object:builtins.object {}",
        "llm:\n  api_key: synthetic-secret\n",
        "llm:\n  timeout_seconds: .nan\n",
        "llm:\n  base_url: https://user:synthetic-secret@example.com\n",
    ],
)
def test_invalid_yaml_safe_errors(monkeypatch, tmp_path, content):
    path = tmp_path / "settings.yaml"
    path.write_text(content)
    monkeypatch.setenv("PROJECTS_CONFIG", str(path))
    with pytest.raises(ConfigurationError) as error:
        Settings.from_env()
    assert "synthetic-secret" not in str(error.value)


def test_inline_and_api_override(monkeypatch, tmp_path):
    path = tmp_path / "settings.yaml"
    path.write_text(
        json.dumps(
            {
                "llm": {
                    "provider": "openai_compatible",
                    "api_key": "synthetic-secret",
                    "model": "model-a",
                }
            }
        )
    )
    monkeypatch.setenv("PROJECTS_CONFIG", str(path))
    monkeypatch.setenv("PROJECTS_LLM_MODEL", "model-b")
    settings = Settings.from_env()
    assert settings.llm_model == "model-b"
    assert "synthetic-secret" not in repr(settings)
