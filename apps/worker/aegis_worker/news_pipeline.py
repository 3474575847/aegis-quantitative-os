"""
Aegis-Alpha News Ingestion Pipeline (P0.3)
==========================================
Polls Stage 1 providers (Marketaux, Alpha Vantage, Finnhub, GDELT),
deduplicates via ArticleDeduplicationEngine, resolves entities via EntityResolver,
and persists canonical news clusters to the database.

Strict point-in-time (PIT) semantics: every article's `available_at` is set
to the time of ingestion (when the market could first know the data), not the
publication timestamp, ensuring zero look-ahead bias in backtests.
"""

import uuid
from datetime import UTC, datetime

from aegis_observability.logger import get_logger
from aegis_sensors.deduplication import ArticleDeduplicationEngine
from aegis_sensors.entity_resolution import EntityResolver
from aegis_sensors.providers.models import CanonicalArticle, NewsArticle, ProvenanceBlock
from aegis_sensors.providers.registry import ProviderRegistry
from aegis_storage.database import DatabaseManager
from aegis_storage.models.news import (
    ArticleClusterMemberRecord,
    CanonicalArticleRecord,
    RawNewsArticleRecord,
)
from aegis_storage.repositories.news import NewsRepository

logger = get_logger(__name__)


def _build_raw_record(
    art: NewsArticle, ingest_at: datetime
) -> tuple[uuid.UUID, RawNewsArticleRecord]:
    """Convert a NewsArticle into a DB record, stamping PIT available_at."""
    raw_id = uuid.uuid4()
    provenance: ProvenanceBlock = art.provenance
    record = RawNewsArticleRecord(
        id=raw_id,
        provider_id=provenance.provider,
        article_id=art.provider_article_id,
        headline=art.title,
        body=art.description,
        url=art.canonical_url,
        author=art.authors[0] if art.authors else None,
        publisher=art.source_name,
        published_at=art.published_at,
        # PIT invariant: available_at is stamped at ingestion time, never earlier
        available_at=ingest_at,
        ingested_at=ingest_at,
        simhash_fingerprint=None,  # populated later if simhash is computed
        entities=list(art.tickers),
        provenance={
            "provider": provenance.provider,
            "source_name": provenance.source_name,
            "source_domain": provenance.source_domain,
            "provider_article_id": provenance.provider_article_id,
            "canonical_url": provenance.canonical_url,
            "published_at": provenance.published_at.isoformat(),
            "available_at": provenance.available_at.isoformat(),
            "retrieved_at": provenance.retrieved_at.isoformat(),
        },
        sentiment={},
    )
    return raw_id, record


def _build_canonical_record(
    canonical: CanonicalArticle,
    canonical_uuid: uuid.UUID,
    member_raw_ids: list[uuid.UUID],
    ingest_at: datetime,
    entity_resolver: EntityResolver,
) -> CanonicalArticleRecord:
    """Convert a CanonicalArticle into a DB record."""
    # Bug fix: the method is extract_entities_from_text, not extract_tickers
    resolved_tickers = entity_resolver.extract_entities_from_text(canonical.title)
    # Merge provider-supplied tickers with entity-resolved tickers
    all_tickers = sorted(set(canonical.tickers) | set(resolved_tickers))

    return CanonicalArticleRecord(
        id=canonical_uuid,
        cluster_id=canonical.canonical_article_id,
        primary_headline=canonical.title,
        summary=None,
        primary_url=canonical.canonical_url,
        primary_publisher=(
            canonical.independent_publishers[0] if canonical.independent_publishers else "unknown"
        ),
        publisher_count=canonical.independent_publisher_count,
        first_published_at=canonical.published_at,
        first_available_at=ingest_at,  # PIT: earliest time market could act on this
        corroboration_score=canonical.corroboration_score,
        entities=all_tickers,
        sentiment_polarity=canonical.aegis_sentiment,
        economic_materiality=0.0,
        member_article_ids=[str(rid) for rid in member_raw_ids],
    )


class NewsIngestionPipeline:
    """
    Point-in-time correct news ingestion pipeline.

    Pipeline stages:
      1. Fetch raw articles from all enabled providers concurrently.
      2. Stamp `available_at = now()` — the PIT when data became actionable.
      3. Deduplicate and cluster using title similarity + URL canonical matching.
      4. Resolve entity mentions to canonical ticker symbols.
      5. Persist `RawNewsArticleRecord` and `CanonicalArticleRecord` to DB.
    """

    def __init__(
        self,
        db_manager: DatabaseManager,
        registry: ProviderRegistry | None = None,
    ) -> None:
        self.db_manager = db_manager
        self.registry = registry or ProviderRegistry()
        self.deduplicator = ArticleDeduplicationEngine()
        self.entity_resolver = EntityResolver()

    async def run_cycle(self) -> dict[str, int]:
        """
        Execute one full ingestion cycle.

        Returns:
            dict with counts: fetched, saved_raw, new_clusters.
        """
        ingest_at = datetime.now(UTC)  # PIT anchor for this cycle

        # --- Stage 1: Concurrent fetch from all enabled providers ---
        raw_articles: list[NewsArticle] = await self.registry.fetch_all_latest(
            limit_per_provider=25
        )
        logger.info("News ingestion cycle: fetched %d raw articles", len(raw_articles))

        if not raw_articles:
            return {"fetched": 0, "saved_raw": 0, "new_clusters": 0}

        # --- Stage 2: Deduplicate → canonical clusters ---
        # Use deduplicate_with_clusters so we have direct access to the original
        # NewsArticle members per cluster — no fragile post-hoc re-matching needed.
        canonicals, cluster_map = self.deduplicator.deduplicate_with_clusters(raw_articles)
        logger.info("Deduplicated to %d canonical articles", len(canonicals))

        saved_raw = 0
        new_clusters = 0

        # --- Stage 3: Persist each canonical cluster ---
        for canonical in canonicals:
            try:
                async for session in self.db_manager.get_session():
                    repo = NewsRepository(session)

                    # Skip if cluster already persisted
                    existing = await repo.get_cluster_by_id(canonical.canonical_article_id)
                    if existing is not None:
                        if canonical.independent_publisher_count > existing.publisher_count:
                            existing.publisher_count = canonical.independent_publisher_count
                            existing.corroboration_score = canonical.corroboration_score
                        continue

                    canonical_uuid = uuid.uuid4()
                    raw_records: list[RawNewsArticleRecord] = []
                    member_records: list[ArticleClusterMemberRecord] = []
                    member_raw_ids: list[uuid.UUID] = []

                    # Use direct cluster map — no fragile post-hoc re-matching
                    cluster_articles = cluster_map.get(canonical.canonical_article_id, [])

                    for art in cluster_articles:
                        raw_id, raw_record = _build_raw_record(art, ingest_at)
                        raw_records.append(raw_record)
                        member_raw_ids.append(raw_id)
                        member_records.append(
                            ArticleClusterMemberRecord(
                                canonical_id=canonical_uuid,
                                raw_article_id=raw_id,
                                similarity_score=1.0,
                                added_at=ingest_at,
                            )
                        )
                        saved_raw += 1

                    canonical_record = _build_canonical_record(
                        canonical, canonical_uuid, member_raw_ids, ingest_at, self.entity_resolver
                    )

                    await repo.save_raw_articles(raw_records)
                    await repo.save_canonical_article(canonical_record, member_records)
                    new_clusters += 1

            except Exception as exc:
                logger.debug(
                    "Skipped cluster %s (likely duplicate): %s",
                    canonical.canonical_article_id,
                    exc,
                )

        logger.info(
            "Ingestion cycle complete: fetched=%d saved_raw=%d new_clusters=%d",
            len(raw_articles),
            saved_raw,
            new_clusters,
        )
        return {
            "fetched": len(raw_articles),
            "saved_raw": saved_raw,
            "new_clusters": new_clusters,
        }
