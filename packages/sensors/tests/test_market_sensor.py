from pathlib import Path

import pytest
from aegis_sensors.base import SensorConfig
from aegis_sensors.market import MarketPriceSensor


@pytest.mark.asyncio
async def test_market_sensor_mock_mode() -> None:
    fixture_path = Path(__file__).parent / "fixtures" / "market_prices.json"
    config = SensorConfig(sensor_id="test_market", mock_mode=True, mock_path=str(fixture_path))
    sensor = MarketPriceSensor(config)

    events = await sensor.run()

    assert len(events) == 1
    assert events[0].event_type == "MARKET_PRICE"
    assert events[0].data["symbol"] == "BTCUSD"
    assert events[0].data["price"] == 65000.50
