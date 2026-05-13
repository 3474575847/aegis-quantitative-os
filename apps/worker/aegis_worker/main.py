import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path

import httpx
from aegis_observability.logger import get_logger
from aegis_sensors.base import SensorConfig
from aegis_sensors.market import MarketPriceSensor
from aegis_storage.database import DatabaseManager
from aegis_storage.models.events import NormalizedEvent
from aegis_storage.repositories.events import NormalizedEventRepository

logger = get_logger(__name__)


async def main() -> None:
    logger.info("Starting Aegis-Alpha Ingestion Worker")

    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@db:5432/aegis")
    db_manager = DatabaseManager(db_url)

    try:
        await db_manager.create_all()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

    mock_path = Path("packages/sensors/tests/fixtures/market_prices.json").resolve()
    config = SensorConfig(
        sensor_id="market_btc_usd",
        mock_mode=True,
        mock_path=str(mock_path),
    )

    # Reuse a single HTTP client for all requests (Bolt optimization)
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Pass the shared client to the sensor
        sensor = MarketPriceSensor(config, client=client)

        while True:
            try:
                logger.info("Executing Ingestion Cycle")
                events = await sensor.run()

                if events:
                    async for session in db_manager.get_session():
                        repo = NormalizedEventRepository(session)
                        db_events = [
                            NormalizedEvent(
                                id=event.id,
                                event_type=event.event_type,
                                occurred_at=event.occurred_at,
                                processed_at=datetime.now(UTC),
                                data=event.data,
                                metadata_json=event.metadata,
                            )
                            for event in events
                        ]
                        # Batch insert all events (Bolt optimization)
                        await repo.add_all(db_events)
                        logger.info(f"Persisted {len(db_events)} events")

                logger.info("Ingestion cycle complete")
            except Exception as e:
                logger.error(f"Ingestion cycle failed: {e}")

            await asyncio.sleep(config.interval_seconds)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
