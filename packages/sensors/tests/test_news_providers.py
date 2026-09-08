from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aegis_sensors.providers.alphavantage import AlphaVantageNewsProvider
from aegis_sensors.providers.finnhub import FinnhubNewsProvider
from aegis_sensors.providers.gdelt import GDELTNewsProvider
from aegis_sensors.providers.marketaux import MarketauxNewsProvider
from aegis_sensors.providers.registry import ProviderRegistry


def _make_mock_response(status_code: int, payload: Any | None = None, text: str = "") -> MagicMock:
    """
    Build a mock httpx.Response.
    httpx.Response.json() is SYNCHRONOUS, so mock_resp.json must be a MagicMock,
    NOT an AsyncMock, or it will return a coroutine instead of the dict.
    """
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.text = text
    if payload is not None:
        mock_resp.json = MagicMock(return_value=payload)
    return mock_resp


@pytest.mark.asyncio
async def test_marketaux_provider_normalization() -> None:
    provider = MarketauxNewsProvider(api_key="test_key")
    mock_payload = {
        "data": [
            {
                "uuid": "mkt-12345",
                "title": "NVIDIA beats earnings estimates on AI surge",
                "description": "Chipmaker reports record quarterly datacenter revenue.",
                "url": "https://www.reuters.com/technology/nvidia-earnings-surge?utm_source=rss",
                "published_at": "2026-08-25T14:30:00.000000Z",
                "source": "reuters.com",
                "language": "en",
                "entities": [
                    {
                        "symbol": "NVDA",
                        "name": "NVIDIA Corporation",
                        "sentiment_score": 0.85,
                    }
                ],
            }
        ]
    }

    mock_resp = _make_mock_response(200, mock_payload)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_resp):
        articles = await provider.get_company_news("NVDA")

    assert len(articles) == 1
    art = articles[0]
    assert art.provider == "marketaux"
    assert art.provider_article_id == "mkt-12345"
    assert art.title == "NVIDIA beats earnings estimates on AI surge"
    assert "NVDA" in art.tickers
    assert "NVIDIA Corporation" in art.companies
    assert art.provider_sentiment_score == 0.85
    assert art.provider_sentiment == "positive"
    assert art.provenance.provider == "marketaux"
    assert art.provenance.source_domain == "www.reuters.com"
    # available_at must be populated
    assert art.available_at is not None
    assert art.published_at.year == 2026


@pytest.mark.asyncio
async def test_marketaux_provider_graceful_error_handling() -> None:
    provider = MarketauxNewsProvider(api_key="test_key")
    mock_resp = _make_mock_response(429, text="Rate limit reached")

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_resp):
        articles = await provider.get_latest_news()

    assert articles == []
    assert provider._consecutive_failures == 1
    health = provider.get_health_status()
    assert health["provider_id"] == "marketaux"


@pytest.mark.asyncio
async def test_alphavantage_provider_normalization() -> None:
    provider = AlphaVantageNewsProvider(api_key="test_key")
    mock_payload = {
        "feed": [
            {
                "title": "Federal Reserve signals steady rate stance",
                "url": "https://www.bloomberg.com/news/fed-rate-decision",
                "time_published": "20260825T180000",
                "authors": ["John Doe"],
                "summary": "Fed officials note persistent services inflation.",
                "source": "Bloomberg",
                "source_domain": "bloomberg.com",
                "overall_sentiment_score": -0.25,
                "overall_sentiment_label": "Somewhat-Bearish",
                "ticker_sentiment": [{"ticker": "SPY", "relevance_score": "0.8"}],
                "topics": [{"topic": "Economy - Monetary"}],
            }
        ]
    }

    mock_resp = _make_mock_response(200, mock_payload)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_resp):
        articles = await provider.get_latest_news()

    assert len(articles) == 1
    art = articles[0]
    assert art.provider == "alpha_vantage"
    assert art.title == "Federal Reserve signals steady rate stance"
    assert art.provider_sentiment_score == -0.25
    assert "SPY" in art.tickers
    assert "Economy - Monetary" in art.topics
    assert art.provenance.source_domain == "bloomberg.com"
    assert art.available_at is not None


@pytest.mark.asyncio
async def test_finnhub_provider_normalization() -> None:
    provider = FinnhubNewsProvider(api_key="test_key")
    mock_payload = [
        {
            "category": "company",
            "datetime": 1724600000,
            "headline": "Apple announces next-generation chip architecture",
            "id": 998877,
            "image": "https://images.example.com/aapl.jpg",
            "related": "AAPL",
            "source": "CNBC",
            "summary": "New architecture improves energy efficiency.",
            "url": "https://www.cnbc.com/apple-silicon-launch",
        }
    ]

    mock_resp = _make_mock_response(200, mock_payload)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_resp):
        articles = await provider.get_company_news("AAPL")

    assert len(articles) == 1
    art = articles[0]
    assert art.provider == "finnhub"
    assert art.provider_article_id == "998877"
    assert art.title == "Apple announces next-generation chip architecture"
    assert "AAPL" in art.tickers
    assert art.provenance.source_name == "CNBC"
    assert art.available_at is not None


@pytest.mark.asyncio
async def test_gdelt_provider_no_api_key_required() -> None:
    """Verify original GDELT public API works without an API key."""
    provider = GDELTNewsProvider(base_url="https://api.gdeltproject.org/api/v2")
    mock_payload = {
        "articles": [
            {
                "url": "https://www.bbc.com/news/world-global-energy-supply",
                "title": "Global energy transition accelerates amid policy incentives",
                "seendate": "20260825T110000Z",
                "domain": "bbc.com",
                "language": "English",
                "sourcecountry": "United Kingdom",
            }
        ]
    }

    mock_resp = _make_mock_response(200, mock_payload)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_resp):
        articles = await provider.search_news("energy policy")

    assert len(articles) == 1
    art = articles[0]
    assert art.provider == "gdelt"
    assert art.provenance.source_domain == "bbc.com"
    assert art.title == "Global energy transition accelerates amid policy incentives"
    assert art.available_at is not None


@pytest.mark.asyncio
async def test_provider_registry_coordination() -> None:
    registry = ProviderRegistry()
    health = registry.get_health_summary()
    assert len(health) >= 4
    provider_ids = [h["provider_id"] for h in health]
    assert "marketaux" in provider_ids
    assert "alpha_vantage" in provider_ids
    assert "finnhub" in provider_ids
    assert "gdelt" in provider_ids
