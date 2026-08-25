from typing import Any

from pydantic import BaseModel, Field, field_validator


class SignalItemResponse(BaseModel):
    id: str
    name: str
    version: str
    parameters: dict[str, Any]
    created_at: str | None = None
    latest_value: float | None = None
    latest_timestamp: str | None = None

    @field_validator("latest_value", mode="before")
    @classmethod
    def round_latest_value(cls, v: Any) -> float | None:
        if v is None:
            return None
        return round(float(v), 4)


class SignalDatapointResponse(BaseModel):
    timestamp: str
    value: float
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("value", mode="before")
    @classmethod
    def round_value(cls, v: Any) -> float:
        return round(float(v), 4)


class SignalHistoryResponse(BaseModel):
    signal_id: str
    name: str
    version: str
    parameters: dict[str, Any]
    datapoints: list[SignalDatapointResponse]


class MarketTickerResponse(BaseModel):
    symbol: str
    price: float
    asset_class: str
    exchange: str
    timestamp: str
    z_score_signal: float
    is_fallback: bool = False
    fallback_reason: str | None = None

    @field_validator("price", "z_score_signal", mode="before")
    @classmethod
    def round_floats(cls, v: Any) -> float:
        if v is None:
            return 0.0
        return round(float(v), 4)


class EventLogResponse(BaseModel):
    event_id: str
    event_type: str
    source: str
    timestamp: str
    correlation_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Experiment schemas
# ---------------------------------------------------------------------------

class ExperimentCreateRequest(BaseModel):
    """Create a new named experiment definition."""
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    signal_id: str | None = None          # UUID string — the signal this experiment tests
    symbol: str = Field(default="BTC")
    transaction_cost_bps: float = Field(default=5.0, ge=0, le=500)
    slippage_bps: float = Field(default=0.0, ge=0, le=500)
    tags: list[str] = Field(default_factory=list)
    initial_result: dict[str, Any] | None = None
    methodology: str | None = None


class ExperimentRunResponse(BaseModel):
    """Result of a completed experiment run."""
    run_id: str
    experiment_id: str
    experiment_name: str
    status: str
    signal_id: str | None
    symbol: str
    started_at: str
    completed_at: str | None
    result: dict[str, Any] | None = None
    methodology: str | None = None


class ExperimentSummaryResponse(BaseModel):
    """Summary of an experiment definition with aggregate run stats."""
    experiment_id: str
    name: str
    description: str | None
    signal_id: str | None
    symbol: str
    transaction_cost_bps: float
    slippage_bps: float
    tags: list[str]
    created_at: str | None
    run_count: int
    success_rate: float
    latest_status: str
    latest_run_id: str | None
    best_sharpe: float | None


class ExperimentComparisonItem(BaseModel):
    experiment_id: str
    name: str
    description: str | None
    signal_id: str | None
    signal_name: str | None = None
    symbol: str
    transaction_cost_bps: float
    slippage_bps: float
    tags: list[str]
    created_at: str | None
    run_count: int
    latest_status: str
    latest_run_id: str | None
    metrics: dict[str, Any] | None = None
    methodology: str | None = None


class ExperimentCompareResponse(BaseModel):
    experiments: list[ExperimentComparisonItem]
    compared_at: str
    count: int
