"""크기를 제한한 HTTP 응답과 모호하지 않은 JSON 읽기."""

import json
import time
from typing import NoReturn
from urllib.parse import urlsplit

import httpx

from .models import RuntimeFailure


def validate_http_url(
    value: str, *, code: str, base_url: bool = False
) -> None:
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except (ValueError, UnicodeError) as error:
        raise RuntimeFailure(code, "Invalid HTTP(S) URL.") from error
    if (
        parsed.scheme not in {"http", "https"}
        or not hostname
        or port == 0
        or any(character.isspace() for character in parsed.netloc)
        or parsed.username
        or parsed.password
        or any(
            ord(character) < 32 or ord(character) == 127 for character in value
        )
        or (
            base_url
            and (
                parsed.query
                or parsed.fragment
                or any(character.isspace() for character in value)
            )
        )
    ):
        raise RuntimeFailure(code, "Invalid HTTP(S) URL.")


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _invalid_constant(value: str) -> NoReturn:
    raise ValueError(f"Invalid JSON constant: {value}")


def parse_json(data: bytes | str) -> object:
    return json.loads(
        data,
        object_pairs_hook=_unique_object,
        parse_constant=_invalid_constant,
    )


def read_response(
    response: httpx.Response,
    *,
    max_bytes: int,
    deadline: float,
    prefix: str,
) -> bytes:
    size_header = response.headers.get("content-length")
    if size_header and size_header.isascii() and size_header.isdecimal():
        if len(size_header) > 20 or int(size_header) > max_bytes:
            raise RuntimeFailure(
                f"{prefix}_response_too_large",
                "HTTP response exceeds the configured byte limit.",
            )
    content = bytearray()
    for chunk in response.iter_bytes():
        if time.monotonic() > deadline:
            raise RuntimeFailure(
                f"{prefix}_timeout",
                "HTTP response exceeded its deadline.",
            )
        if len(content) + len(chunk) > max_bytes:
            raise RuntimeFailure(
                f"{prefix}_response_too_large",
                "HTTP response exceeds the configured byte limit.",
            )
        content.extend(chunk)
    return bytes(content)
