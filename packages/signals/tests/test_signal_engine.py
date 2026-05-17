from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pandas as pd
import pytest
from aegis_signals.engine import BaseSignalProcessor, SignalPipelineEngine
from aegis_signals.models import SignalDefinition


class MockProcessor(BaseSignalProcessor):
    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        return df["price"].rolling(window=params["window"]).mean()


@pytest.mark.asyncio
async def test_signal_engine_execution() -> None:
    db_manager = MagicMock()

    # Mock the async generator for sessions
    async def mock_get_session() -> AsyncGenerator[MagicMock, None]:
        yield MagicMock()

    db_manager.get_session.return_value = mock_get_session()

    engine = SignalPipelineEngine(db_manager=db_manager)
    engine.register_processor("test_signal", MockProcessor())

    definition = SignalDefinition(name="test_signal", version="1.0.0", parameters={"window": 2})

    df = pd.DataFrame({"price": [10.0, 20.0, 30.0]}, index=pd.date_range("2024-01-01", periods=3))

    result = await engine.run_signal(
        definition=definition, df=df, correlation_id=uuid4(), source_event_ids=[]
    )

    assert result is not None
    # Mean of 20 and 30 is 25
    assert result.value == 25.0
    assert db_manager.get_session.called
