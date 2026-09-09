"""
MacroObservationRecord — TimescaleDB hypertable for FRED macro series.

Hypertable partition column: ``observation_date`` (daily cadence).
PIT look-ahead barrier:       ``available_at``    (retrieval timestamp).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from aegis_storage.models.base import Base, SQLiteCompatibleJSONB
from sqlalchemy import Date, Float, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class MacroObservationRecord(Base):
    """
    Stores a single macroeconomic time-series observation from FRED.

    Design invariants:
    - ``observation_date`` + ``series_id`` form a natural business key (unique constraint).
    - ``available_at`` must NEVER precede the actual FRED retrieval time.
      It is set by the ingestion pipeline at retrieval time, not copied from
      FRED's ``realtime_start`` field.
    - ``value`` is nullable: FRED encodes unreleased / revised values as ".".
    """

    __tablename__ = "macro_observations"
    __table_args__ = (
        UniqueConstraint("series_id", "observation_date", name="uq_macro_series_date"),
        Index("ix_macro_series_date", "series_id", "observation_date"),
        Index("ix_macro_available_at", "available_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    series_id: Mapped[str] = mapped_column(String(32), nullable=False)
    series_name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)

    # The date this observation refers to (e.g. 2024-09-01 for monthly CPI)
    observation_date: Mapped[date] = mapped_column(Date, primary_key=True, nullable=False)

    # Numeric value; NULL when FRED has not yet published
    value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # PIT look-ahead barrier: when Aegis first retrieved this value
    available_at: Mapped[datetime] = mapped_column(nullable=False)

    # Provider (always "FRED" for now)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="FRED")

    # Raw FRED response metadata
    metadata_json: Mapped[dict[str, object] | None] = mapped_column(
        SQLiteCompatibleJSONB, nullable=True
    )
