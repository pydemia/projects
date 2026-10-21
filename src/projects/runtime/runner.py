"""환경 설정을 인자로 받는 OpenAI-compatible HTTP adapter."""

import math
import time
from typing import Literal

import httpx
from pydantic import ValidationError

from ._inputs import parse_json, read_response, validate_http_url
from .models import RunResult, RuntimeFailure


class OpenAICompatibleRunner:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 120,
        *,
        max_response_bytes: int = 2 * 1024 * 1024,
        response_format: Literal["json_schema", "json_object"] = "json_schema",
    ) -> None:
        if not base_url.strip() or not api_key.strip() or not model.strip():
            raise RuntimeFailure(
                "runtime_not_configured",
                "LLM base URL, API key, and model must be configured.",
            )
        validate_http_url(
            base_url, code="invalid_configuration", base_url=True
        )
        if any(
            ord(character) < 32 or ord(character) == 127
            for character in api_key
        ):
            raise RuntimeFailure(
                "invalid_configuration",
                "API key contains invalid control characters.",
            )
        if not math.isfinite(timeout) or not 0 < timeout <= 300:
            raise RuntimeFailure(
                "invalid_configuration",
                "Timeout must be within (0, 300] seconds.",
            )
        if (
            type(max_response_bytes) is not int
            or not 0 < max_response_bytes <= 32 * 1024 * 1024
        ):
            raise RuntimeFailure(
                "invalid_configuration", "Invalid LLM response byte limit."
            )
        if response_format not in {"json_schema", "json_object"}:
            raise RuntimeFailure(
                "invalid_configuration",
                "Unsupported structured response format.",
            )
        base_url = base_url.rstrip("/")
        self.endpoint = (
            base_url
            if base_url.endswith("/chat/completions")
            else f"{base_url}/chat/completions"
        )
        self.api_key = api_key
        self.model = model
        self.transport = transport
        self.timeout = timeout
        self.max_response_bytes = max_response_bytes
        self.response_format = response_format

    def run(self, messages: list[dict[str, str]]) -> RunResult:
        structured_format: dict[str, object] = {"type": self.response_format}
        if self.response_format == "json_schema":
            structured_format["json_schema"] = {
                "name": "run_result",
                "strict": True,
                "schema": RunResult.model_json_schema(),
            }
        try:
            with httpx.Client(
                transport=self.transport,
                timeout=httpx.Timeout(
                    self.timeout, connect=min(self.timeout, 10)
                ),
                follow_redirects=False,
            ) as client:
                deadline = time.monotonic() + self.timeout
                with client.stream(
                    "POST",
                    self.endpoint,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": messages,
                        "response_format": structured_format,
                        "stream": False,
                    },
                ) as response:
                    if response.status_code != 200:
                        raise RuntimeFailure(
                            "llm_http_error",
                            f"LLM returned HTTP {response.status_code}.",
                        )
                    raw = read_response(
                        response,
                        max_bytes=self.max_response_bytes,
                        deadline=deadline,
                        prefix="llm",
                    )
        except httpx.TimeoutException as error:
            raise RuntimeFailure(
                "llm_timeout", "LLM request timed out."
            ) from error
        except httpx.HTTPError as error:
            raise RuntimeFailure(
                "llm_connection_error", "LLM request failed."
            ) from error
        try:
            envelope = parse_json(raw)
        except (ValueError, UnicodeDecodeError, RecursionError) as error:
            raise RuntimeFailure(
                "llm_invalid_response", "LLM response is not valid JSON."
            ) from error
        if not isinstance(envelope, dict):
            raise RuntimeFailure(
                "llm_invalid_response", "LLM response must be an object."
            )
        choices = envelope.get("choices")
        if (
            not isinstance(choices, list)
            or not choices
            or not isinstance(choices[0], dict)
        ):
            raise RuntimeFailure(
                "llm_invalid_response",
                "LLM response has no completion choice.",
            )
        choice = choices[0]
        if choice.get("finish_reason") != "stop":
            raise RuntimeFailure(
                "llm_incomplete_result",
                "LLM completion did not finish successfully.",
            )
        message = choice.get("message")
        if not isinstance(message, dict) or message.get("tool_calls"):
            raise RuntimeFailure(
                "llm_invalid_response",
                "LLM response has no final text result.",
            )
        if message.get("refusal"):
            raise RuntimeFailure(
                "llm_refused", "LLM declined to return a structured result."
            )
        content = message.get("content")
        if not isinstance(content, str):
            raise RuntimeFailure(
                "llm_invalid_response", "LLM completion content must be text."
            )
        try:
            return RunResult.model_validate(parse_json(content))
        except (
            ValueError,
            UnicodeDecodeError,
            RecursionError,
            ValidationError,
        ) as error:
            raise RuntimeFailure(
                "llm_invalid_result",
                "LLM result does not match the RunResult JSON schema.",
            ) from error
