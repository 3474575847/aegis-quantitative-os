import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base, SQLiteCompatibleARRAY, SQLiteCompatibleJSONB
from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class ExperimentDefinitionRecord(Base):
    """Persisted record of an experiment definition."""

    __tablename__ = "experiment_definitions"

    experiment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1024))
    workflow_ids: Mapped[list[uuid.UUID]] = mapped_column(
        SQLiteCompatibleARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    parameters: Mapped[dict[str, Any]] = mapped_column(
        SQLiteCompatibleJSONB, nullable=False, default=dict
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        SQLiteCompatibleJSONB, name="metadata", nullable=False, default=dict
    )
    tags: Mapped[list[str]] = mapped_column(
        SQLiteCompatibleARRAY(String), nullable=False, default=list
    )

    __table_args__ = (Index("idx_experiment_definitions_name", "name"),)

    @property
    def id(self) -> uuid.UUID:
        return self.experiment_id

    @id.setter
    def id(self, value: uuid.UUID) -> None:
        self.experiment_id = value


class ExperimentRunRecord(Base):
    """Persisted record of an experiment run."""

    __tablename__ = "experiment_runs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, nullable=False)

    experiment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workflow_run_ids: Mapped[list[uuid.UUID]] = mapped_column(
        SQLiteCompatibleARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        SQLiteCompatibleJSONB, name="metadata", nullable=False, default=dict
    )

    __table_args__ = (
        Index("idx_experiment_runs_experiment", "experiment_id"),
        Index("idx_experiment_runs_status", "status"),
    )

    @property
    def id(self) -> uuid.UUID:
        return self.run_id

    @id.setter
    def id(self, value: uuid.UUID) -> None:
        self.run_id = value
