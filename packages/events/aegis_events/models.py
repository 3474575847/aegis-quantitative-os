from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class LegacyEvent(BaseModel):
    """Legacy model for data events (scheduled for replacement)."""

    id: UUID = Field(default_factory=uuid4)
    event_type: str
    occurred_at: datetime
    data: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)


class BaseEvent(BaseModel):
    """Foundational event model for all system events."""

    model_config = ConfigDict(frozen=True)

    event_id: UUID = Field(default_factory=uuid4)
    event_type: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str
    correlation_id: UUID = Field(default_factory=uuid4)
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DataEvent(BaseEvent):
    """Event carrying research data (e.g. Market Prices)."""

    event_type: str = "DataEvent"
    data_schema: str


class SensorRunStarted(BaseEvent):
    event_type: str = "SensorRunStarted"


class SensorRunCompleted(BaseEvent):
    event_type: str = "SensorRunCompleted"


class SensorFailed(BaseEvent):
    event_type: str = "SensorFailed"
    error: str


class SignalGenerated(BaseEvent):
    event_type: str = "SignalGenerated"


class BacktestCompleted(BaseEvent):
    event_type: str = "BacktestCompleted"


class ErrorClassified(BaseEvent):
    event_type: str = "ErrorClassified"
    severity: str
