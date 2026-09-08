from collections.abc import Sequence

from aegis_storage.models.news import (
    ArticleClusterMemberRecord,
    CanonicalArticleRecord,
    RawNewsArticleRecord,
)
from aegis_storage.repositories.base import BaseRepository
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession


class NewsRepository(BaseRepository[CanonicalArticleRecord]):
    """
    Repository for querying canonical news clusters and raw news articles.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(CanonicalArticleRecord, session)

    async def save_raw_article(self, article: RawNewsArticleRecord) -> RawNewsArticleRecord:
        self.session.add(article)
        await self.session.flush()
        return article

    async def save_raw_articles(self, articles: Sequence[RawNewsArticleRecord]) -> None:
        self.session.add_all(articles)
        await self.session.flush()

    async def save_canonical_article(
        self,
        canonical: CanonicalArticleRecord,
        members: Sequence[ArticleClusterMemberRecord] | None = None,
    ) -> CanonicalArticleRecord:
        self.session.add(canonical)
        if members:
            self.session.add_all(members)
        await self.session.flush()
        return canonical

    async def get_latest_canonical(
        self, limit: int = 50, min_corroboration: float = 0.0
    ) -> Sequence[CanonicalArticleRecord]:
        query = (
            select(CanonicalArticleRecord)
            .where(CanonicalArticleRecord.corroboration_score >= min_corroboration)
            .order_by(desc(CanonicalArticleRecord.first_available_at))
            .limit(limit)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_latest_for_symbol(
        self, symbol: str, limit: int = 50
    ) -> Sequence[CanonicalArticleRecord]:
        """
        Return canonical articles whose ``entities`` column contains ``symbol``.

        Uses a database-agnostic approach: fetches recent records and filters
        in Python so the query works on both PostgreSQL (array) and SQLite (JSON).
        This is acceptable at the current data volumes; a GIN index on the
        PostgreSQL ``entities`` column should be added when volumes grow.
        """
        # Fetch a generous batch to filter from — entities column is a small array
        batch_limit = min(limit * 10, 500)
        query = (
            select(CanonicalArticleRecord)
            .order_by(desc(CanonicalArticleRecord.first_available_at))
            .limit(batch_limit)
        )
        result = await self.session.execute(query)
        all_records = result.scalars().all()

        sym_upper = symbol.upper()
        matching = [r for r in all_records if sym_upper in (r.entities or [])]
        return matching[:limit]

    async def get_cluster_by_id(self, cluster_id: str) -> CanonicalArticleRecord | None:
        query = select(CanonicalArticleRecord).where(
            CanonicalArticleRecord.cluster_id == cluster_id
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_raw_articles_by_cluster(
        self, canonical_id: str
    ) -> Sequence[RawNewsArticleRecord]:
        # canonical_id arrives as a string; UUID column requires a uuid.UUID object
        import uuid as _uuid

        try:
            canonical_uuid = _uuid.UUID(canonical_id)
        except (ValueError, AttributeError):
            return []

        query = (
            select(RawNewsArticleRecord)
            .join(
                ArticleClusterMemberRecord,
                ArticleClusterMemberRecord.raw_article_id == RawNewsArticleRecord.id,
            )
            .where(ArticleClusterMemberRecord.canonical_id == canonical_uuid)
            .order_by(desc(RawNewsArticleRecord.published_at))
        )
        result = await self.session.execute(query)
        return result.scalars().all()
