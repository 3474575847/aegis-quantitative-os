import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExperimentStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class RankingStrategy(StrEnum):
    NEWEST = "NEWEST"
    OLDEST = "OLDEST"
    MOST_RUNS = "MOST_RUNS"
    FASTEST_COMPLETION = "FASTEST_COMPLETION"
    HIGHEST_SUCCESS_RATE = "HIGHEST_SUCCESS_RATE"


class ExperimentDefinition(BaseModel):
    """Configuration for a research experiment."""

    model_config = ConfigDict(frozen=True)

    experiment_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    description: str | None = None
    workflow_ids: list[uuid.UUID] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ExperimentRun(BaseModel):
    """Execution record for an experiment."""

    run_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    experiment_id: uuid.UUID
    status: ExperimentStatus = ExperimentStatus.PENDING
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    workflow_run_ids: list[uuid.UUID] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PaginationParams(BaseModel):
    """Pagination parameters for queries."""

    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ExperimentFilter(BaseModel):
    """Filters for experiment discovery."""

    status: ExperimentStatus | None = None
    tags: list[str] | None = None
    created_after: datetime | None = None
    created_before: datetime | None = None
    metadata_filters: dict[str, Any] | None = None


class ExperimentQuery(BaseModel):
    """Structured query for experiments."""

    filter: ExperimentFilter = Field(default_factory=ExperimentFilter)
    ranking: RankingStrategy = RankingStrategy.NEWEST
    pagination: PaginationParams = Field(default_factory=PaginationParams)


class QueryResult(BaseModel):
    """Paginated result of an experiment query."""

    items: list[ExperimentDefinition]
    total_count: int
    limit: int
    offset: int
