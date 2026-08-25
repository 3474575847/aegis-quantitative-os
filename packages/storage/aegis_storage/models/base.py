import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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


class Base(DeclarativeBase):
    """Base class for all models."""

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
