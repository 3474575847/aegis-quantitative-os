import uuid
from datetime import datetime
from typing import Any

from aegis_storage.models.base import Base
from sqlalchemy import JSON, DateTime, Index, String, TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column


class SQLiteCompatibleARRAY(TypeDecorator[list[Any]]):
    """SQLite compatible ARRAY type."""

    impl = ARRAY
    cache_ok = True

    def __init__(self, item_type: Any, **kwargs: Any) -> None:
        self.item_type = item_type
        super().__init__(item_type, **kwargs)

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(JSON)
        return dialect.type_descriptor(ARRAY(self.item_type))

    def _is_uuid_type(self) -> bool:
        name = getattr(self.item_type, "__name__", "")
        if not name and hasattr(self.item_type, "__class__"):
            name = self.item_type.__class__.__name__
        return self.item_type is UUID or name == "UUID" or isinstance(self.item_type, UUID)

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if dialect.name == "sqlite" and value is not None:
            if self._is_uuid_type():
                return [str(v) if isinstance(v, uuid.UUID) else v for v in value]
            return value
        return value

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if dialect.name == "sqlite" and value is not None:
            if self._is_uuid_type():
                return [uuid.UUID(v) if isinstance(v, str) else v for v in value]
            return value
        return value


class SQLiteCompatibleJSONB(TypeDecorator[dict[str, Any]]):
    """SQLite compatible JSONB type."""

    impl = JSONB
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(JSON)
        return dialect.type_descriptor(JSONB)


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
