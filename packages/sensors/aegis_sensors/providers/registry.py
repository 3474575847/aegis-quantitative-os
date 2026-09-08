import asyncio
import os
from typing import Any

from aegis_observability.logger import get_logger

from aegis_sensors.providers.alphavantage import AlphaVantageNewsProvider
from aegis_sensors.providers.base import NewsDataProvider
from aegis_sensors.providers.finnhub import FinnhubNewsProvider
from aegis_sensors.providers.gdelt import GDELTNewsProvider
from aegis_sensors.providers.marketaux import MarketauxNewsProvider
from aegis_sensors.providers.models import NewsArticle

logger = get_logger(__name__)


class ProviderRegistry:
    """
    Central coordinator for registering, routing, and monitoring data providers.
    Ensures provider independence, graceful degradation, and health telemetry.
    """

    def __init__(self) -> None:
        self._providers: dict[str, NewsDataProvider] = {}
        self._initialize_default_providers()

    def _initialize_default_providers(self) -> None:
        configured = os.getenv(
            "NEWS_PROVIDERS",
            "marketaux,alpha_vantage,finnhub,gdelt",
        ).lower().split(",")
        configured = [p.strip() for p in configured if p.strip()]

        # Register Stage 1 providers
        self.register(MarketauxNewsProvider(enabled="marketaux" in configured))
        self.register(AlphaVantageNewsProvider(enabled="alpha_vantage" in configured))
        self.register(FinnhubNewsProvider(enabled="finnhub" in configured))
        self.register(GDELTNewsProvider(enabled="gdelt" in configured))

    def register(self, provider: NewsDataProvider) -> None:
        self._providers[provider.provider_id] = provider
        logger.info("Registered provider %s (enabled=%s)", provider.provider_id, provider.enabled)

    def get_provider(self, provider_id: str) -> NewsDataProvider | None:
        return self._providers.get(provider_id)

    def list_providers(self) -> list[str]:
        return list(self._providers.keys())

    def get_health_summary(self) -> list[dict[str, Any]]:
        return [p.get_health_status() for p in self._providers.values()]

    async def fetch_all_latest(self, limit_per_provider: int = 25) -> list[NewsArticle]:
        """Concurrently fetch latest news across all active providers."""
        enabled_providers = [p for p in self._providers.values() if p.enabled]
        if not enabled_providers:
            return []

        tasks = [p.get_latest_news(limit=limit_per_provider) for p in enabled_providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        articles: list[NewsArticle] = []
        for provider, res in zip(enabled_providers, results, strict=False):
            if isinstance(res, Exception):
                logger.warning(
                    "Provider %s failed during fetch_all_latest: %s",
                    provider.provider_id,
                    res,
                )
            elif isinstance(res, list):
                articles.extend(res)

        return articles

    async def fetch_company_news(
        self, symbol: str, limit_per_provider: int = 25
    ) -> list[NewsArticle]:
        """Concurrently fetch company news across all active providers."""
        enabled_providers = [p for p in self._providers.values() if p.enabled]
        if not enabled_providers:
            return []

        tasks = [p.get_company_news(symbol, limit=limit_per_provider) for p in enabled_providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        articles: list[NewsArticle] = []
        for provider, res in zip(enabled_providers, results, strict=False):
            if isinstance(res, Exception):
                logger.warning(
                    "Provider %s failed during fetch_company_news: %s",
                    provider.provider_id,
                    res,
                )
            elif isinstance(res, list):
                articles.extend(res)

        return articles
