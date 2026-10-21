"""Saved-login Codex adapter with isolated working directory and no tools."""

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from pathlib import Path

from pydantic import ValidationError

from .config import Settings
from .runtime.models import RunResult, RuntimeFailure

_LIMIT = 4 * 1024 * 1024


def _failure(code: str, message: str) -> RuntimeFailure:
    return RuntimeFailure(code, message)


def _command() -> list[str]:
    executable = shutil.which("codex")
    if not executable:
        raise _failure("codex_unavailable", "Codex CLI is not installed.")
    path = Path(executable)
    if path.suffix.lower() in {".cmd", ".bat", ".ps1"}:
        node = shutil.which("node")
        script = path.parent / "node_modules/@openai/codex/bin/codex.js"
        if not node or not script.is_file():
            raise _failure(
                "codex_unavailable", "Codex CLI launcher is unavailable."
            )
        return [node, str(script)]
    return [str(path)]


class CodexLoginRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = threading.Lock()
        # Keep refreshed credentials in this private copy across runs; never
        # write to a user-specified original authentication file.
        self._home: tempfile.TemporaryDirectory[str] | None = None

    def close(self) -> None:
        with self._lock:
            if self._home is not None:
                self._home.cleanup()
                self._home = None

    def _environment(self) -> dict[str, str]:
        environment = dict(os.environ)
        for key in ("OPENAI_API_KEY", "CODEX_API_KEY"):
            environment.pop(key, None)
        if self._home is None:
            if self._home is None:
                try:
                    if not self.settings.llm_auth_inline:
                        source = self.settings.llm_auth_file or (
                            Path(
                                os.environ.get(
                                    "CODEX_HOME", str(Path.home() / ".codex")
                                )
                            )
                            / "auth.json"
                        )
                        with source.open("rb") as stream:
                            raw = stream.read(256 * 1024 + 1)
                        if len(raw) > 256 * 1024:
                            raise ValueError()
                        auth = json.loads(raw)
                    else:
                        auth = self.settings.llm_auth_inline
                    if not isinstance(auth, dict) or not auth:
                        raise ValueError()
                    encoded = json.dumps(auth, allow_nan=False)
                except (OSError, ValueError, TypeError, RecursionError):
                    raise _failure(
                        "codex_auth_invalid",
                        "Codex authentication could not be loaded.",
                    ) from None
                self._home = tempfile.TemporaryDirectory(
                    prefix="projects-codex-auth-"
                )
                home = Path(self._home.name)
                home.chmod(0o700)
                target = home / "auth.json"
                with target.open("w", encoding="utf-8") as stream:
                    target.chmod(0o600)
                    stream.write(encoded)
        if self._home is not None:
            environment["CODEX_HOME"] = self._home.name
        return environment

    def run(
        self,
        messages: list[dict[str, str]],
        *,
        cancelled: Callable[[], bool] | None = None,
    ) -> RunResult:
        with self._lock:
            return self._run(messages, cancelled)

    def _run(
        self,
        messages: list[dict[str, str]],
        cancelled: Callable[[], bool] | None,
    ) -> RunResult:
        if cancelled and cancelled():
            raise _failure("run_cancelled", "Run was cancelled.")
        command = _command()
        environment = self._environment()
        with tempfile.TemporaryDirectory(
            prefix="projects-codex-run-"
        ) as directory:
            root = Path(directory)
            schema = root / "schema.json"
            result = root / "result.json"
            output = root / "events.jsonl"
            errors = root / "errors.log"
            schema.write_text(
                json.dumps(RunResult.model_json_schema()), encoding="utf-8"
            )
            prompt = root / "prompt.txt"
            prompt.write_text(
                "Return only a JSON object matching the provided schema. "
                "Process only the supplied messages. Do not use tools.\n"
                + json.dumps(messages, ensure_ascii=False),
                encoding="utf-8",
            )
            command += [
                "exec",
                "--ignore-user-config",
                "--ephemeral",
                "--skip-git-repo-check",
                "--enable",
                "skip_host_skill_discovery",
                "--sandbox",
                "read-only",
                "--output-schema",
                str(schema),
                "--output-last-message",
                str(result),
                "--json",
                "-c",
                'web_search="disabled"',
            ]
            for feature in (
                "shell_tool",
                "apps",
                "plugins",
                "hooks",
                "multi_agent",
                "browser_use",
                "computer_use",
                "view_image",
            ):
                command += ["-c", f"features.{feature}=false"]
            command += ["-c", "project_doc_max_bytes=0"]
            if self.settings.llm_model:
                command += ["--model", self.settings.llm_model]
            command += ["-"]
            process: subprocess.Popen[bytes] | None = None
            try:
                with (
                    prompt.open("rb") as stdin,
                    output.open("wb") as stdout,
                    errors.open("wb") as stderr,
                ):
                    process = subprocess.Popen(
                        command,
                        stdin=stdin,
                        stdout=stdout,
                        stderr=stderr,
                        cwd=root,
                        env=environment,
                        shell=False,
                        creationflags=subprocess.CREATE_NO_WINDOW
                        if os.name == "nt"
                        else 0,
                    )
                    deadline = (
                        time.monotonic() + self.settings.llm_timeout_seconds
                    )
                    while process.poll() is None:
                        if cancelled and cancelled():
                            raise _failure(
                                "run_cancelled", "Run was cancelled."
                            )
                        if time.monotonic() >= deadline:
                            raise _failure(
                                "codex_timeout", "Codex request timed out."
                            )
                        if any(
                            p.exists() and p.stat().st_size > _LIMIT
                            for p in (output, errors, result)
                        ):
                            raise _failure(
                                "codex_output_limit",
                                "Codex output exceeded the size limit.",
                            )
                        time.sleep(0.05)
                    if process.returncode != 0:
                        raise _failure(
                            "codex_execution_failed",
                            "Codex failed; authentication or model availability may need checking.",
                        )
            except OSError:
                raise _failure(
                    "codex_launch_failed",
                    "Codex process could not be started.",
                ) from None
            finally:
                if process is not None and process.poll() is None:
                    if os.name == "nt":
                        subprocess.run(
                            [
                                "taskkill.exe",
                                "/PID",
                                str(process.pid),
                                "/T",
                                "/F",
                            ],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            timeout=10,
                            creationflags=subprocess.CREATE_NO_WINDOW,
                            check=False,
                        )
                    else:
                        process.kill()
                    process.wait(timeout=10)
            if any(
                p.exists() and p.stat().st_size > _LIMIT
                for p in (output, errors, result)
            ):
                raise _failure(
                    "codex_output_limit",
                    "Codex output exceeded the size limit.",
                )
            try:
                for line in output.read_text(encoding="utf-8").splitlines():
                    event = json.loads(line)
                    item = event.get("item", {})
                    if item.get("type") in {
                        "command_execution",
                        "mcp_tool_call",
                        "web_search",
                        "file_change",
                    }:
                        raise _failure(
                            "codex_tool_forbidden",
                            "Codex attempted a forbidden tool operation.",
                        )
                raw = result.read_bytes()
                return RunResult.model_validate_json(raw)
            except (
                OSError,
                ValueError,
                ValidationError,
                AttributeError,
                RecursionError,
            ):
                raise _failure(
                    "codex_invalid_result",
                    "Codex did not return a valid structured result.",
                ) from None
