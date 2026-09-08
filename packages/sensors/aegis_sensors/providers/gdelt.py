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


class GDELTNewsProvider(NewsDataProvider):
    """
    Original GDELT Project 2.0 Doc API provider adapter.
    Uses public open APIs without requiring an API key.
    Provides global media coverage, geopolitical events, and media volume analysis.
    """

    def __init__(
        self,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
        enabled: bool = True,
    ) -> None:
        super().__init__(provider_id="gdelt", enabled=enabled)
        base = base_url or os.getenv("GDELT_BASE_URL") or "https://api.gdeltproject.org/api/v2"
        self.base_url = base.rstrip("/")
        self._client = client

    async def _fetch(self, query: str, limit: int = 50) -> list[NewsArticle]:
        if not self.enabled:
            return []

        doc_url = f"{self.base_url}/doc/doc"
        params: dict[str, str | int] = {
            "query": query,
            "mode": "artlist",
            "format": "json",
            "maxrecords": min(limit, 100),
            "sort": "datedesc",
        }
        headers = {"User-Agent": "AegisAlpha/0.1"}

        try:
            if self._client:
                response = await self._client.get(
                    doc_url, params=params, headers=headers, timeout=12.0
                )
            else:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    response = await client.get(doc_url, params=params, headers=headers)

            if response.status_code != 200:
                self.record_failure(Exception(f"HTTP {response.status_code}: {response.text}"))
                return []

            # GDELT returns empty string or non-json on zero results
            try:
                data = response.json()
            except Exception:
                return []

            if not isinstance(data, dict):
                return []

            articles = self._normalize_payload(data)
            self.record_success()
            return articles
        except Exception as e:
            self.record_failure(e)
            return []

    def _normalize_payload(self, payload: dict[str, Any]) -> list[NewsArticle]:
        results: list[NewsArticle] = []
        raw_articles: list[Any] = payload.get("articles", [])
        now = datetime.now(UTC)

        for raw in raw_articles:
            if not isinstance(raw, dict):
                continue
            try:
                seendate = raw.get("seendate")
                published_at = now
                if seendate and len(seendate) >= 15:
                    try:
                        published_at = (
                            datetime.strptime(seendate[:15], "%Y%m%dT%H%M%S")
                            .replace(tzinfo=UTC)
                        )
                    except Exception:
                        published_at = now

                available_at = now
                url = raw.get("url", "")
                parsed_url = urlparse(url)
                domain = raw.get("domain") or parsed_url.netloc.lower()

                art_id = str(url or uuid.uuid4())
                gid = uuid.uuid5(uuid.NAMESPACE_URL, url) if url else uuid.uuid4()
                canonical_id = f"gdelt_{gid}"

                provenance = ProvenanceBlock(
                    provider=self.provider_id,
                    source_name=domain or "GDELT Project",
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
                    source_name=domain or "GDELT Project",
                    source_domain=domain,
                    canonical_url=url,
                    title=raw.get("title", ""),
                    image_url=raw.get("socialimage"),
                    language=raw.get("language", "English"),
                    published_at=published_at,
                    available_at=available_at,
                    retrieved_at=now,
                    raw_metadata={
                        "sourcecountry": raw.get("sourcecountry"),
                    },
                    provenance=provenance,
                )
                results.append(article)
            except Exception as e:
                logger.warning("Failed to normalize GDELT item: %s", e)

        return results

    async def get_latest_news(self, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch("market OR economy OR inflation", limit)

    async def search_news(self, query: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch(query, limit)

    async def get_company_news(self, symbol: str, limit: int = 50) -> list[NewsArticle]:
        clean_sym = symbol.upper().replace("-USD", "")
        return await self._fetch(f'"{clean_sym}"', limit)

    async def get_topic_news(self, topic: str, limit: int = 50) -> list[NewsArticle]:
        return await self._fetch(topic, limit)
