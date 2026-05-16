import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from aegis_events.models import LegacyEvent as Event
from aegis_observability.logger import get_logger

from aegis_sensors.base import BaseSensor

logger = get_logger(__name__)


class MarketPriceSensor(BaseSensor[Any]):
    def __init__(self, config: Any, client: httpx.AsyncClient | None = None) -> None:
        super().__init__(config)
        self._client = client

    async def fetch(self) -> Any:
        if self.config.mock_mode and self.config.mock_path:
            with Path(self.config.mock_path).open() as f:
                return json.load(f)

        url = "https://api.coinbase.com/v2/prices/BTC-USD/spot"
        try:
            if self._client:
                response = await self._client.get(url, headers={"User-Agent": "Aegis-Alpha/0.1.0"})
                response.raise_for_status()
                return response.json()

            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers={"User-Agent": "Aegis-Alpha/0.1.0"})
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch live data: {e}")
            if self.config.mock_path:
                logger.info("Falling back to mock data")
                with Path(self.config.mock_path).open() as f:
                    return json.load(f)
            raise

    async def normalize(self, data: Any) -> list[Event]:
        # Determine if it's Coinbase data or our mock data
        if "data" in data and "amount" in data["data"]:
            price = float(data["data"]["amount"])
            symbol = data["data"]["base"] + data["data"]["currency"]
            occurred_at = datetime.now(UTC)
        else:
            price = float(data.get("price", 0))
            symbol = data.get("symbol", "UNKNOWN")
            timestamp = data.get("timestamp")
            occurred_at = (
                datetime.fromtimestamp(timestamp, tz=UTC) if timestamp else datetime.now(UTC)
            )

        return [
            Event(
                event_type="MARKET_PRICE",
                occurred_at=occurred_at,
                data={
                    "symbol": symbol,
                    "price": price,
                },
                metadata={"sensor_id": self.config.sensor_id},
            )
        ]

    async def validate(self, events: list[Event]) -> list[Event]:
        return [e for e in events if e.data.get("price", 0) > 0]

    async def emit(self, events: list[Event]) -> None:
        pass
