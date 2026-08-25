import asyncio
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pandas as pd
from aegis_events.bus import InMemoryEventBus
from aegis_events.models import SensorRunCompleted
from aegis_events.persistence import EventPersistenceHandler
from aegis_observability.logger import get_logger
from aegis_sensors.base import SensorConfig
from aegis_sensors.market import MarketPriceSensor
from aegis_sensors.reddit import RedditFinanceSensor
from aegis_sensors.runner import SensorRunner
from aegis_signals.engine import SignalPipelineEngine
from aegis_signals.models import SignalDefinition
from aegis_signals.processors import (
    BtcMomentumProcessor,
    MeanReversionProcessor,
    RedditSentimentProcessor,
)
from aegis_storage.database import DatabaseManager
from aegis_storage.models.signals import SignalDefinitionRecord
from sqlalchemy import select

logger = get_logger(__name__)


class FactorExecutionHandler:
    """Subscribes to SensorRunCompleted events and executes downstream factor signal models."""

    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    async def handle_sensor_completed(self, event: SensorRunCompleted) -> None:
        """Asynchronously triggered on every completed sensor run with payload."""
        payload = event.payload or {}
        events_count = payload.get("events_count", 0)
        if events_count == 0:
            return

        events_data = payload.get("events", [])
        now_ts = datetime.now(UTC)

        engine = SignalPipelineEngine(self.db_manager)
        engine.register_processor("BTC_MOMENTUM_ZSCORE", BtcMomentumProcessor())
        engine.register_processor("MEAN_REVERSION_PRICE", MeanReversionProcessor())
        engine.register_processor("REDDIT_SENTIMENT_LEAD", RedditSentimentProcessor())

        async for session in self.db_manager.get_session():
            definitions = (
                await session.execute(select(SignalDefinitionRecord))
            ).scalars().all()

        source_event_ids = [uuid.UUID(e["event_id"]) for e in events_data if e.get("event_id")]
        if event.source in ["MARKET_BTC_USD", "market_btc_usd"]:
            prices = [e.get("data", {}).get("price") for e in events_data]
            frame = pd.DataFrame(
                {"price": [float(p) for p in prices if p is not None]}, index=[now_ts]
            )
            signal_names = {"BTC_MOMENTUM_ZSCORE", "MEAN_REVERSION_PRICE"}
        elif event.source in ["REDDIT", "reddit_wallstreetbets"]:
            scores = [e.get("data", {}).get("score", 0) for e in events_data]
            frame = pd.DataFrame({"score": [float(sum(scores))]}, index=[now_ts])
            signal_names = {"REDDIT_SENTIMENT_LEAD"}
        else:
            return

        for record in definitions:
            if record.name not in signal_names:
                continue
            definition = SignalDefinition(
                signal_id=record.id,
                name=record.name,
                version=record.version,
                parameters=record.parameters,
            )
            await engine.run_signal(
                definition=definition,
                df=frame,
                correlation_id=event.correlation_id,
                source_event_ids=source_event_ids,
                metadata={"sensor_source": event.source, "events_count": events_count},
            )


async def main() -> None:
    logger.info("Starting Aegis-Alpha Ingestion Worker in EVENT LINEAGE SYNCHRONIZATION MODE")

    db_url = os.getenv(
        "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/aegis"
    )
    db_manager = DatabaseManager(db_url)

    try:
        await db_manager.create_all()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

    # Initialize Event System & Handlers
    event_bus = InMemoryEventBus()
    persistence_handler = EventPersistenceHandler(db_manager)
    factor_handler = FactorExecutionHandler(db_manager)

    # Register persistence for all events
    event_bus.subscribe("SensorRunStarted", persistence_handler.handle)
    event_bus.subscribe("SensorRunCompleted", persistence_handler.handle)
    event_bus.subscribe("SensorFailed", persistence_handler.handle)

    # Register Event-Driven Factor Model Synchronization
    event_bus.subscribe("SensorRunCompleted", factor_handler.handle_sensor_completed)

    market_mock_path = Path("packages/sensors/tests/fixtures/market_prices.json").resolve()
    reddit_mock_path = Path("packages/sensors/tests/fixtures/reddit_wsb.json").resolve()

    # 1. Real-World Live Coinbase BTC-USD Sensor
    market_config = SensorConfig(
        sensor_id="MARKET_BTC_USD",
        interval_seconds=10,
        mock_mode=False,
        mock_path=str(market_mock_path),
    )

    # 2. Real-World Live Reddit r/wallstreetbets Sentiment Sensor
    reddit_config = SensorConfig(
        sensor_id="REDDIT",
        interval_seconds=15,
        mock_mode=False,
        mock_path=str(reddit_mock_path),
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        market_sensor = MarketPriceSensor(market_config, client=client)
        reddit_sensor = RedditFinanceSensor(reddit_config, client=client)

        runner = SensorRunner(sensors=[market_sensor, reddit_sensor], publisher=event_bus)

        while True:
            try:
                logger.info("Executing Synchronized Ingestion Cycle...")
                await runner.run_once()
                logger.info("Synchronized ingestion cycle complete.")
            except Exception as e:
                logger.error(f"Ingestion cycle failed: {e}")

            await asyncio.sleep(10)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
