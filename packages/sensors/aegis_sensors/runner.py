import asyncio
import time
from typing import Any

from aegis_sensors.base import BaseSensor
from aegis_sensors.metrics import EVENTS_PROCESSED, SENSOR_ERRORS, SENSOR_LATENCY


class SensorRunner:
    def __init__(self, sensors: list[BaseSensor[Any]]):
        self.sensors = sensors

    async def run_once(self) -> None:
        tasks = [self._run_sensor(sensor) for sensor in self.sensors]
        await asyncio.gather(*tasks)

    async def _run_sensor(self, sensor: BaseSensor[Any]) -> None:
        sensor_id = sensor.config.sensor_id
        start_time = time.perf_counter()

        try:
            events = await sensor.run()
            duration = time.perf_counter() - start_time
            SENSOR_LATENCY.labels(sensor_id=sensor_id).observe(duration)
            EVENTS_PROCESSED.labels(sensor_id=sensor_id).inc(len(events))
        except Exception:
            SENSOR_ERRORS.labels(sensor_id=sensor_id).inc()
