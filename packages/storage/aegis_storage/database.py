import contextlib
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from aegis_storage.models.base import Base


class DatabaseManager:
    def __init__(self, database_url: str):
        self.engine = create_async_engine(database_url, echo=False)
        self.session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except GeneratorExit:
                try:
                    await session.commit()
                except Exception:
                    await session.rollback()
                raise
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def create_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            # Initialize TimescaleDB hypertables if running against PostgreSQL
            if self.engine.dialect.name == "postgresql":
                _ie = "if_not_exists => TRUE"
                hypertables = [
                    f"SELECT create_hypertable('raw_events', 'received_at', {_ie});",
                    f"SELECT create_hypertable('normalized_events', 'occurred_at', {_ie});",
                    f"SELECT create_hypertable('event_log', 'timestamp', {_ie});",
                    f"SELECT create_hypertable('signal_results', 'timestamp', {_ie});",
                    f"SELECT create_hypertable('raw_news_articles', 'published_at', {_ie});",
                    (
                        "SELECT create_hypertable('canonical_articles',"
                        f" 'first_published_at', {_ie});"
                    ),
                    f"SELECT create_hypertable('macro_observations', 'observation_date', {_ie});",
                ]
                for stmt in hypertables:
                    with contextlib.suppress(Exception):
                        await conn.execute(text(stmt))

    async def close(self) -> None:
        await self.engine.dispose()
