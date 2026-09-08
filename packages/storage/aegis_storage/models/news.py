import uuid
from datetime import UTC, datetime
from typing import Any

from aegis_storage.models.base import Base, SQLiteCompatibleARRAY, SQLiteCompatibleJSONB
from sqlalchemy import DateTime, Float, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class RawNewsArticleRecord(Base):
    """
    Storage record for raw ingested articles from all providers.
    Supports point-in-time timestamping, deduplication fingerprints, and full provenance.
    """

    __tablename__ = "raw_news_articles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_id: Mapped[str] = mapped_column(String(50), nullable=False)
    article_id: Mapped[str] = mapped_column(String(255), nullable=False)
    headline: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    publisher: Mapped[str] = mapped_column(String(255), nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    simhash_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entities: Mapped[list[str]] = mapped_column(
        SQLiteCompatibleARRAY(String(50)), default=list, nullable=False
    )
    provenance: Mapped[dict[str, Any]] = mapped_column(
        SQLiteCompatibleJSONB, default=dict, nullable=False
    )
    sentiment: Mapped[dict[str, Any]] = mapped_column(
        SQLiteCompatibleJSONB, default=dict, nullable=False
    )

    __table_args__ = (
        Index("idx_raw_news_published", "published_at"),
        Index("idx_raw_news_available", "available_at"),
        Index(
            "idx_raw_news_provider_art",
            "provider_id",
            "article_id",
            "published_at",
            unique=True,
        ),
        Index("idx_raw_news_simhash", "simhash_fingerprint"),
    )


class CanonicalArticleRecord(Base):
    """
    Deduplicated, corroborated canonical news story clustering multiple raw source reports.
    """

    __tablename__ = "canonical_articles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    cluster_id: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_headline: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    primary_publisher: Mapped[str] = mapped_column(String(255), nullable=False)
    publisher_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    first_available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    corroboration_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    entities: Mapped[list[str]] = mapped_column(
        SQLiteCompatibleARRAY(String(50)), default=list, nullable=False
    )
    sentiment_polarity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    economic_materiality: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    member_article_ids: Mapped[list[str]] = mapped_column(
        SQLiteCompatibleARRAY(String(255)), default=list, nullable=False
    )

    __table_args__ = (
        Index("idx_canonical_first_pub", "first_published_at"),
        Index(
            "idx_canonical_cluster_first_pub",
            "cluster_id",
            "first_published_at",
            unique=True,
        ),
        Index("idx_canonical_first_avail", "first_available_at"),
        Index("idx_canonical_corroboration", "corroboration_score"),
    )


class ArticleClusterMemberRecord(Base):
    """
    Link table connecting raw articles to their assigned canonical cluster.
    """

    __tablename__ = "article_cluster_members"

    canonical_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    raw_article_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    similarity_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("idx_cluster_members_canonical", "canonical_id"),
        Index("idx_cluster_members_raw", "raw_article_id"),
    )
