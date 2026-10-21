"""Hub schema 1 bundle 검증과 내용 주소 기반 원문 cache."""

import base64
import binascii
import hashlib
import json
import math
import os
import re
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Literal, TypedDict

import httpx
from pydantic import Field, ValidationError

from ._inputs import parse_json, read_response, validate_http_url
from .models import RuntimeFailure, RuntimeModel

DEFAULT_HUB_URL = "https://skills.pydemia.ai"
_SKILL_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,127}\Z")
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_REVISION = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
_WINDOWS_NAMES = re.compile(
    r"(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?\Z",
    re.IGNORECASE,
)


class BundleFilePayload(TypedDict):
    path: str
    sha256: str
    mode: str
    content_base64: str


class BundlePayload(TypedDict):
    schema_version: int
    id: str
    source_revision: str
    files: list[BundleFilePayload]


class LockedFile(TypedDict):
    path: str
    sha256: str
    mode: str


class BundleLock(TypedDict):
    id: str
    source_url: str
    source_revision: str
    cache_key: str
    files: list[LockedFile]
    read_resources: list[str]


@dataclass(frozen=True)
class BundleLimits:
    max_files: int = 256
    max_file_bytes: int = 4 * 1024 * 1024
    max_total_bytes: int = 16 * 1024 * 1024
    max_response_bytes: int = 24 * 1024 * 1024
    max_path_chars: int = 512

    def __post_init__(self) -> None:
        for value in (
            self.max_files,
            self.max_file_bytes,
            self.max_total_bytes,
            self.max_response_bytes,
            self.max_path_chars,
        ):
            if type(value) is not int or value < 1:
                raise RuntimeFailure(
                    "invalid_configuration",
                    "Bundle limits must be positive integers.",
                )


class _HubFile(RuntimeModel):
    path: str
    sha256: str
    mode: Literal["644", "755"]
    content_base64: str


class _HubBundle(RuntimeModel):
    schema_version: Literal[1]
    id: str
    source_revision: str
    files: list[_HubFile] = Field(min_length=1)


@dataclass(frozen=True)
class ValidatedBundle:
    payload: BundlePayload
    contents: dict[str, bytes]

    @property
    def cache_key(self) -> str:
        return hashlib.sha256(bundle_bytes(self.payload)).hexdigest()


def bundle_bytes(payload: BundlePayload) -> bytes:
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def text_content(content: bytes) -> str | None:
    if b"\x00" in content:
        return None
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _validate_path(path: str, max_chars: int) -> None:
    if not path or len(path) > max_chars:
        raise RuntimeFailure(
            "bundle_invalid_path", "Bundle path is empty or too long."
        )
    try:
        part_sizes = [len(part.encode("utf-8")) for part in path.split("/")]
    except UnicodeEncodeError as error:
        raise RuntimeFailure(
            "bundle_invalid_path", "Bundle path is not valid Unicode."
        ) from error
    parts = path.split("/")
    if (
        PurePosixPath(path).is_absolute()
        or any(part in {"", ".", ".."} for part in parts)
        or any(character in path for character in '\\:<>"|?*')
        or any(
            ord(character) < 32 or ord(character) == 127 for character in path
        )
        or any(
            part_size > 255
            or part.endswith((" ", "."))
            or _WINDOWS_NAMES.fullmatch(part)
            for part, part_size in zip(parts, part_sizes, strict=True)
        )
    ):
        raise RuntimeFailure(
            "bundle_invalid_path", f"Unsafe bundle path: {path!r}"
        )


def validate_bundle(
    payload: object,
    *,
    expected_id: str | None = None,
    limits: BundleLimits | None = None,
) -> ValidatedBundle:
    limits = limits if limits is not None else BundleLimits()
    try:
        parsed = _HubBundle.model_validate(payload)
    except ValidationError as error:
        raise RuntimeFailure(
            "bundle_invalid_schema",
            "Hub bundle does not match schema 1.",
        ) from error
    if (
        not isinstance(payload, dict)
        or type(payload.get("schema_version")) is not int
    ):
        raise RuntimeFailure(
            "bundle_invalid_schema", "schema_version must be integer 1."
        )
    if not _SKILL_ID.fullmatch(parsed.id) or (
        expected_id is not None and parsed.id != expected_id
    ):
        raise RuntimeFailure(
            "bundle_invalid_id", "Hub returned an unexpected skill ID."
        )
    if not _REVISION.fullmatch(parsed.source_revision):
        raise RuntimeFailure(
            "bundle_invalid_revision", "Invalid source revision hash."
        )
    if len(parsed.files) > limits.max_files:
        raise RuntimeFailure(
            "bundle_too_many_files", "Bundle exceeds its file count limit."
        )
    contents = {}
    paths: set[str] = set()
    files: list[BundleFilePayload] = []
    total_bytes = 0
    for file in parsed.files:
        _validate_path(file.path, limits.max_path_chars)
        portable_path = unicodedata.normalize("NFC", file.path).casefold()
        if portable_path in paths:
            raise RuntimeFailure(
                "bundle_duplicate_path", f"Duplicate bundle path: {file.path}"
            )
        if any(
            existing.startswith(f"{portable_path}/")
            or portable_path.startswith(f"{existing}/")
            for existing in paths
        ):
            raise RuntimeFailure(
                "bundle_path_conflict",
                f"Bundle path conflicts with a file or directory: {file.path}",
            )
        paths.add(portable_path)
        if not _HASH.fullmatch(file.sha256):
            raise RuntimeFailure(
                "bundle_invalid_hash", f"Invalid SHA-256 for {file.path}."
            )
        if len(file.content_base64) > 4 * ((limits.max_file_bytes + 2) // 3):
            raise RuntimeFailure(
                "bundle_file_too_large",
                f"File exceeds byte limit: {file.path}",
            )
        try:
            content = base64.b64decode(file.content_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise RuntimeFailure(
                "bundle_invalid_base64",
                f"Invalid base64 content: {file.path}",
            ) from error
        if len(content) > limits.max_file_bytes:
            raise RuntimeFailure(
                "bundle_file_too_large",
                f"File exceeds byte limit: {file.path}",
            )
        total_bytes += len(content)
        if total_bytes > limits.max_total_bytes:
            raise RuntimeFailure(
                "bundle_too_large", "Bundle exceeds its total byte limit."
            )
        if hashlib.sha256(content).hexdigest() != file.sha256:
            raise RuntimeFailure(
                "bundle_hash_mismatch", f"SHA-256 mismatch: {file.path}"
            )
        contents[file.path] = content
        files.append(
            {
                "path": file.path,
                "sha256": file.sha256,
                "mode": file.mode,
                "content_base64": file.content_base64,
            }
        )
    skill_text = text_content(contents.get("SKILL.md", b""))
    if not skill_text or not skill_text.strip():
        raise RuntimeFailure(
            "bundle_missing_skill", "Bundle needs a UTF-8 SKILL.md source."
        )
    result: BundlePayload = {
        "schema_version": 1,
        "id": parsed.id,
        "source_revision": parsed.source_revision,
        "files": files,
    }
    return ValidatedBundle(result, contents)


class BundleResolver:
    """매 resolve는 Hub를 읽고, 실행 재현은 cache_key만 사용한다."""

    def __init__(
        self,
        cache_dir: Path,
        hub_url: str = DEFAULT_HUB_URL,
        transport: httpx.BaseTransport | None = None,
        *,
        timeout: float = 30,
        limits: BundleLimits | None = None,
    ) -> None:
        validate_http_url(hub_url, code="invalid_configuration", base_url=True)
        if not math.isfinite(timeout) or not 0 < timeout <= 300:
            raise RuntimeFailure(
                "invalid_configuration",
                "Timeout must be within (0, 300] seconds.",
            )
        self.cache_dir = Path(cache_dir).resolve()
        self.hub_url = hub_url.rstrip("/")
        self.transport = transport
        self.timeout = timeout
        self.limits = limits if limits is not None else BundleLimits()

    def resolve(self, skill_id: str) -> BundleLock:
        if not _SKILL_ID.fullmatch(skill_id):
            raise RuntimeFailure("bundle_invalid_id", "Invalid skill ID.")
        source_url = f"{self.hub_url}/api/skills/{skill_id}/bundle"
        try:
            with httpx.Client(
                transport=self.transport,
                timeout=httpx.Timeout(
                    self.timeout, connect=min(self.timeout, 10)
                ),
                follow_redirects=False,
            ) as client:
                deadline = time.monotonic() + self.timeout
                with client.stream("GET", source_url) as response:
                    if response.status_code != 200:
                        raise RuntimeFailure(
                            "bundle_http_error",
                            f"Hub returned HTTP {response.status_code}.",
                        )
                    raw = read_response(
                        response,
                        max_bytes=self.limits.max_response_bytes,
                        deadline=deadline,
                        prefix="bundle",
                    )
        except httpx.TimeoutException as error:
            raise RuntimeFailure(
                "bundle_timeout", "Hub request timed out."
            ) from error
        except httpx.HTTPError as error:
            raise RuntimeFailure(
                "bundle_connection_error", "Hub request failed."
            ) from error
        try:
            payload = parse_json(raw)
        except (ValueError, UnicodeDecodeError, RecursionError) as error:
            raise RuntimeFailure(
                "bundle_invalid_schema", "Hub response is not valid JSON."
            ) from error
        checked = validate_bundle(
            payload, expected_id=skill_id, limits=self.limits
        )
        self._store(checked)
        return {
            "id": checked.payload["id"],
            "source_url": source_url,
            "source_revision": checked.payload["source_revision"],
            "cache_key": checked.cache_key,
            "files": [
                {
                    "path": file["path"],
                    "sha256": file["sha256"],
                    "mode": file["mode"],
                }
                for file in checked.payload["files"]
            ],
            "read_resources": [
                path
                for path, content in checked.contents.items()
                if text_content(content) is not None
            ],
        }

    def read_bundle(self, cache_key: str) -> BundlePayload:
        if not _HASH.fullmatch(cache_key):
            raise RuntimeFailure(
                "invalid_cache_key", "Invalid immutable bundle cache key."
            )
        path = self.cache_dir / f"{cache_key}.json"
        try:
            if path.is_symlink():
                raise RuntimeFailure(
                    "cache_corrupt", "Bundle cache must not be a symlink."
                )
            if path.stat().st_size > self.limits.max_response_bytes:
                raise RuntimeFailure(
                    "cache_corrupt", "Cached bundle exceeds byte limit."
                )
            with path.open("rb") as stream:
                raw = stream.read(self.limits.max_response_bytes + 1)
        except FileNotFoundError as error:
            raise RuntimeFailure(
                "cache_missing",
                "Pinned bundle is unavailable; exact revision cannot be reproduced.",
            ) from error
        except OSError as error:
            raise RuntimeFailure(
                "cache_read_failed", "Cannot read pinned bundle cache."
            ) from error
        try:
            if len(raw) > self.limits.max_response_bytes:
                raise ValueError("Cached bundle exceeds byte limit.")
            checked = validate_bundle(parse_json(raw), limits=self.limits)
            if checked.cache_key != cache_key:
                raise ValueError("Cache content address does not match.")
        except (
            ValueError,
            UnicodeDecodeError,
            RecursionError,
            RuntimeFailure,
        ) as error:
            raise RuntimeFailure(
                "cache_corrupt",
                "Pinned bundle cache failed integrity validation.",
            ) from error
        return checked.payload

    def _store(self, checked: ValidatedBundle) -> None:
        destination = self.cache_dir / f"{checked.cache_key}.json"
        temporary_path: Path | None = None
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            if destination.exists() or destination.is_symlink():
                self.read_bundle(checked.cache_key)
                return
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=self.cache_dir,
                prefix=".bundle-",
                delete=False,
            ) as stream:
                temporary_path = Path(stream.name)
                stream.write(bundle_bytes(checked.payload))
                stream.flush()
                os.fsync(stream.fileno())
            try:
                # Atomic no-overwrite publication also handles concurrent resolves.
                os.link(temporary_path, destination)
            except FileExistsError:
                self.read_bundle(checked.cache_key)
        except OSError as error:
            raise RuntimeFailure(
                "cache_write_failed", "Cannot store immutable bundle cache."
            ) from error
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
