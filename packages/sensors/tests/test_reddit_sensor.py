from pathlib import Path

import pytest
from aegis_sensors.base import SensorConfig
from aegis_sensors.reddit import RedditFinanceSensor


@pytest.mark.asyncio
async def test_reddit_sensor_mock_mode() -> None:
    fixture_path = Path(__file__).parent / "fixtures" / "reddit_wsb.json"
    config = SensorConfig(sensor_id="test_reddit", mock_mode=True, mock_path=str(fixture_path))
    sensor = RedditFinanceSensor(config)

    events = await sensor.run()

    assert len(events) == 2
    assert events[0].event_type == "REDDIT_POST"
    assert events[0].data["title"] == "GME to the moon!"
    assert events[1].data["author"] == "bear_market"
    # occurred_at must preserve the original Reddit publication timestamp (created_utc=1715560000),
    # NOT the current wall-clock time. This verifies point-in-time correctness.
    assert events[0].occurred_at.isoformat() == "2024-05-13T00:26:40+00:00"
