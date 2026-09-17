from datetime import datetime, timezone

UTC = timezone.utc
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class SignalDefinition(BaseModel):
    """Configuration for a quantitative signal."""

    model_config = ConfigDict(frozen=True)

    signal_id: UUID = Field(default_factory=uuid4)
    name: str
    version: str
    description: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    asset_class: str = Field(default="CROSS_ASSET")
    signal_horizon: str = Field(default="1d")
    prediction_horizon_bars: int = Field(default=1)
    holding_horizon_bars: int = Field(default=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SignalRun(BaseModel):
    """Audit record for a specific signal execution."""

    run_id: UUID = Field(default_factory=uuid4)
    signal_id: UUID
    correlation_id: UUID
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source_event_ids: list[UUID] = Field(default_factory=list)


class SignalResult(BaseModel):
    """The computed output of a signal run."""

    model_config = ConfigDict(frozen=True)

    result_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    signal_id: UUID
    timestamp: datetime
    value: float
    metadata: dict[str, Any] = Field(default_factory=dict)
    applicability_status: str = Field(default="VALID")
    uncertainty: float | None = Field(default=None)


class SignalMetric(BaseModel):
    """Aggregated performance metrics for a signal (e.g. Sharpe, Vol)."""

    signal_id: UUID
    name: str
    value: float
    window_start: datetime
    window_end: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class SignalSnapshot(BaseModel):
    """Frozen state of all signal parameters for reproducibility."""

    model_config = ConfigDict(frozen=True)

    snapshot_id: UUID = Field(default_factory=uuid4)
    signal_id: UUID
    signal_version: str
    parameters: dict[str, Any]
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
