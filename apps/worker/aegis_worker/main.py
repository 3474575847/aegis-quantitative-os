import asyncio
import os
from pathlib import Path

import httpx
from aegis_events.bus import InMemoryEventBus
from aegis_events.persistence import EventPersistenceHandler
from aegis_observability.logger import get_logger
from aegis_sensors.base import SensorConfig
from aegis_sensors.market import MarketPriceSensor
from aegis_sensors.runner import SensorRunner
from aegis_storage.database import DatabaseManager

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

    # Initialize Event System
    event_bus = InMemoryEventBus()
    persistence_handler = EventPersistenceHandler(db_manager)

    # Register persistence for all events
    event_bus.subscribe("SensorRunStarted", persistence_handler.handle)
    event_bus.subscribe("SensorRunCompleted", persistence_handler.handle)
    event_bus.subscribe("SensorFailed", persistence_handler.handle)
    event_bus.subscribe("SignalGenerationTriggered", persistence_handler.handle)
    event_bus.subscribe("SignalComputed", persistence_handler.handle)
    event_bus.subscribe("SignalPersisted", persistence_handler.handle)
    event_bus.subscribe("BacktestStarted", persistence_handler.handle)
    event_bus.subscribe("BacktestCompleted", persistence_handler.handle)

    mock_path = Path("packages/sensors/tests/fixtures/market_prices.json").resolve()
    config = SensorConfig(
        sensor_id="market_btc_usd",
        mock_mode=True,
        mock_path=str(mock_path),
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        sensor = MarketPriceSensor(config, client=client)
        runner = SensorRunner(sensors=[sensor], publisher=event_bus)

        while True:
            try:
                logger.info("Executing Ingestion Cycle")
                await runner.run_once()
                logger.info("Ingestion cycle complete")
            except Exception as e:
                logger.error(f"Ingestion cycle failed: {e}")

            await asyncio.sleep(config.interval_seconds)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
