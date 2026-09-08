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


# ---------------------------------------------------------------------------
# News schemas (P0.4)
# ---------------------------------------------------------------------------

class RawNewsArticleResponse(BaseModel):
    """Single raw provider observation within a canonical cluster."""
    id: str
    provider_id: str
    headline: str
    url: str
    publisher: str
    published_at: str
    available_at: str
    entities: list[str]
    provenance: dict[str, Any]

    @classmethod
    def from_record(cls, record: Any) -> "RawNewsArticleResponse":
        return cls(
            id=str(record.id),
            provider_id=record.provider_id,
            headline=record.headline,
            url=record.url,
            publisher=record.publisher,
            published_at=record.published_at.isoformat(),
            available_at=record.available_at.isoformat(),
            entities=list(record.entities or []),
            provenance=dict(record.provenance or {}),
        )


class CanonicalNewsArticleResponse(BaseModel):
    """
    Deduplicated canonical news story with full provenance and corroboration data.

    Fields are aligned with the blueprint's data honesty requirements:
    - available_at: earliest PIT timestamp across all provider observations.
    - publisher_count: number of independent publishers (NOT provider count).
    - corroboration_score: 0.50 (1 publisher) → 0.75 (2) → 0.95 (3+).
    - entities: canonical ticker/asset symbols resolved by EntityResolver.
    """
    cluster_id: str
    primary_headline: str
    primary_url: str
    primary_publisher: str
    publisher_count: int
    first_published_at: str
    first_available_at: str
    corroboration_score: float
    entities: list[str]
    sentiment_polarity: float
    member_article_ids: list[str]

    @classmethod
    def from_record(cls, record: Any) -> "CanonicalNewsArticleResponse":
        return cls(
            cluster_id=record.cluster_id,
            primary_headline=record.primary_headline,
            primary_url=record.primary_url,
            primary_publisher=record.primary_publisher,
            publisher_count=record.publisher_count,
            first_published_at=record.first_published_at.isoformat(),
            first_available_at=record.first_available_at.isoformat(),
            corroboration_score=round(record.corroboration_score, 2),
            entities=list(record.entities or []),
            sentiment_polarity=round(record.sentiment_polarity, 4),
            member_article_ids=list(record.member_article_ids or []),
        )


class NewsClusterDetailResponse(BaseModel):
    """Full cluster detail: canonical article + all constituent raw observations."""
    canonical: CanonicalNewsArticleResponse
    raw_articles: list[RawNewsArticleResponse]
    raw_article_count: int


# ---------------------------------------------------------------------------
# Macro schemas (P1.1)
# ---------------------------------------------------------------------------

class MacroSeriesPoint(BaseModel):
    """A single time-series observation for a macro indicator."""
    series_id: str
    series_name: str
    unit: str
    category: str
    observation_date: str          # ISO date string, e.g. "2024-09-01"
    value: float | None
    available_at: str              # PIT retrieval timestamp
    provider: str


class YieldCurveResponse(BaseModel):
    """
    Current yield curve snapshot with the 10Y-2Y spread (slope).

    ``slope_bps`` is the primary inversion indicator:
    - Positive: normal (upward-sloping) curve — growth expected.
    - Negative: inverted — historically precedes recession ~12-18 months later.
    - is_inverted: True when slope_bps < 0.

    All values are as-of the most recent FRED publication retrieved by Aegis.
    """
    dgs10: MacroSeriesPoint | None
    dgs2: MacroSeriesPoint | None
    fedfunds: MacroSeriesPoint | None
    slope_bps: float | None        # (DGS10 - DGS2) * 100 in basis points
    is_inverted: bool
    credit_spread: MacroSeriesPoint | None   # BAMLH0A0HYM2
    retrieved_at: str


class RegimeClassification(BaseModel):
    """
    4-quadrant macroeconomic regime per the Aegis blueprint §15.2.

    Quadrants:
    - REFLATION     Growth ↑  Inflation ↑
    - GOLDILOCKS    Growth ↑  Inflation ↓
    - STAGFLATION   Growth ↓  Inflation ↑
    - DEFLATION     Growth ↓  Inflation ↓

    When fewer than 4 months of data exist the regime is UNKNOWN.
    """
    regime: str                    # One of the 4 quadrant names or UNKNOWN
    growth_direction: str          # UP / DOWN / FLAT / UNKNOWN
    inflation_direction: str       # UP / DOWN / FLAT / UNKNOWN
    growth_indicator: MacroSeriesPoint | None    # Latest UNRATE
    inflation_indicator: MacroSeriesPoint | None # Latest CPIAUCSL
    growth_change_3m: float | None               # 3-month absolute change in UNRATE
    inflation_change_3m: float | None            # 3-month absolute change in CPIAUCSL
    confidence: str                # HIGH / MEDIUM / LOW
    methodology: str
    classified_at: str
