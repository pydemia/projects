"""Create an allow-listed deployment archive without local state or secrets."""

import hashlib
import io
import json
import tarfile
from gzip import GzipFile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".projects" / "deployment"
FILES = (
    ".dockerignore",
    "Dockerfile",
    "alembic.ini",
    "compose.production.yaml",
    "docs/planning/references/artifact-templates.json",
    "pyproject.toml",
    "uv.lock",
    "web/index.html",
    "web/package.json",
    "web/package-lock.json",
    "web/tsconfig.json",
    "web/vite.config.ts",
)
DIRECTORIES = (
    "src",
    "migrations",
    "web/src",
    "web/public",
    "web/scripts",
    "deploy",
)
IGNORED_PARTS = {"__pycache__", "node_modules", "dist", ".pytest_cache"}
PRIVATE_PARTS = {".secrets", ".projects", "state"}
PRIVATE_NAMES = {"auth.json", "server.env", "oauth.env"}
TEXT_SUFFIXES = {
    ".cjs",
    ".css",
    ".html",
    ".ini",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".service",
    ".sh",
    ".timer",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
TEXT_NAMES = {".dockerignore", "Dockerfile", "Caddyfile"}


def _allowed(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    parts = {part.lower() for part in relative.parts}
    name = relative.name.lower()
    suffix = relative.suffix.lower()
    if parts & PRIVATE_PARTS or name in PRIVATE_NAMES:
        raise ValueError("Private deployment file found in source tree.")
    if name.startswith(".env") or suffix in {".key", ".pem", ".p12", ".pfx"}:
        raise ValueError(
            "Credential-like deployment file found in source tree."
        )
    return not (parts & IGNORED_PARTS or suffix == ".pyc")


def _source_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    if path.suffix in TEXT_SUFFIXES or path.name in TEXT_NAMES:
        return data.replace(b"\r\n", b"\n")
    return data


def main() -> None:
    members = [ROOT / name for name in FILES]
    for name in DIRECTORIES:
        path = ROOT / name
        if path.exists():
            members.extend(
                item
                for item in path.rglob("*")
                if item.is_file() and _allowed(item)
            )
    members = sorted(
        members, key=lambda item: item.relative_to(ROOT).as_posix()
    )
    digest = hashlib.sha256()
    checksums: dict[str, str] = {}
    payloads: dict[str, bytes] = {}
    for member in members:
        if member.is_symlink() or not member.is_file():
            raise ValueError("Deployment sources must be regular files.")
        _allowed(member)
        name = member.relative_to(ROOT).as_posix()
        data = _source_bytes(member)
        payloads[name] = data
        checksum = hashlib.sha256(data).hexdigest()
        checksums[name] = checksum
        digest.update(name.encode() + b"\0" + bytes.fromhex(checksum))
    source_hash = digest.hexdigest()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    archive = OUTPUT / f"source-{source_hash[:16]}.tar.gz"
    with archive.open("wb") as output:
        with GzipFile(
            fileobj=output, mode="wb", filename="", mtime=0
        ) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as stream:
                for name, data in payloads.items():
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o644
                    info.mtime = 0
                    stream.addfile(info, io.BytesIO(data))
    (OUTPUT / f"source-{source_hash[:16]}.json").write_text(
        json.dumps({"source_hash": source_hash, "files": checksums}, indent=2),
        encoding="utf-8",
    )
    print(f"source_hash={source_hash}")
    print(f"archive={archive}")
    print(f"archive_sha256={hashlib.sha256(archive.read_bytes()).hexdigest()}")
    print(f"file_count={len(members)}")


if __name__ == "__main__":
    main()
