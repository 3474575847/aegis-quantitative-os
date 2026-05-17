from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class BacktestDefinition(BaseModel):
    """Configuration for a research backtest."""

    model_config = ConfigDict(frozen=True)

    backtest_id: UUID = Field(default_factory=uuid4)
    signal_id: UUID
    strategy_name: str
    strategy_version: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    benchmark: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class BacktestRun(BaseModel):
    """Audit record for a specific backtest execution."""

    run_id: UUID = Field(default_factory=uuid4)
    backtest_id: UUID
    correlation_id: UUID
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class PerformanceMetric(BaseModel):
    """Specific quantitative metric output."""

    name: str
    value: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class BacktestResult(BaseModel):
    """The final summary of a backtest run."""

    model_config = ConfigDict(frozen=True)

    result_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    backtest_id: UUID
    metrics: list[PerformanceMetric]
    cumulative_returns: float
    sharpe_ratio: float
    max_drawdown: float
    completed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StrategySnapshot(BaseModel):
    """Frozen state of the strategy during the run."""

    model_config = ConfigDict(frozen=True)

    snapshot_id: UUID = Field(default_factory=uuid4)
    backtest_id: UUID
    strategy_version: str
    parameters: dict[str, Any]
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ResearchArtifact(BaseModel):
    """Pointer to persisted visual or data outputs (e.g. return series)."""

    artifact_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    artifact_type: str  # e.g., "EQUITY_CURVE_DATA", "METRICS_JSON"
    data: dict[str, Any]
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
