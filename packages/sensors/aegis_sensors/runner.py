import asyncio
import time
from typing import Any

from aegis_events.bus import EventPublisher
from aegis_events.models import SensorFailed, SensorRunCompleted, SensorRunStarted

from aegis_sensors.base import BaseSensor
from aegis_sensors.metrics import EVENTS_PROCESSED, SENSOR_ERRORS, SENSOR_LATENCY


class SensorRunner:
    def __init__(self, sensors: list[BaseSensor[Any]], publisher: EventPublisher | None = None):
        self.sensors = sensors
        self.publisher = publisher

    async def run_once(self) -> None:
        tasks = [self._run_sensor(sensor) for sensor in self.sensors]
        await asyncio.gather(*tasks)

    async def _run_sensor(self, sensor: BaseSensor[Any]) -> None:
        sensor_id = sensor.config.sensor_id
        start_time = time.perf_counter()

        if self.publisher:
            await self.publisher.publish(SensorRunStarted(source=sensor_id))

        try:
            events = await sensor.run()
            duration = time.perf_counter() - start_time
            SENSOR_LATENCY.labels(sensor_id=sensor_id).observe(duration)
            EVENTS_PROCESSED.labels(sensor_id=sensor_id).inc(len(events))

            if self.publisher and len(events) > 0:
                event_dicts = [
                    {
                        "event_id": str(getattr(e, "id", "")),
                        "event_type": getattr(e, "event_type", "EVENT"),
                        "data": getattr(e, "data", {}),
                        "occurred_at": str(getattr(e, "occurred_at", "")),
                    }
                    for e in events
                ]
                await self.publisher.publish(
                    SensorRunCompleted(
                        source=sensor_id,
                        payload={"events_count": len(events), "events": event_dicts},
                    )
                )
        except Exception as e:
            SENSOR_ERRORS.labels(sensor_id=sensor_id).inc()
            if self.publisher:
                await self.publisher.publish(SensorFailed(source=sensor_id, error=str(e)))
