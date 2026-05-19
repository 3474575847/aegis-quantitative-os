import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aegis_storage.models.base import Base


class ExperimentRunRecord(Base):
    """Persisted record of an experiment run."""

    __tablename__ = "experiment_runs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, nullable=False)
    experiment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workflow_run_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, name="metadata", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_experiment_runs_experiment", "experiment_id"),
        Index("idx_experiment_runs_status", "status"),
    )
