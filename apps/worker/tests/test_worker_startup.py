import pytest


@pytest.mark.asyncio
async def test_worker_compiles() -> None:
    from aegis_worker.main import logger

    assert logger is not None
