"""
Shared test fixtures for the Aegis API test suite.

All DB-touching experiment tests use httpx.AsyncClient + ASGITransport so the
full async stack runs in a single event loop.

The database is a module-scoped async fixture: tables are created once at module
startup inside the pytest-asyncio event loop and persist for the whole module.
NullPool ensures no connection reuse issues across test coroutines.
"""

import os
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path

import aegis_storage.models.events
import aegis_storage.models.experimentation
import aegis_storage.models.signals  # noqa: F401
import pytest_asyncio
import sqlalchemy.ext.asyncio
from aegis_storage.database import DatabaseManager
from aegis_storage.models.base import Base
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import NullPool

# ---------------------------------------------------------------------------
# DB infrastructure
# ---------------------------------------------------------------------------

def _make_manager(url: str) -> DatabaseManager:
    """Build a NullPool DatabaseManager from a URL without touching the event loop."""
    manager = DatabaseManager.__new__(DatabaseManager)
    manager.engine = sqlalchemy.ext.asyncio.create_async_engine(
        url, echo=False, poolclass=NullPool
    )
    manager.session_factory = sqlalchemy.ext.asyncio.async_sessionmaker(
        manager.engine,
        class_=sqlalchemy.ext.asyncio.AsyncSession,
        expire_on_commit=False,
    )
    return manager


@pytest_asyncio.fixture(scope="module")
async def sqlite_db_manager() -> AsyncGenerator[DatabaseManager, None]:
    """
    Create a temp-file SQLite DB, create all tables inside the current event loop,
    and yield the manager. Tables persist for the whole module.
    """
    fd, path = tempfile.mkstemp(suffix=".sqlite", prefix="aegis_test_")
    os.close(fd)

    url = f"sqlite+aiosqlite:///{path}"
    manager = _make_manager(url)

    async with manager.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield manager

    await manager.engine.dispose()
    Path(path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# App patching
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="module", autouse=True)
async def patch_db_manager(sqlite_db_manager: DatabaseManager) -> AsyncGenerator[None, None]:
    """Replace db_manager in aegis_api.main for the duration of this module."""
    import aegis_api.main as main_module
    original = main_module.db_manager
    main_module.db_manager = sqlite_db_manager
    yield
    main_module.db_manager = original


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async httpx client wired to the FastAPI app via ASGI."""
    from aegis_api.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
