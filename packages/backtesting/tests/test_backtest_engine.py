from collections.abc import AsyncGenerator
from unittest.mock import MagicMock
from uuid import uuid4

import pandas as pd
import pytest
from aegis_backtesting.engine import BacktestEngine
from aegis_backtesting.models import BacktestDefinition


@pytest.mark.asyncio
async def test_backtest_engine_execution() -> None:
    db_manager = MagicMock()

    # Mock the async generator for sessions
    async def mock_get_session() -> AsyncGenerator[MagicMock, None]:
        yield MagicMock()

    db_manager.get_session.return_value = mock_get_session()

    engine = BacktestEngine(db_manager=db_manager)

    definition = BacktestDefinition(
        signal_id=uuid4(), strategy_name="test_strat", strategy_version="1.0.0", benchmark="SPY"
    )

    signal_data = pd.Series([0.01, 0.02, -0.01, 0.03], index=pd.date_range("2024-01-01", periods=4))

    result = await engine.run_backtest(
        definition=definition, signal_data=signal_data, correlation_id=uuid4()
    )

    assert result is not None
    assert result.cumulative_returns > 0
    assert len(result.metrics) > 0
    assert db_manager.get_session.called
