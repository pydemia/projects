"""Create an allow-listed deployment archive without local state or secrets."""

import hashlib
import json
import tarfile
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
DIRECTORIES = ("src", "migrations", "web/src", "web/public", "web/scripts", "deploy")


def main() -> None:
    members = [ROOT / name for name in FILES]
    for name in DIRECTORIES:
        path = ROOT / name
        if path.exists():
            members.extend(item for item in path.rglob("*") if item.is_file())
    members = sorted(
        members, key=lambda item: item.relative_to(ROOT).as_posix()
    )
    digest = hashlib.sha256()
    checksums: dict[str, str] = {}
    for member in members:
        if member.is_symlink() or not member.is_file():
            raise ValueError("Deployment sources must be regular files.")
        name = member.relative_to(ROOT).as_posix()
        data = member.read_bytes()
        checksum = hashlib.sha256(data).hexdigest()
        checksums[name] = checksum
        digest.update(name.encode() + b"\0" + bytes.fromhex(checksum))
    source_hash = digest.hexdigest()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    archive = OUTPUT / f"source-{source_hash[:16]}.tar.gz"
    with tarfile.open(archive, "w:gz") as stream:
        for member in members:
            stream.add(member, arcname=member.relative_to(ROOT).as_posix())
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
