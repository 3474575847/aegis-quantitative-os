import os
from logging.config import fileConfig

import aegis_storage.models.events  # noqa: F401
import aegis_storage.models.experimentation  # noqa: F401
import aegis_storage.models.macro  # noqa: F401
import aegis_storage.models.news  # noqa: F401
import aegis_storage.models.signals  # noqa: F401
from aegis_storage.models.base import Base
from alembic import context
from sqlalchemy import create_engine, pool

config = context.config

# Prefer DATABASE_URL_SYNC; fall back to DATABASE_URL with asyncpg stripped out.
# Alembic uses the synchronous psycopg2 driver — never asyncpg.
database_url = (
    os.getenv("DATABASE_URL_SYNC") or os.getenv("DATABASE_URL", "").replace("+asyncpg", "")
)
# Force psycopg2 explicitly — avoids SQLAlchemy defaulting to psycopg v3
if database_url.startswith("postgresql://") and "+psycopg" not in database_url:
    database_url = database_url.replace("postgresql://", "postgresql+psycopg2://", 1)
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url")
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
