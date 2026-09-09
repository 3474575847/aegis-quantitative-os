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


class MarketauxNewsProvider(NewsDataProvider):
    """
    Marketaux financial news provider adapter.
    Preserves raw provider sentiment, financial entity mapping, and canonical URLs.
    """

    def __init__(
        self,
        api_key: str | None = None,
        client: httpx.AsyncClient | None = None,
        enabled: bool = True,
    ) -> None:
        super().__init__(provider_id="marketaux", enabled=enabled)
        self.api_key = api_key or os.getenv("MARKETAUX_API_KEY", "")
        self._client = client
        if not self.api_key:
            logger.info(
                "MarketauxNewsProvider initialized without API key (will degrade gracefully)"
            )

    async def _fetch(self, params: dict[str, Any]) -> list[NewsArticle]:
        if not self.enabled or not self.api_key:
            return []

        base_url = "https://api.marketaux.com/v1/news/all"
        req_params = {**params, "api_token": self.api_key}
        headers = {"User-Agent": "AegisAlpha/0.1"}

        try:
            if self._client:
                response = await self._client.get(
                    base_url, params=req_params, headers=headers, timeout=10.0
                )
            else:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(base_url, params=req_params, headers=headers)

            if response.status_code != 200:
                self.record_failure(Exception(f"HTTP {response.status_code}: {response.text}"))
                return []

            data = response.json()
            articles = self._normalize_payload(data)
            self.record_success()
            return articles
        except Exception as e:
            self.record_failure(e)
            return []

    def _normalize_payload(self, payload: dict[str, Any]) -> list[NewsArticle]:
        results: list[NewsArticle] = []
        raw_articles = payload.get("data", [])
        now = datetime.now(UTC)

        for raw in raw_articles:
            try:
                pub_str = raw.get("published_at")
                published_at = (
                    datetime.fromisoformat(pub_str.replace("Z", "+00:00")) if pub_str else now
                )
                # Invariant: available_at is when Aegis observed/received it
                available_at = now
                url = raw.get("url", "")
                parsed_url = urlparse(url)
                domain = parsed_url.netloc.lower()

                entities = raw.get("entities", [])
                tickers = [e.get("symbol") for e in entities if e.get("symbol")]
                companies = [e.get("name") for e in entities if e.get("name")]

                # Raw sentiment
                sentiment_score = None
                sentiment_label = None
                if entities:
                    scores = [
                        e.get("sentiment_score")
                        for e in entities
                        if e.get("sentiment_score") is not None
                    ]
                    if scores:
                        sentiment_score = sum(scores) / len(scores)
                        sentiment_label = (
                            "positive"
                            if sentiment_score > 0.1
                            else "negative"
                            if sentiment_score < -0.1
                            else "neutral"
                        )

                art_id = str(raw.get("uuid", uuid.uuid4()))
                canonical_id = f"marketaux_{art_id}"

                provenance = ProvenanceBlock(
                    provider=self.provider_id,
                    source_name=raw.get("source", domain or "Marketaux"),
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
                    source_name=raw.get("source", domain or "Marketaux"),
                    source_domain=domain,
                    canonical_url=url,
                    title=raw.get("title", ""),
                    description=raw.get("description"),
                    language=raw.get("language", "en"),
                    published_at=published_at,
                    available_at=available_at,
                    retrieved_at=now,
                    tickers=tickers,
                    companies=companies,
                    provider_sentiment=sentiment_label,
                    provider_sentiment_score=sentiment_score,
                    aegis_sentiment=sentiment_score,
                    raw_metadata={"keywords": raw.get("keywords", [])},
                    provenance=provenance,
                )
                results.append(article)
            except Exception as e:
                logger.warning("Failed to normalize Marketaux item: %s", e)

        return results

    async def get_latest_news(self, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"limit": min(limit, 50), "language": "en"})

    async def search_news(self, query: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"search": query, "limit": min(limit, 50), "language": "en"})

    async def get_company_news(self, symbol: str, limit: int = 50) -> list[NewsArticle]:
        clean_sym = symbol.upper().replace("-USD", "")
        return await self._fetch({"symbols": clean_sym, "limit": min(limit, 50), "language": "en"})

    async def get_topic_news(self, topic: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch({"search": topic, "limit": min(limit, 50), "language": "en"})
