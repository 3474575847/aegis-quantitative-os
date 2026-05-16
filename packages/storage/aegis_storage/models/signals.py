import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base
from sqlalchemy import DateTime, Float, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class SignalResultRecord(Base):
    """Persisted output of a signal run."""

    __tablename__ = "signal_results"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    signal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, name="metadata", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_signal_results_signal_id", "signal_id"),
        Index("idx_signal_results_timestamp", "timestamp"),
        # Hypertable constraint: unique index must include partition column
        Index("idx_signal_results_run_id_timestamp", "run_id", "timestamp", unique=True),
    )


class SignalDefinitionRecord(Base):
    """Persisted signal configuration for reproducibility."""

    __tablename__ = "signal_definitions"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    __table_args__ = (Index("idx_signal_definitions_name_version", "name", "version", unique=True),)
