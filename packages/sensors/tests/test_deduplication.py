import uuid
from datetime import UTC, datetime, timedelta

import pytest
from aegis_sensors.deduplication import (
    ArticleDeduplicationEngine,
    normalize_canonical_url,
    title_similarity,
)
from aegis_sensors.entity_resolution import EntityResolver
from aegis_sensors.providers.models import NewsArticle, ProvenanceBlock


def _make_article(
    provider: str,
    title: str,
    url: str,
    source_domain: str,
    published_at: datetime,
    available_at: datetime,
    sentiment_score: float | None = None,
    tickers: list[str] | None = None,
) -> NewsArticle:
    prov = ProvenanceBlock(
        provider=provider,
        source_name=source_domain,
        source_domain=source_domain,
        provider_article_id=str(uuid.uuid4()),
        canonical_url=url,
        published_at=published_at,
        available_at=available_at,
        retrieved_at=available_at,
    )
    return NewsArticle(
        canonical_article_id=f"{provider}_{uuid.uuid4()}",
        provider=provider,
        provider_article_id=prov.provider_article_id,
        source_name=source_domain,
        source_domain=source_domain,
        canonical_url=url,
        title=title,
        published_at=published_at,
        available_at=available_at,
        retrieved_at=available_at,
        tickers=tickers or [],
        provider_sentiment_score=sentiment_score,
        provenance=prov,
    )


def test_normalize_canonical_url() -> None:
    url1 = "http://reuters.com/business/tech-earnings/?utm_source=twitter&utm_medium=social"
    url2 = "https://reuters.com/business/tech-earnings"
    assert normalize_canonical_url(url1) == "https://reuters.com/business/tech-earnings"
    assert normalize_canonical_url(url2) == "https://reuters.com/business/tech-earnings"


def test_title_similarity() -> None:
    t1 = "NVIDIA Reports Record Q2 Revenue Driven by AI Demand"
    t2 = "Nvidia Reports Record Second-Quarter Revenue on Strong AI Demand"
    t3 = "Federal Reserve Holds Interest Rates Steady"
    assert title_similarity(t1, t2) > 0.60
    assert title_similarity(t1, t3) < 0.20


def test_deduplication_distinguishes_provider_count_from_publisher_count() -> None:
    """
    Refinement 5 constraint:
    One Reuters article returned by 3 providers (Marketaux, Finnhub, Alpha Vantage)
    must yield:
      - 1 CanonicalArticle
      - provider_count = 3
      - independent_publisher_count = 1
    """
    engine = ArticleDeduplicationEngine()
    now = datetime.now(UTC)
    t_pub = now - timedelta(hours=2)

    art_marketaux = _make_article(
        provider="marketaux",
        title="Fed signals patience on rate cuts as inflation persists",
        url="https://www.reuters.com/markets/us/fed-rate-patience?utm_source=mkx",
        source_domain="reuters.com",
        published_at=t_pub,
        available_at=now - timedelta(minutes=45),
        sentiment_score=-0.2,
        tickers=["SPY"],
    )

    art_finnhub = _make_article(
        provider="finnhub",
        title="Fed signals patience on rate cuts as inflation persists",
        url="https://www.reuters.com/markets/us/fed-rate-patience",
        source_domain="reuters.com",
        published_at=t_pub,
        available_at=now - timedelta(minutes=30),
        sentiment_score=-0.2,
        tickers=["SPY"],
    )

    art_alphavantage = _make_article(
        provider="alpha_vantage",
        title="Fed signals patience on rate cuts as inflation persists",
        url="https://www.reuters.com/markets/us/fed-rate-patience?utm_medium=partner",
        source_domain="reuters.com",
        published_at=t_pub,
        available_at=now - timedelta(minutes=15),
        sentiment_score=-0.2,
        tickers=["SPY"],
    )

    canonical = engine.deduplicate([art_marketaux, art_finnhub, art_alphavantage])

    assert len(canonical) == 1
    c = canonical[0]
    # Exact verification of constraint:
    assert c.provider_count == 3
    assert c.independent_publisher_count == 1
    assert c.independent_publishers == ["reuters.com"]
    # Point-in-time: takes the earliest time Aegis saw it
    assert c.available_at == now - timedelta(minutes=45)
    # Corroboration score for single publisher is conservative (0.50), not inflated by 3 feeds
    assert c.corroboration_score == 0.50


def test_deduplication_with_multiple_independent_publishers() -> None:
    """
    Multiple distinct publishers reporting on the same event increase corroboration.
    """
    engine = ArticleDeduplicationEngine()
    now = datetime.now(UTC)
    t_pub = now - timedelta(hours=1)

    art1 = _make_article(
        provider="marketaux",
        title="Apple unveils M4 chips for next-generation Mac lineup",
        url="https://www.bloomberg.com/news/apple-m4-launch",
        source_domain="bloomberg.com",
        published_at=t_pub,
        available_at=now - timedelta(minutes=20),
        sentiment_score=0.8,
        tickers=["AAPL"],
    )

    art2 = _make_article(
        provider="finnhub",
        title="Apple unveils M4 chips for next-generation Mac lineup",
        url="https://www.wsj.com/tech/apple-m4-macs",
        source_domain="wsj.com",
        published_at=t_pub,
        available_at=now - timedelta(minutes=10),
        sentiment_score=0.7,
        tickers=["AAPL"],
    )

    canonical = engine.deduplicate([art1, art2])
    assert len(canonical) == 1
    c = canonical[0]
    assert c.independent_publisher_count == 2
    assert "bloomberg.com" in c.independent_publishers
    assert "wsj.com" in c.independent_publishers
    # 2 independent publishers yields higher corroboration
    assert c.corroboration_score == 0.75
    assert c.aegis_sentiment == pytest.approx(0.75, abs=1e-3)


def test_entity_resolver() -> None:
    resolver = EntityResolver()
    assert resolver.resolve_symbol("Apple Inc.") == "AAPL"
    assert resolver.resolve_symbol("Apple") == "AAPL"
    assert resolver.resolve_symbol("NVIDIA Corporation") == "NVDA"
    assert resolver.resolve_symbol("Bitcoin") == "BTC"
    assert resolver.resolve_symbol("BTC-USD") == "BTC"
    assert resolver.resolve_symbol("Ethereum") == "ETH"

    text = "Apple and NVIDIA team up for AI acceleration in enterprise products"
    entities = resolver.extract_entities_from_text(text)
    assert "AAPL" in entities
    assert "NVDA" in entities
