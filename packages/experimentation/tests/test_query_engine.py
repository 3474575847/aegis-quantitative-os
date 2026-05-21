from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from aegis_experimentation.models import (
    ExperimentDefinition,
    ExperimentFilter,
    ExperimentQuery,
    PaginationParams,
    RankingStrategy,
)
from aegis_experimentation.query_engine import QueryEngine
from aegis_experimentation.registry import ExperimentRegistry
from aegis_storage.models.base import Base
from aegis_storage.repositories.experimentation import ExperimentRepository
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


@pytest.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session_factory() as session:
        yield session


@pytest.mark.asyncio
async def test_query_engine_filtering_and_pagination(async_session: AsyncSession) -> None:
    registry = ExperimentRegistry(async_session)
    repository = ExperimentRepository(async_session)
    engine = QueryEngine(repository)

    # Setup experiments
    now = datetime.now(UTC)
    exp1 = ExperimentDefinition(
        name="Exp 1", tags=["tag1", "common"], created_at=now - timedelta(days=2)
    )
    exp2 = ExperimentDefinition(
        name="Exp 2", tags=["tag2", "common"], created_at=now - timedelta(days=1)
    )
    exp3 = ExperimentDefinition(name="Exp 3", tags=["tag3"], created_at=now)

    for exp in [exp1, exp2, exp3]:
        await registry.register_experiment(exp)

    # 1. Filter by tag
    query = ExperimentQuery(
        filter=ExperimentFilter(tags=["common"]), ranking=RankingStrategy.NEWEST
    )
    result = await engine.execute(query)
    assert result.total_count == 2
    assert result.items[0].name == "Exp 2"  # Newest first
    assert result.items[1].name == "Exp 1"

    # 2. Pagination
    query = ExperimentQuery(
        pagination=PaginationParams(limit=1, offset=1), ranking=RankingStrategy.NEWEST
    )
    result = await engine.execute(query)
    assert len(result.items) == 1
    assert result.total_count == 3
    assert result.items[0].name == "Exp 2"  # Exp 3 is offset 0, Exp 2 is offset 1


@pytest.mark.asyncio
async def test_deterministic_ranking(async_session: AsyncSession) -> None:
    registry = ExperimentRegistry(async_session)
    repository = ExperimentRepository(async_session)
    engine = QueryEngine(repository)

    now = datetime.now(UTC)
    # Create experiments with same timestamp to test tie-break
    exp1 = ExperimentDefinition(name="A", created_at=now)
    exp2 = ExperimentDefinition(name="B", created_at=now)

    await registry.register_experiment(exp1)
    await registry.register_experiment(exp2)

    query = ExperimentQuery(ranking=RankingStrategy.OLDEST)
    result = await engine.execute(query)

    # Tie-break is by experiment_id asc.
    # Let's verify results are stable.
    ids = [item.experiment_id for item in result.items]
    assert ids == sorted(ids)


@pytest.mark.asyncio
async def test_ranking_by_metrics(async_session: AsyncSession) -> None:
    registry = ExperimentRegistry(async_session)
    repository = ExperimentRepository(async_session)
    engine = QueryEngine(repository)

    exp1 = ExperimentDefinition(name="Exp 1")
    exp2 = ExperimentDefinition(name="Exp 2")
    await registry.register_experiment(exp1)
    await registry.register_experiment(exp2)

    # Exp 1 has 2 runs, Exp 2 has 1 run
    await registry.create_run(exp1.experiment_id, [])
    await registry.create_run(exp1.experiment_id, [])
    await registry.create_run(exp2.experiment_id, [])

    query = ExperimentQuery(ranking=RankingStrategy.MOST_RUNS)
    result = await engine.execute(query)

    assert result.items[0].name == "Exp 1"
    assert result.items[1].name == "Exp 2"
