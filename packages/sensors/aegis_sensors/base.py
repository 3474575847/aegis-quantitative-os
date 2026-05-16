import logging
from abc import ABC, abstractmethod
from typing import Any

from aegis_events.models import LegacyEvent as Event
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class SensorConfig(BaseModel):
    sensor_id: str
    enabled: bool = True
    interval_seconds: int = 300
    mock_mode: bool = False
    mock_path: str | None = None


class BaseSensor[T: BaseModel](ABC):
    def __init__(self, config: SensorConfig) -> None:
        self.config = config

    async def run(self) -> list[Event]:
        if not self.config.enabled:
            logger.info("Sensor %s is disabled.", self.config.sensor_id)
            return []

        try:
            logger.info("Running sensor %s", self.config.sensor_id)
            # Use a helper to allow retry logic to be applied to the fetch call
            raw_data = await self._fetch_with_retry()
            normalized_events = await self.normalize(raw_data)
            validated_events = await self.validate(normalized_events)
            await self.emit(validated_events)
            logger.info("Sensor %s completed successfully.", self.config.sensor_id)
            return validated_events
        except Exception as e:
            logger.error("Sensor %s failed: %s", self.config.sensor_id, str(e))
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _fetch_with_retry(self) -> Any:
        return await self.fetch()

    @abstractmethod
    async def fetch(self) -> Any:
        pass

    @abstractmethod
    async def normalize(self, data: Any) -> list[Event]:
        pass

    @abstractmethod
    async def validate(self, events: list[Event]) -> list[Event]:
        pass

    @abstractmethod
    async def emit(self, events: list[Event]) -> None:
        pass
