import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from aegis_experimentation.models import ExperimentStatus
from aegis_experimentation.registry import ExperimentRegistry
from aegis_storage.models.base import Base


@pytest.fixture
async def async_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session_factory() as session:
        yield session


@pytest.mark.asyncio
async def test_experiment_registry_lifecycle(async_session):
    registry = ExperimentRegistry(async_session)
    experiment_id = uuid.uuid4()
    workflow_ids = [uuid.uuid4()]

    # 1. Create run
    run = await registry.create_run(experiment_id, workflow_ids)
    assert run.experiment_id == experiment_id
    assert run.status == ExperimentStatus.RUNNING

    # 2. Complete run
    await registry.complete_run(run.run_id, {"final_metric": 0.95})

    # 3. Verify history
    history = await registry.get_experiment_history(experiment_id)
    assert len(history) == 1
    assert history[0].status == ExperimentStatus.COMPLETED
    assert history[0].metadata["final_metric"] == 0.95
