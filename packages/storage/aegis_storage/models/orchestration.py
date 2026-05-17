import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base
from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class ResearchRunRecord(Base):
    """Persisted record of a complete research workflow run."""

    __tablename__ = "research_runs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, name="metadata", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_research_runs_workflow", "workflow_id"),
        Index("idx_research_runs_status", "status"),
    )


class WorkflowStageRecord(Base):
    """Persisted state of an individual workflow stage."""

    __tablename__ = "workflow_stages"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    stage_name: Mapped[str] = mapped_column(String(100), primary_key=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    error: Mapped[str | None] = mapped_column(String(1000))

    __table_args__ = (Index("idx_workflow_stages_run", "run_id"),)
