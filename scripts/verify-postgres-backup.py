"""Verify Compose PostgreSQL dump/restore using only a new random QA schema."""

import hashlib
import json
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from projects.database import Account, Base, Project
from projects.records import (
    add_link,
    create_baseline,
    create_item,
    revise_item,
)

URL = "postgresql+psycopg://projects:projects@127.0.0.1:5432/projects"


def compose(*args: str, payload: bytes | None = None) -> bytes:
    completed = subprocess.run(
        ["docker", "compose", "exec", "-T", "db", *args],
        input=payload,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if completed.returncode:
        # Dump contents and server errors can contain private records.
        raise RuntimeError(
            "PostgreSQL backup command failed; output withheld."
        )
    return completed.stdout


def snapshot(engine) -> dict:
    with engine.connect() as connection:
        return {
            table.name: [
                dict(row)
                for row in connection.execute(
                    select(table).order_by(*table.primary_key.columns)
                ).mappings()
            ]
            for table in Base.metadata.sorted_tables
        }


def main() -> None:
    schema = "projects_backup_" + uuid4().hex
    assert re.fullmatch(r"projects_backup_[a-f0-9]{32}", schema)
    control = create_engine(URL)
    isolated = create_engine(
        URL, connect_args={"options": f"-csearch_path={schema}"}
    )
    try:
        with control.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        with isolated.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        with Session(isolated) as db, db.begin():
            account = Account(
                username="backup-" + uuid4().hex,
                password_hash="synthetic-not-usable",
            )
            db.add(account)
            db.flush()
            project = Project(owner_id=account.id, name="백업 합성 검증")
            db.add(project)
            db.flush()
            requirement = create_item(
                db, project.id, "requirement", "요구", "수정 전", {}
            )
            document = create_item(
                db, project.id, "artifact", "설계", "# 본문 보존", {}
            )
            add_link(db, project.id, document, requirement, "implements")
            revise_item(
                db, requirement, 1, "요구", "수정 후", requirement.data
            )
            create_baseline(db, project.id, "복구 기준")
        before = snapshot(isolated)
        dump = compose(
            "pg_dump",
            "--username=projects",
            "--dbname=projects",
            "--no-owner",
            "--no-privileges",
            "--schema=" + schema,
        )
        assert dump and schema.encode() in dump
        isolated.dispose()
        # The exact random schema was created above by this invocation.
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        compose(
            "psql",
            "--username=projects",
            "--dbname=projects",
            "--set=ON_ERROR_STOP=1",
            "--single-transaction",
            payload=dump,
        )
        after = snapshot(isolated)
        assert after == before
        with isolated.connect() as connection:
            assert (
                connection.scalar(
                    text("SELECT version_num FROM alembic_version")
                )
                == "0002"
            )
        evidence = {
            "checked_at": datetime.now(UTC).isoformat(),
            "schema": schema,
            "method": "Compose pg_dump → drop owned QA schema → psql restore",
            "dump_sha256": hashlib.sha256(dump).hexdigest(),
            "tables_compared": list(before),
            "row_counts": {key: len(value) for key, value in before.items()},
            "result": "all IDs, revisions, bodies, links and baselines equal",
            "scope": "synthetic QA schema; no existing project data changed",
        }
        destination = Path("docs/implementation/screenshots")
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "postgres-backup-checks.json").write_text(
            json.dumps(evidence, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(json.dumps(evidence, ensure_ascii=False))
    finally:
        isolated.dispose()
        with control.begin() as connection:
            connection.execute(
                text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
            )
        control.dispose()


if __name__ == "__main__":
    main()
