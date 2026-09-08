"""
Tests for the P0.4 news REST API endpoints.

Covers:
  GET /api/news/latest          — empty DB, non-empty DB, corroboration filter, limit
  GET /api/news/symbol/{symbol} — entity resolution, no results, alias resolution
  GET /api/news/cluster/{id}    — found with members, not found

All tests use the SQLite-backed DatabaseManager from conftest.py via the
async_client fixture so no running PostgreSQL is needed.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from aegis_storage.models.news import (
    ArticleClusterMemberRecord,
    CanonicalArticleRecord,
    RawNewsArticleRecord,
)

# ---------------------------------------------------------------------------
# Helpers — lightweight DB record builders
# ---------------------------------------------------------------------------


def _canonical(
    cluster_id: str,
    headline: str,
    publisher: str = "reuters.com",
    publisher_count: int = 1,
    corroboration_score: float = 0.50,
    entities: list[str] | None = None,
    sentiment: float = 0.0,
) -> CanonicalArticleRecord:
    now = datetime.now(UTC)
    return CanonicalArticleRecord(
        id=uuid.uuid4(),
        cluster_id=cluster_id,
        primary_headline=headline,
        primary_url=f"https://reuters.com/{cluster_id}",
        primary_publisher=publisher,
        publisher_count=publisher_count,
        first_published_at=now,
        first_available_at=now,
        corroboration_score=corroboration_score,
        entities=entities or [],
        sentiment_polarity=sentiment,
        economic_materiality=0.0,
        member_article_ids=[],
    )


def _raw_article(
    provider_id: str, headline: str, canonical_id: uuid.UUID
) -> tuple[RawNewsArticleRecord, ArticleClusterMemberRecord]:
    now = datetime.now(UTC)
    raw_id = uuid.uuid4()
    raw = RawNewsArticleRecord(
        id=raw_id,
        provider_id=provider_id,
        article_id=str(uuid.uuid4()),
        headline=headline,
        url="https://reuters.com/article",
        publisher="reuters.com",
        published_at=now,
        available_at=now,
        entities=[],
        provenance={"provider": provider_id},
        sentiment={},
    )
    member = ArticleClusterMemberRecord(
        canonical_id=canonical_id,
        raw_article_id=raw_id,
        similarity_score=1.0,
        added_at=now,
    )
    return raw, member


async def _seed_db(records: list[Any]) -> None:
    """Insert ORM records directly via the patched db_manager."""
    import aegis_api.main as m

    async for session in m.db_manager.get_session():
        session.add_all(records)


# ---------------------------------------------------------------------------
# GET /api/news/latest
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetLatestNews:
    async def test_empty_database_returns_empty_list(self, async_client: Any) -> None:
        resp = await async_client.get("/api/news/latest")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_canonical_articles(self, async_client: Any) -> None:
        c1 = _canonical("cluster-abc-1", "NVIDIA earnings beat estimates")
        c2 = _canonical("cluster-abc-2", "Fed holds rates steady")
        await _seed_db([c1, c2])

        resp = await async_client.get("/api/news/latest")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        headlines = {a["primary_headline"] for a in data}
        assert "NVIDIA earnings beat estimates" in headlines
        assert "Fed holds rates steady" in headlines

    async def test_response_shape_is_complete(self, async_client: Any) -> None:
        c = _canonical("cluster-shape-1", "Apple launches new iPhone")
        await _seed_db([c])

        resp = await async_client.get("/api/news/latest")
        assert resp.status_code == 200
        article = resp.json()[0]

        required_fields = {
            "cluster_id",
            "primary_headline",
            "primary_url",
            "primary_publisher",
            "publisher_count",
            "first_published_at",
            "first_available_at",
            "corroboration_score",
            "entities",
            "sentiment_polarity",
            "member_article_ids",
        }
        assert required_fields.issubset(article.keys())

    async def test_corroboration_filter_excludes_low_scores(self, async_client: Any) -> None:
        low = _canonical("cluster-low", "Rumour only", corroboration_score=0.50)
        high = _canonical("cluster-high", "Widely confirmed story", corroboration_score=0.95)
        await _seed_db([low, high])

        resp = await async_client.get("/api/news/latest", params={"min_corroboration": 0.75})
        assert resp.status_code == 200
        data = resp.json()
        cluster_ids = {a["cluster_id"] for a in data}
        assert "cluster-high" in cluster_ids
        assert "cluster-low" not in cluster_ids

    async def test_limit_is_respected(self, async_client: Any) -> None:
        records = [_canonical(f"cluster-lim-{i}", f"Story {i}") for i in range(10)]
        await _seed_db(records)

        resp = await async_client.get("/api/news/latest", params={"limit": 3})
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    async def test_limit_must_be_positive(self, async_client: Any) -> None:
        resp = await async_client.get("/api/news/latest", params={"limit": 0})
        assert resp.status_code == 422

    async def test_corroboration_score_rounded_to_2dp(self, async_client: Any) -> None:
        c = _canonical("cluster-round-1", "Score test", corroboration_score=0.9500001)
        await _seed_db([c])

        resp = await async_client.get("/api/news/latest")
        article = resp.json()[0]
        # 2 decimal places per blueprint §18.4
        assert article["corroboration_score"] == 0.95


# ---------------------------------------------------------------------------
# GET /api/news/symbol/{symbol}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetNewsBySymbol:
    async def test_returns_articles_matching_entity(self, async_client: Any) -> None:
        c_nvda = _canonical("cluster-sym-nvda", "NVIDIA AI chip demand surges", entities=["NVDA"])
        c_aapl = _canonical("cluster-sym-aapl", "Apple Vision Pro review", entities=["AAPL"])
        await _seed_db([c_nvda, c_aapl])

        resp = await async_client.get("/api/news/symbol/NVDA")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert all("NVDA" in a["entities"] for a in data)

    async def test_empty_result_for_unknown_symbol(self, async_client: Any) -> None:
        resp = await async_client.get("/api/news/symbol/ZZZZ")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_alias_resolution_apple_to_aapl(self, async_client: Any) -> None:
        """'Apple' must resolve to 'AAPL' via EntityResolver before DB query."""
        c = _canonical("cluster-alias-aapl", "Apple quarterly results", entities=["AAPL"])
        await _seed_db([c])

        # Query with the company name, not the ticker
        resp = await async_client.get("/api/news/symbol/Apple")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(a["cluster_id"] == "cluster-alias-aapl" for a in data)

    async def test_bitcoin_alias_resolution(self, async_client: Any) -> None:
        """'Bitcoin' must resolve to 'BTC'."""
        c = _canonical("cluster-btc-alias", "Bitcoin hits new ATH", entities=["BTC"])
        await _seed_db([c])

        resp = await async_client.get("/api/news/symbol/Bitcoin")
        assert resp.status_code == 200
        data = resp.json()
        assert any(a["cluster_id"] == "cluster-btc-alias" for a in data)

    async def test_case_insensitive_ticker(self, async_client: Any) -> None:
        c = _canonical("cluster-case-nvda", "NVIDIA deal", entities=["NVDA"])
        await _seed_db([c])

        resp = await async_client.get("/api/news/symbol/nvda")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# GET /api/news/cluster/{cluster_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetNewsCluster:
    async def test_not_found_returns_404(self, async_client: Any) -> None:
        resp = await async_client.get("/api/news/cluster/nonexistent-cluster-xyz")
        assert resp.status_code == 404

    async def test_returns_canonical_with_no_raw_members(self, async_client: Any) -> None:
        c = _canonical("cluster-detail-1", "Lone headline, no raw members")
        await _seed_db([c])

        resp = await async_client.get("/api/news/cluster/cluster-detail-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["canonical"]["cluster_id"] == "cluster-detail-1"
        assert data["raw_article_count"] == 0
        assert data["raw_articles"] == []

    async def test_returns_canonical_with_raw_members(self, async_client: Any) -> None:
        c = _canonical("cluster-detail-2", "Multi-provider story")
        raw1, member1 = _raw_article("marketaux", "Multi-provider story", c.id)
        raw2, member2 = _raw_article("finnhub", "Multi-provider story (Finnhub)", c.id)
        # Update canonical's member_article_ids to reflect members
        c.member_article_ids = [str(raw1.id), str(raw2.id)]
        await _seed_db([c, raw1, raw2, member1, member2])

        resp = await async_client.get("/api/news/cluster/cluster-detail-2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["canonical"]["cluster_id"] == "cluster-detail-2"
        assert data["raw_article_count"] == 2
        assert len(data["raw_articles"]) == 2
        provider_ids = {a["provider_id"] for a in data["raw_articles"]}
        assert provider_ids == {"marketaux", "finnhub"}

    async def test_raw_article_shape_is_complete(self, async_client: Any) -> None:
        c = _canonical("cluster-shape-raw-1", "Test article shape")
        raw, member = _raw_article("alpha_vantage", "Test shape headline", c.id)
        c.member_article_ids = [str(raw.id)]
        await _seed_db([c, raw, member])

        resp = await async_client.get("/api/news/cluster/cluster-shape-raw-1")
        assert resp.status_code == 200
        raw_article = resp.json()["raw_articles"][0]
        required_fields = {
            "id",
            "provider_id",
            "headline",
            "url",
            "publisher",
            "published_at",
            "available_at",
            "entities",
            "provenance",
        }
        assert required_fields.issubset(raw_article.keys())

    async def test_provenance_available_at_is_present(self, async_client: Any) -> None:
        """
        PIT invariant: available_at must be returned for every raw article
        so callers can verify when the data became actionable.
        """
        c = _canonical("cluster-pit-1", "PIT test headline")
        raw, member = _raw_article("gdelt", "PIT test headline", c.id)
        c.member_article_ids = [str(raw.id)]
        await _seed_db([c, raw, member])

        resp = await async_client.get("/api/news/cluster/cluster-pit-1")
        raw_record = resp.json()["raw_articles"][0]
        assert raw_record["available_at"] is not None
        # Must be a valid ISO timestamp
        datetime.fromisoformat(raw_record["available_at"])
