import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx
from aegis_observability.logger import get_logger

from aegis_sensors.providers.base import NewsDataProvider
from aegis_sensors.providers.models import NewsArticle, ProvenanceBlock

logger = get_logger(__name__)


class FinnhubNewsProvider(NewsDataProvider):
    """
    Finnhub company and market news provider adapter.
    Preserves company entity relations, categories, and direct publication sources.
    """

    def __init__(
        self,
        api_key: str | None = None,
        client: httpx.AsyncClient | None = None,
        enabled: bool = True,
    ) -> None:
        super().__init__(provider_id="finnhub", enabled=enabled)
        self.api_key = api_key or os.getenv("FINNHUB_API_KEY", "")
        self._client = client
        if not self.api_key:
            logger.info("FinnhubNewsProvider initialized without API key (will degrade gracefully)")

    async def _fetch(self, path: str, params: dict[str, Any]) -> list[NewsArticle]:
        if not self.enabled or not self.api_key:
            return []

        base_url = f"https://finnhub.io/api/v1/{path}"
        req_params = {**params, "token": self.api_key}

        try:
            if self._client:
                response = await self._client.get(base_url, params=req_params, timeout=10.0)
            else:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(base_url, params=req_params)

            if response.status_code != 200:
                self.record_failure(Exception(f"HTTP {response.status_code}: {response.text}"))
                return []

            data = response.json()
            if not isinstance(data, list):
                return []

            articles = self._normalize_payload(data)
            self.record_success()
            return articles
        except Exception as e:
            self.record_failure(e)
            return []

    def _normalize_payload(self, items: list[dict[str, Any]]) -> list[NewsArticle]:
        results: list[NewsArticle] = []
        now = datetime.now(UTC)

        for raw in items:
            try:
                ts = raw.get("datetime")
                published_at = datetime.fromtimestamp(ts, tz=UTC) if ts else now
                available_at = now
                url = raw.get("url", "")
                parsed_url = urlparse(url)
                domain = parsed_url.netloc.lower()

                art_id = str(raw.get("id", uuid.uuid4()))
                canonical_id = f"finnhub_{art_id}"

                related = raw.get("related", "")
                tickers = [t.strip() for t in related.split(",") if t.strip()] if related else []
                category = raw.get("category")
                categories = [category] if category else []

                provenance = ProvenanceBlock(
                    provider=self.provider_id,
                    source_name=raw.get("source", domain or "Finnhub"),
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
                    source_name=raw.get("source", domain or "Finnhub"),
                    source_domain=domain,
                    canonical_url=url,
                    title=raw.get("headline", ""),
                    description=raw.get("summary"),
                    image_url=raw.get("image"),
                    published_at=published_at,
                    available_at=available_at,
                    retrieved_at=now,
                    tickers=tickers,
                    categories=categories,
                    provenance=provenance,
                )
                results.append(article)
            except Exception as e:
                logger.warning("Failed to normalize Finnhub item: %s", e)

        return results

    async def get_latest_news(self, limit: int = 50) -> list[NewsArticle]:
        items = await self._fetch("news", {"category": "general"})
        return items[:limit]

    async def search_news(self, query: str, limit: int = 50) -> list[NewsArticle]:
        items = await self._fetch("news", {"category": query})
        return items[:limit]

    async def get_company_news(self, symbol: str, limit: int = 50) -> list[NewsArticle]:
        clean_sym = symbol.upper().replace("-USD", "")
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        from_date = (datetime.now(UTC) - timedelta(days=7)).strftime("%Y-%m-%d")
        items = await self._fetch(
            "company-news",
            {"symbol": clean_sym, "from": from_date, "to": today},
        )
        return items[:limit]

    async def get_topic_news(self, topic: str, limit: int = 50) -> list[NewsArticle]:
        items = await self._fetch("news", {"category": topic})
        return items[:limit]
