import logging
import math
import time
from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

import pandas as pd
from aegis_events.bus import EventPublisher
from aegis_events.models import (
    SignalComputed,
    SignalFailed,
    SignalGenerationTriggered,
    SignalPersisted,
)
from aegis_storage.database import DatabaseManager
from aegis_storage.models.signals import SignalResultRecord

from aegis_signals.metrics import (
    SIGNAL_COMPUTED,
    SIGNAL_ERRORS,
    SIGNAL_LATENCY,
    SIGNAL_PERSISTENCE_LATENCY,
)
from aegis_signals.models import SignalDefinition, SignalResult, SignalRun

logger = logging.getLogger(__name__)


class BaseSignalProcessor(ABC):
    """Interface for processing raw data into a specific quantitative signal."""

    @abstractmethod
    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        pass


class SignalPipelineEngine:
    """Orchestrates signal computation, event emission, and persistence."""

    def __init__(self, db_manager: DatabaseManager, publisher: EventPublisher | None = None):
        self.db_manager = db_manager
        self.publisher = publisher
        self._processors: dict[str, BaseSignalProcessor] = {}

    def register_processor(self, name: str, processor: BaseSignalProcessor) -> None:
        self._processors[name] = processor
        logger.info(f"Registered signal processor: {name}")

    async def run_signal(
        self,
        definition: SignalDefinition,
        df: pd.DataFrame,
        correlation_id: UUID,
        source_event_ids: list[UUID],
        metadata: dict[str, Any] | None = None,
    ) -> SignalResult | None:
        """Execute a single signal computation cycle with persistence and events."""
        start_time = time.perf_counter()

        if self.publisher:
            await self.publisher.publish(
                SignalGenerationTriggered(
                    source=f"signal_engine:{definition.name}",
                    correlation_id=correlation_id,
                    signal_id=definition.signal_id,
                )
            )

        run = SignalRun(
            signal_id=definition.signal_id,
            correlation_id=correlation_id,
            source_event_ids=source_event_ids,
        )

        try:
            processor = self._processors.get(definition.name)
            if not processor:
                raise ValueError(f"No processor registered for signal: {definition.name}")

            # Deterministic computation
            series = processor.compute(df, definition.parameters)

            # Extract latest value
            if series.empty:
                return None

            latest_timestamp = series.index[-1]
            latest_value = float(series.iloc[-1])
            if not math.isfinite(latest_value):
                logger.info(
                    "Skipping unavailable signal value: %s at %s",
                    definition.name,
                    latest_timestamp,
                )
                return None

            result = SignalResult(
                run_id=run.run_id,
                signal_id=definition.signal_id,
                timestamp=latest_timestamp,
                value=latest_value,
                metadata={
                    **(metadata or {}),
                    "signal_name": definition.name,
                    "signal_version": definition.version,
                    "source_event_ids": [str(event_id) for event_id in source_event_ids],
                },
            )

            duration = time.perf_counter() - start_time
            SIGNAL_LATENCY.labels(signal_name=definition.name).observe(duration)
            SIGNAL_COMPUTED.labels(signal_name=definition.name).inc()

            if self.publisher:
                await self.publisher.publish(
                    SignalComputed(
                        source=f"signal_engine:{definition.name}",
                        correlation_id=correlation_id,
                        payload={"result_id": str(result.result_id), "value": latest_value},
                    )
                )

            # Persist Result
            persist_start = time.perf_counter()
            await self._persist_result(result)
            persist_duration = time.perf_counter() - persist_start
            SIGNAL_PERSISTENCE_LATENCY.labels(signal_name=definition.name).observe(persist_duration)

            if self.publisher:
                await self.publisher.publish(
                    SignalPersisted(
                        source=f"signal_engine:{definition.name}",
                        correlation_id=correlation_id,
                        result_id=result.result_id,
                    )
                )

            return result

        except Exception as e:
            SIGNAL_ERRORS.labels(signal_name=definition.name).inc()
            logger.error(f"Signal execution failed: {definition.name} - {e!s}")
            if self.publisher:
                await self.publisher.publish(
                    SignalFailed(
                        source=f"signal_engine:{definition.name}",
                        correlation_id=correlation_id,
                        error=str(e),
                    )
                )
            return None

    async def _persist_result(self, result: SignalResult) -> None:
        """Internal helper to write result to DB."""
        async for session in self.db_manager.get_session():
            record = SignalResultRecord(
                run_id=result.run_id,
                signal_id=result.signal_id,
                timestamp=result.timestamp,
                value=result.value,
                metadata_json=result.metadata,
            )
            session.add(record)
