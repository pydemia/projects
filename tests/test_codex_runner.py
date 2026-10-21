import json
from pathlib import Path

import pytest

from projects.codex_runner import CodexLoginRunner
from projects.config import Settings
from projects.runtime.models import RuntimeFailure

RESULT = {
    "document": "ok",
    "review": "",
    "requirements": [],
    "assumptions": [],
    "questions": [],
    "source_ids": [],
}


def fake_process(monkeypatch, event=None, returncode=0):
    monkeypatch.setattr(CodexLoginRunner, "_environment", lambda self: dict())
    observed = {}

    class Process:
        def __init__(self, command, **kwargs):
            observed.update(kwargs)
            observed["command"] = command
            self.returncode = returncode
            Path(
                command[command.index("--output-last-message") + 1]
            ).write_text(json.dumps(RESULT))
            if event:
                kwargs["stdout"].write(json.dumps(event).encode() + b"\n")
                kwargs["stdout"].flush()

        def poll(self):
            return self.returncode

    monkeypatch.setattr(
        "projects.codex_runner._command", lambda: ["codex.exe"]
    )
    monkeypatch.setattr("projects.codex_runner.subprocess.Popen", Process)
    return observed


def test_process_isolated_and_schema(monkeypatch):
    observed = fake_process(monkeypatch)
    runner = CodexLoginRunner(Settings())
    assert runner.run([{"role": "user", "content": "hi"}]).document == "ok"
    command = observed["command"]
    assert "--ignore-user-config" in command
    assert "features.shell_tool=false" in command
    assert observed["shell"] is False
    assert not Path(observed["cwd"]).exists()


def test_explicit_auth_preserved(monkeypatch, tmp_path):
    original_environment = CodexLoginRunner._environment
    observed = fake_process(monkeypatch)
    monkeypatch.setattr(CodexLoginRunner, "_environment", original_environment)
    source = tmp_path / "auth.json"
    original = '{"OPENAI_API_KEY": "synthetic-test-only"}'
    source.write_text(original)
    runner = CodexLoginRunner(Settings(llm_auth_file=source))
    runner.run([])
    home = Path(observed["env"]["CODEX_HOME"])
    assert home != source.parent
    assert source.read_text() == original
    (home / "auth.json").write_text('{"refreshed": true}')
    runner.run([])
    assert json.loads((home / "auth.json").read_text()) == {"refreshed": True}
    runner.close()
    assert not home.exists()


def test_tools_rejected(monkeypatch):
    fake_process(monkeypatch, {"item": {"type": "command_execution"}})
    with pytest.raises(RuntimeFailure) as error:
        CodexLoginRunner(Settings()).run([])
    assert error.value.code == "codex_tool_forbidden"


def test_failure_safe(monkeypatch):
    fake_process(monkeypatch, returncode=1)
    with pytest.raises(RuntimeFailure) as error:
        CodexLoginRunner(Settings()).run([])
    assert error.value.code == "codex_execution_failed"


def test_cancel_before_launch():
    with pytest.raises(RuntimeFailure) as error:
        CodexLoginRunner(Settings()).run([], cancelled=lambda: True)
    assert error.value.code == "run_cancelled"


@pytest.mark.parametrize(
    "kind, expected",
    [
        ("timeout", "codex_timeout"),
        ("cancel", "run_cancelled"),
        ("size", "codex_output_limit"),
    ],
)
def test_running_process_is_terminated(monkeypatch, kind, expected):
    observed = {"killed": False}
    monkeypatch.setattr(
        "projects.codex_runner._command", lambda: ["codex.exe"]
    )
    monkeypatch.setattr(CodexLoginRunner, "_environment", lambda self: {})
    monkeypatch.setattr(
        "projects.codex_runner.subprocess.run",
        lambda *a, **k: observed.update(killed=True),
    )

    class Process:
        pid = 12345
        returncode = None

        def __init__(self, command, **kwargs):
            if kind == "size":
                kwargs["stdout"].write(b"x" * (4 * 1024 * 1024 + 1))
                kwargs["stdout"].flush()

        def poll(self):
            return None

        def kill(self):
            observed["killed"] = True

        def wait(self, timeout):
            return 1

    monkeypatch.setattr("projects.codex_runner.subprocess.Popen", Process)
    calls = iter([False, True])
    cancelled = (lambda: next(calls)) if kind == "cancel" else None
    timeout = 0 if kind == "timeout" else 120
    with pytest.raises(RuntimeFailure) as error:
        CodexLoginRunner(Settings(llm_timeout_seconds=timeout)).run(
            [], cancelled=cancelled
        )
    assert error.value.code == expected
    assert observed["killed"]


def test_default_auth_is_copied_without_changes(monkeypatch, tmp_path):
    original_environment = CodexLoginRunner._environment
    observed = fake_process(monkeypatch)
    monkeypatch.setattr(CodexLoginRunner, "_environment", original_environment)
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    source = tmp_path / "auth.json"
    original = '{"tokens": {"access_token": "synthetic-only"}}'
    source.write_text(original)
    runner = CodexLoginRunner(Settings())
    runner.run([])
    assert Path(observed["env"]["CODEX_HOME"]) != tmp_path
    assert source.read_text() == original
    runner.close()
