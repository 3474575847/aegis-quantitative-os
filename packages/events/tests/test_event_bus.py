import pytest
from aegis_events.bus import InMemoryEventBus
from aegis_events.models import SensorRunStarted


@pytest.mark.asyncio
async def test_event_bus_delivery() -> None:
    bus = InMemoryEventBus()
    received_events = []

    async def handler(event: SensorRunStarted) -> None:
        received_events.append(event)

    bus.subscribe("SensorRunStarted", handler)

    event = SensorRunStarted(source="test_sensor")
    await bus.publish(event)

    assert len(received_events) == 1
    assert received_events[0].event_id == event.event_id


@pytest.mark.asyncio
async def test_event_bus_failure_isolation() -> None:
    bus = InMemoryEventBus()
    success_count = 0

    async def failing_handler(_event: SensorRunStarted) -> None:
        raise ValueError("Simulated failure")

    async def succeeding_handler(_event: SensorRunStarted) -> None:
        nonlocal success_count
        success_count += 1

    bus.subscribe("SensorRunStarted", failing_handler)
    bus.subscribe("SensorRunStarted", succeeding_handler)

    event = SensorRunStarted(source="test_sensor")
    await bus.publish(event)

    # Second handler should still have executed
    assert success_count == 1
