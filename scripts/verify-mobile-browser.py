"""Run real mobile browser checks against a disposable PostgreSQL schema."""

import os
import re
import socket
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from uuid import uuid4

import httpx
import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from projects.api import create_app
from projects.config import Settings

DATABASE_URL = os.getenv(
    "PROJECTS_TEST_DATABASE_URL",
    "postgresql+psycopg://projects:projects@127.0.0.1:5432/projects",
)


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def wait_for(url: str) -> None:
    for _ in range(100):
        try:
            if httpx.get(url, timeout=1).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.15)
    raise RuntimeError(f"QA service did not start: {url}")


def main() -> None:
    api_port = free_port()
    web_port = free_port()
    schema = "projects_mobile_" + uuid4().hex
    assert re.fullmatch(r"projects_mobile_[a-f0-9]{32}", schema)
    control = create_engine(DATABASE_URL)
    isolated = None
    server = None
    thread = None
    web = None
    with tempfile.TemporaryDirectory(prefix="projects-mobile-qa-") as data_dir:
        try:
            with control.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            isolated = create_engine(
                DATABASE_URL,
                connect_args={"options": f"-csearch_path={schema}"},
            )
            with isolated.begin() as connection:
                config = Config("alembic.ini")
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
            settings = Settings(
                data_dir=Path(data_dir),
                registry_path=Path(
                    "docs/planning/references/artifact-templates.json"
                ),
                worker_enabled=False,
            )
            app = create_app(settings, engine=isolated)
            server = uvicorn.Server(
                uvicorn.Config(
                    app,
                    host="127.0.0.1",
                    port=api_port,
                    log_level="warning",
                )
            )
            thread = threading.Thread(target=server.run, daemon=True)
            thread.start()
            wait_for(f"http://127.0.0.1:{api_port}/health")
            environment = os.environ.copy()
            environment["PROJECTS_API_URL"] = f"http://127.0.0.1:{api_port}"
            environment["PROJECTS_WEB_URL"] = f"http://127.0.0.1:{web_port}"
            web = subprocess.Popen(
                [
                    "node",
                    "node_modules/vite/bin/vite.js",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(web_port),
                    "--strictPort",
                ],
                cwd="web",
                env=environment,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT,
            )
            wait_for(f"http://127.0.0.1:{web_port}/")
            if web.poll() is not None:
                raise RuntimeError(
                    "QA Vite process exited before browser verification."
                )
            subprocess.run(
                ["node", "scripts/verify-mobile-browser.cjs"],
                env=environment,
                check=True,
            )
        finally:
            if web is not None:
                web.terminate()
                try:
                    web.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    web.kill()
                    web.wait(timeout=5)
            if server is not None:
                server.should_exit = True
            if thread is not None:
                thread.join(timeout=10)
            if isolated is not None:
                isolated.dispose()
            with control.begin() as connection:
                connection.execute(
                    text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
                )
            control.dispose()


if __name__ == "__main__":
    main()
