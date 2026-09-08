import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProvenanceBlock(BaseModel):
    """Immutable audit record detailing the origin and lifecycle of an observation."""

    model_config = ConfigDict(frozen=True)

    provider: str
    source_name: str
    source_domain: str
    provider_article_id: str
    canonical_url: str
    published_at: datetime
    available_at: datetime  # Non-negotiable point-in-time availability barrier
    retrieved_at: datetime
    ingestion_job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    normalization_version: str = "1.0.0"


class NewsArticle(BaseModel):
    """Normalized canonical representation of a news observation from an external provider."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    canonical_article_id: str
    provider: str
    provider_article_id: str
    source_name: str
    source_domain: str
    canonical_url: str
    title: str
    description: str | None = None
    language: str = "en"
    published_at: datetime
    available_at: datetime  # Crucial for look-ahead protection
    retrieved_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    authors: list[str] = Field(default_factory=list)
    image_url: str | None = None
    tickers: list[str] = Field(default_factory=list)
    companies: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    provider_sentiment: str | None = None
    provider_sentiment_score: float | None = None
    aegis_sentiment: float | None = None
    confidence: float | None = None
    data_quality: str = "VERIFIED"
    raw_metadata: dict[str, Any] = Field(default_factory=dict)
    provenance: ProvenanceBlock


class CanonicalArticle(BaseModel):
    """
    Resolved entity representing a single news event that may have been reported
    across multiple distinct providers and publishers.
    """

    canonical_article_id: str
    title: str
    canonical_url: str
    published_at: datetime
    available_at: datetime  # Earliest available_at across provider observations
    retrieved_at: datetime
    tickers: list[str] = Field(default_factory=list)
    companies: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)

    # Core distinction: provider count vs independent publisher count
    independent_publishers: list[str] = Field(default_factory=list)
    independent_publisher_count: int = 1
    provider_count: int = 1
    provider_observations: list[ProvenanceBlock] = Field(default_factory=list)

    # Institutional sentiment & corroboration
    provider_sentiments: list[float] = Field(default_factory=list)
    aegis_sentiment: float = 0.0
    corroboration_score: float = 0.0
    deduplication_version: str = "1.0.0"
