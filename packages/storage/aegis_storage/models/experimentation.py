import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from aegis_storage.models.base import Base


class SQLiteCompatibleARRAY(TypeDecorator[list[uuid.UUID]]):
    impl = PG_ARRAY
    cache_ok = True

    def __init__(self, item_type: Any, *args: Any, **kwargs: Any):
        super().__init__(item_type, *args, **kwargs)
        self.item_type = item_type

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "sqlite":
            from sqlalchemy.types import JSON
            return dialect.type_descriptor(JSON())
        else:
            return dialect.type_descriptor(PG_ARRAY(self.item_type))

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if dialect.name == "sqlite" and value is not None:
            return [str(v) for v in value]
        return value

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if dialect.name == "sqlite" and value is not None:
            return [uuid.UUID(v) if isinstance(v, str) else v for v in value]
        return value


class SQLiteCompatibleJSONB(TypeDecorator[dict[str, Any]]):
    impl = JSONB
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "sqlite":
            from sqlalchemy.types import JSON
            return dialect.type_descriptor(JSON())
        else:
            return dialect.type_descriptor(JSONB())


class ExperimentRunRecord(Base):
    """Persisted record of an experiment run."""

    __tablename__ = "experiment_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), name="run_id", primary_key=True, nullable=False)
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

    @property
    def run_id(self) -> uuid.UUID:
        return self.id

    @run_id.setter
    def run_id(self, value: uuid.UUID) -> None:
        self.id = value

    __table_args__ = (
        Index("idx_experiment_runs_experiment", "experiment_id"),
        Index("idx_experiment_runs_status", "status"),
    )
