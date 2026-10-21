"""Local application entry point; provider secrets are server configuration."""

import argparse
import getpass
import os
import sys

import uvicorn
from alembic import command
from alembic.config import Config

from projects.config import ConfigurationError, Settings


def main() -> None:
    parser = argparse.ArgumentParser(prog="projects")
    parser.add_argument("--config", help="서버 YAML 설정 경로")
    subcommands = parser.add_subparsers(dest="action", required=True)
    serve = subcommands.add_parser(
        "serve", help="로컬 API와 SkillRun worker 시작"
    )
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=18731)
    serve.add_argument("--forwarded-allow-ips", default="127.0.0.1")
    user = subcommands.add_parser(
        "create-user", help="서버에서 개인 계정 발급"
    )
    user.add_argument("--username", required=True)
    user.add_argument("--password-stdin", action="store_true")
    subcommands.add_parser("migrate", help="PostgreSQL schema 갱신")
    subcommands.add_parser(
        "check-config", help="비밀값을 출력하지 않고 설정 확인"
    )
    args = parser.parse_args()
    if args.config:
        os.environ["PROJECTS_CONFIG"] = args.config
    try:
        settings = Settings.from_env()
    except ConfigurationError as exc:
        parser.exit(2, f"설정 오류: {exc}\n")
    if args.action == "migrate":
        command.upgrade(Config("alembic.ini"), "head")
    elif args.action == "check-config":
        print(
            f"설정 형식 확인 · provider={settings.llm_provider} · DB=PostgreSQL"
        )
    elif args.action == "create-user":
        from pydantic import ValidationError
        from sqlalchemy import select
        from sqlalchemy.orm import Session

        from projects.auth import password_hash
        from projects.database import Account, make_engine
        from projects.schemas import Credentials

        password = (
            sys.stdin.read().strip()
            if args.password_stdin
            else getpass.getpass("비밀번호: ")
        )
        try:
            credentials = Credentials(
                username=args.username, password=password
            )
        except ValidationError:
            parser.exit(
                2, "계정 형식을 확인해 주세요. 비밀번호는 12자 이상입니다.\n"
            )
        engine = make_engine(settings.database_url)
        try:
            with Session(engine) as db, db.begin():
                if db.scalar(
                    select(Account).where(
                        Account.username == credentials.username.lower()
                    )
                ):
                    parser.exit(2, "이미 존재하는 계정입니다.\n")
                db.add(
                    Account(
                        username=credentials.username.lower(),
                        password_hash=password_hash(credentials.password),
                    )
                )
        finally:
            engine.dispose()
        print("개인 계정을 발급했습니다.")
    else:
        from projects.api import create_app

        uvicorn.run(
            create_app(settings),
            host=args.host,
            port=args.port,
            forwarded_allow_ips=args.forwarded_allow_ips,
            access_log=False,
        )


if __name__ == "__main__":
    main()
