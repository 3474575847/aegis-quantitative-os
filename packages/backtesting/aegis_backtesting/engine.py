import logging
import time
from datetime import datetime
from uuid import UUID

import pandas as pd
from aegis_events.bus import EventPublisher
from aegis_events.models import (
    BacktestCompleted,
    BacktestFailed,
    BacktestStarted,
    MetricsComputed,
    ResearchArtifactStored,
)
from aegis_storage.database import DatabaseManager
from aegis_storage.models.backtesting import BacktestResultRecord, ResearchArtifactRecord

from aegis_backtesting.metrics import get_performance_summary
from aegis_backtesting.metrics_instrumentation import (
    BACKTEST_DURATION,
    BACKTEST_ERRORS,
    BACKTEST_PERSISTENCE_LATENCY,
    METRIC_COMPUTATION_LATENCY,
)
from aegis_backtesting.models import (
    BacktestDefinition,
    BacktestResult,
    BacktestRun,
    PerformanceMetric,
    ResearchArtifact,
)

logger = logging.getLogger(__name__)


class BacktestEngine:
    """Orchestrates the execution of signal-based backtests."""

    def __init__(self, db_manager: DatabaseManager, publisher: EventPublisher | None = None):
        self.db_manager = db_manager
        self.publisher = publisher

    async def run_backtest(
        self,
        definition: BacktestDefinition,
        signal_data: pd.Series,
        correlation_id: UUID,
    ) -> BacktestResult | None:
        """Execute a backtest run using provided signal data with persistence and observability."""
        start_time = time.perf_counter()
        run = BacktestRun(
            backtest_id=definition.backtest_id,
            correlation_id=correlation_id,
        )

        if self.publisher:
            await self.publisher.publish(
                BacktestStarted(
                    source="backtest_engine",
                    correlation_id=correlation_id,
                )
            )

        try:
            logger.info(f"Starting backtest run: {run.run_id} for {definition.strategy_name}")

            # Basic simulation: Signal directly maps to returns for the foundation
            returns = signal_data

            metric_start = time.perf_counter()
            metrics_dict = get_performance_summary(returns)
            METRIC_COMPUTATION_LATENCY.labels(strategy_name=definition.strategy_name).observe(
                time.perf_counter() - metric_start
            )

            if self.publisher:
                await self.publisher.publish(
                    MetricsComputed(
                        source="backtest_engine",
                        correlation_id=correlation_id,
                    )
                )

            performance_metrics = [
                PerformanceMetric(name=k, value=v) for k, v in metrics_dict.items()
            ]

            result = BacktestResult(
                run_id=run.run_id,
                backtest_id=definition.backtest_id,
                metrics=performance_metrics,
                cumulative_returns=metrics_dict["cumulative_returns"],
                sharpe_ratio=metrics_dict["sharpe_ratio"],
                max_drawdown=metrics_dict["max_drawdown"],
            )

            # Persist Summary Result
            persist_start = time.perf_counter()
            await self._persist_result(result)

            # Persist Research Artifact (Equity Curve)
            artifact = ResearchArtifact(
                run_id=run.run_id,
                artifact_type="EQUITY_CURVE",
                data={"returns": returns.tolist()},
            )
            await self._persist_artifact(artifact, result.completed_at)

            BACKTEST_PERSISTENCE_LATENCY.labels(strategy_name=definition.strategy_name).observe(
                time.perf_counter() - persist_start
            )

            BACKTEST_DURATION.labels(strategy_name=definition.strategy_name).observe(
                time.perf_counter() - start_time
            )

            if self.publisher:
                await self.publisher.publish(
                    ResearchArtifactStored(
                        source="backtest_engine",
                        correlation_id=correlation_id,
                        artifact_id=artifact.artifact_id,
                    )
                )
                await self.publisher.publish(
                    BacktestCompleted(
                        source="backtest_engine",
                        correlation_id=correlation_id,
                    )
                )

            return result

        except Exception as e:
            BACKTEST_ERRORS.labels(strategy_name=definition.strategy_name).inc()
            logger.error(f"Backtest failed: {run.run_id} - {e!s}")
            if self.publisher:
                await self.publisher.publish(
                    BacktestFailed(
                        source="backtest_engine", correlation_id=correlation_id, error=str(e)
                    )
                )
            return None

    async def _persist_result(self, result: BacktestResult) -> None:
        async for session in self.db_manager.get_session():
            record = BacktestResultRecord(
                run_id=result.run_id,
                backtest_id=result.backtest_id,
                timestamp=result.completed_at,
                cumulative_returns=result.cumulative_returns,
                sharpe_ratio=result.sharpe_ratio,
                max_drawdown=result.max_drawdown,
                metrics_json={m.name: m.value for m in result.metrics},
            )
            session.add(record)

    async def _persist_artifact(self, artifact: ResearchArtifact, timestamp: datetime) -> None:
        async for session in self.db_manager.get_session():
            record = ResearchArtifactRecord(
                run_id=artifact.run_id,
                artifact_type=artifact.artifact_type,
                timestamp=timestamp,
                data_json=artifact.data,
            )
            session.add(record)
