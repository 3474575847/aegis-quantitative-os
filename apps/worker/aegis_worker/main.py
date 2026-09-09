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
from aegis_storage.models.events import EventLog
from aegis_storage.models.signals import SignalDefinitionRecord
from sqlalchemy import select

from aegis_worker.macro_pipeline import MacroPipeline
from aegis_worker.news_pipeline import NewsIngestionPipeline


# Automatically discover and load .env file from repository root
def _load_env_file() -> None:
    search_dirs = [Path.cwd(), Path(__file__).resolve().parent, Path(__file__).resolve().parents[3]]
    for directory in search_dirs:
        env_file = directory / ".env"
        if env_file.is_file():
            try:
                with env_file.open() as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            key = k.strip()
                            val = v.strip().strip("'\"")
                            if key not in os.environ:
                                os.environ[key] = val
                break
            except Exception:
                pass


_load_env_file()

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
            definitions = (await session.execute(select(SignalDefinitionRecord))).scalars().all()

        source_event_ids = [uuid.UUID(e["event_id"]) for e in events_data if e.get("event_id")]
        if event.source in ["MARKET_BTC_USD", "market_btc_usd"]:
            prices = [e.get("data", {}).get("price") for e in events_data]
            frame = pd.DataFrame(
                {"price": [float(p) for p in prices if p is not None]}, index=[now_ts]
            )
            signal_names = {"BTC_MOMENTUM_ZSCORE", "MEAN_REVERSION_PRICE"}
        elif event.source in ["REDDIT", "reddit_wallstreetbets"]:
            current_score = sum(float(e.get("data", {}).get("score", 0) or 0) for e in events_data)
            reddit_definition = next(
                (record for record in definitions if record.name == "REDDIT_SENTIMENT_LEAD"),
                None,
            )
            parameters = reddit_definition.parameters if reddit_definition else {}
            window = max(1, int(parameters.get("window", parameters.get("lookback", 20))))
            historical_scores: list[tuple[datetime, float]] = []
            async for session in self.db_manager.get_session():
                historical_events = list(
                    (
                        await session.execute(
                            select(EventLog)
                            .where(EventLog.source.in_(["REDDIT", "reddit_wallstreetbets"]))
                            .where(EventLog.timestamp < event.timestamp)
                            .order_by(EventLog.timestamp.desc())
                            .limit(window)
                        )
                    )
                    .scalars()
                    .all()
                )
            for historical_event in reversed(historical_events):
                historical_payload = historical_event.payload or {}
                historical_events_data = historical_payload.get("events", [])
                historical_scores.append(
                    (
                        historical_event.timestamp,
                        sum(
                            float(item.get("data", {}).get("score", 0) or 0)
                            for item in historical_events_data
                        ),
                    )
                )
            observations = [*historical_scores, (event.timestamp, current_score)]
            frame = pd.DataFrame(
                {"score": [score for _, score in observations]},
                index=[timestamp for timestamp, _ in observations],
            )
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

    # News ingestion pipeline (runs every 5 minutes, independent of sensor cycle)
    news_pipeline = NewsIngestionPipeline(db_manager)
    news_interval_seconds = int(os.getenv("NEWS_INGESTION_INTERVAL", "300"))

    # Macro ingestion pipeline (runs every 60 minutes — FRED data is daily)
    macro_pipeline = MacroPipeline(db_manager)
    macro_interval_seconds = int(os.getenv("MACRO_INGESTION_INTERVAL", "3600"))

    async def macro_ingestion_loop() -> None:
        """Scheduled FRED macro ingest: fetch 6 series → upsert on interval."""
        while True:
            try:
                stats = await macro_pipeline.run_cycle()
                logger.info(
                    "Macro pipeline cycle: fetched=%d new_rows=%d",
                    stats["fetched"],
                    stats["new_rows"],
                )
            except Exception as exc:
                logger.error("Macro ingestion cycle failed: %s", exc)
            await asyncio.sleep(macro_interval_seconds)

    async def news_ingestion_loop() -> None:
        """Scheduled news ingestion: fetch → deduplicate → persist on interval."""
        while True:
            try:
                stats = await news_pipeline.run_cycle()
                logger.info(
                    "News pipeline cycle: fetched=%d saved_raw=%d new_clusters=%d",
                    stats["fetched"],
                    stats["saved_raw"],
                    stats["new_clusters"],
                )
            except Exception as exc:
                logger.error("News ingestion cycle failed: %s", exc)
            await asyncio.sleep(news_interval_seconds)

    async with httpx.AsyncClient(timeout=10.0) as client:
        market_sensor = MarketPriceSensor(market_config, client=client)
        reddit_sensor = RedditFinanceSensor(reddit_config, client=client)

        runner = SensorRunner(sensors=[market_sensor, reddit_sensor], publisher=event_bus)

        # Launch news ingestion concurrently with the market/sentiment sensor cycle
        news_task = asyncio.create_task(news_ingestion_loop())
        macro_task = asyncio.create_task(macro_ingestion_loop())

        try:
            while True:
                try:
                    logger.info("Executing Synchronized Ingestion Cycle...")
                    await runner.run_once()
                    logger.info("Synchronized ingestion cycle complete.")
                except Exception as e:
                    logger.error(f"Ingestion cycle failed: {e}")

                await asyncio.sleep(10)
        finally:
            news_task.cancel()
            macro_task.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
