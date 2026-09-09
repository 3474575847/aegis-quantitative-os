import os
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from aegis_observability.logger import get_logger

from aegis_sensors.providers.base import NewsDataProvider
from aegis_sensors.providers.models import NewsArticle, ProvenanceBlock

logger = get_logger(__name__)


class AlphaVantageNewsProvider(NewsDataProvider):
    """
    Alpha Vantage financial news and sentiment provider adapter.
    Preserves raw provider sentiment, article sources, and topic classifications.
    """

    def __init__(
        self,
        api_key: str | None = None,
        client: httpx.AsyncClient | None = None,
        enabled: bool = True,
    ) -> None:
        super().__init__(provider_id="alpha_vantage", enabled=enabled)
        self.api_key = api_key or os.getenv("ALPHA_VANTAGE_API_KEY", "")
        self._client = client
        if not self.api_key:
            logger.info(
                "AlphaVantageNewsProvider initialized without API key (will degrade gracefully)"
            )

    async def _fetch(self, params: dict[str, Any]) -> list[NewsArticle]:
        if not self.enabled or not self.api_key:
            return []

        base_url = "https://www.alphavantage.co/query"
        req_params = {**params, "function": "NEWS_SENTIMENT", "apikey": self.api_key}

        try:
            if self._client:
                response = await self._client.get(base_url, params=req_params, timeout=12.0)
            else:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    response = await client.get(base_url, params=req_params)

            if response.status_code != 200:
                self.record_failure(Exception(f"HTTP {response.status_code}: {response.text}"))
                return []

            data = response.json()
            # Alpha Vantage returns Note or Information when rate limited
            if "Note" in data or "Information" in data:
                note = data.get("Note") or data.get("Information")
                logger.warning("Alpha Vantage rate limit message: %s", note)
                self.record_failure(Exception(f"Rate limited: {note}"))
                return []

            articles = self._normalize_payload(data)
            self.record_success()
            return articles
        except Exception as e:
            self.record_failure(e)
            return []

    def _normalize_payload(self, payload: dict[str, Any]) -> list[NewsArticle]:
        results: list[NewsArticle] = []
        raw_feed = payload.get("feed", [])
        now = datetime.now(UTC)

        for raw in raw_feed:
            try:
                time_pub = raw.get("time_published")
                published_at = now
                if time_pub and len(time_pub) >= 15:
                    try:
                        published_at = datetime.strptime(time_pub[:15], "%Y%m%dT%H%M%S").replace(
                            tzinfo=UTC
                        )
                    except Exception:
                        published_at = now

                available_at = now
                url = raw.get("url", "")
                parsed_url = urlparse(url)
                domain = raw.get("source_domain") or parsed_url.netloc.lower()

                ticker_sentiments = raw.get("ticker_sentiment", [])
                tickers = [t.get("ticker") for t in ticker_sentiments if t.get("ticker")]

                sentiment_score = raw.get("overall_sentiment_score")
                if sentiment_score is not None:
                    try:
                        sentiment_score = float(sentiment_score)
                    except ValueError:
                        sentiment_score = None

                sentiment_label = raw.get("overall_sentiment_label")
                art_id = str(raw.get("url", uuid.uuid4()))
                uid = uuid.uuid5(uuid.NAMESPACE_URL, url) if url else uuid.uuid4()
                canonical_id = f"alpha_vantage_{uid}"

                topics = [t.get("topic") for t in raw.get("topics", []) if t.get("topic")]

                provenance = ProvenanceBlock(
                    provider=self.provider_id,
                    source_name=raw.get("source", domain or "Alpha Vantage"),
                    source_domain=domain,
                    provider_article_id=art_id,
                    canonical_url=url,
                    published_at=published_at,
                    available_at=available_at,
                    retrieved_at=now,
                )

                article = NewsArticle(
                    id=uuid.uuid4(),
                    canonical_article_id=canonical_id,
                    provider=self.provider_id,
                    provider_article_id=art_id,
                    source_name=raw.get("source", domain or "Alpha Vantage"),
                    source_domain=domain,
                    canonical_url=url,
                    title=raw.get("title", ""),
                    description=raw.get("summary"),
                    published_at=published_at,
                    available_at=available_at,
                    retrieved_at=now,
                    authors=raw.get("authors", []),
                    image_url=raw.get("banner_image"),
                    tickers=tickers,
                    topics=topics,
                    provider_sentiment=sentiment_label,
                    provider_sentiment_score=sentiment_score,
                    aegis_sentiment=sentiment_score,
                    raw_metadata={"category_within_source": raw.get("category_within_source")},
                    provenance=provenance,
                )
                results.append(article)
            except Exception as e:
                logger.warning("Failed to normalize Alpha Vantage item: %s", e)

        return results

    async def get_latest_news(self, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"limit": min(limit, 50)})

    async def search_news(self, query: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"topics": query, "limit": min(limit, 50)})

    async def get_company_news(self, symbol: str, limit: int = 50) -> list[NewsArticle]:
        clean_sym = symbol.upper().replace("-USD", "")
        return await self._fetch({"tickers": clean_sym, "limit": min(limit, 50)})

    async def get_topic_news(self, topic: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"topics": topic, "limit": min(limit, 50)})
