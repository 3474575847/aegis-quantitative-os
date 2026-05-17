import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base
from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class BacktestResultRecord(Base):
    """Persisted summary of a backtest run."""

    __tablename__ = "backtest_results"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    backtest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    cumulative_returns: Mapped[float] = mapped_column(Float, nullable=False)
    sharpe_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    max_drawdown: Mapped[float] = mapped_column(Float, nullable=False)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, name="metrics", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_backtest_results_id", "backtest_id"),
        Index("idx_backtest_results_timestamp", "timestamp"),
        # Hypertable compliance: unique index must include partition key
        Index("idx_backtest_results_run_timestamp", "run_id", "timestamp", unique=True),
    )


class ResearchArtifactRecord(Base):
    """Persisted research data (e.g. daily equity curve)."""

    __tablename__ = "research_artifacts"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    data_json: Mapped[dict[str, Any]] = mapped_column(JSONB, name="data", nullable=False)

    __table_args__ = (
        Index("idx_research_artifacts_run", "run_id"),
        Index("idx_research_artifacts_type", "artifact_type"),
    )
