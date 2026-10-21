from alembic import context
from sqlalchemy import create_engine, pool

from projects.config import Settings
from projects.database import Base

target_metadata = Base.metadata


def run_migrations() -> None:
    supplied = context.config.attributes.get("connection")
    if supplied is not None:
        context.configure(connection=supplied, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(
        Settings.from_env().database_url,
        poolclass=pool.NullPool,
    )
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations()
