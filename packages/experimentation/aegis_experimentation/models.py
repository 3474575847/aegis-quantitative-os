from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class ExperimentStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ExperimentDefinition(BaseModel):
    """Configuration for a research experiment."""

    model_config = ConfigDict(frozen=True)

    experiment_id: UUID = Field(default_factory=uuid4)
    name: str
    description: str | None = None
    workflow_ids: list[UUID] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExperimentRun(BaseModel):
    """Execution record for an experiment."""

    run_id: UUID = Field(default_factory=uuid4)
    experiment_id: UUID
    status: ExperimentStatus = ExperimentStatus.PENDING
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    workflow_run_ids: list[UUID] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
