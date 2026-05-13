import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class RawEvent(Base):
    __tablename__ = "raw_events"

    sensor_id: Mapped[str] = mapped_column(String(255), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    source_version: Mapped[str | None] = mapped_column(String(50))

    __table_args__ = (Index("idx_raw_events_sensor", "sensor_id"),)


class NormalizedEvent(Base):
    __tablename__ = "normalized_events"

    raw_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_events.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, name="metadata", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_normalized_events_type", "event_type"),
        Index("idx_normalized_events_data", "data", postgresql_using="gin"),
    )
