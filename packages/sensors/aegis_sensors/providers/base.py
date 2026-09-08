from abc import ABC, abstractmethod
from typing import Any

from aegis_observability.logger import get_logger

from aegis_sensors.providers.models import NewsArticle

logger = get_logger(__name__)


class NewsDataProvider(ABC):
    """
    Abstract interface for all news data providers in the Aegis-Alpha ecosystem.
    Guarantees provider independence and uniform normalization into domain models.
    """

    def __init__(self, provider_id: str, enabled: bool = True) -> None:
        self.provider_id = provider_id
        self.enabled = enabled
        self._last_successful_fetch: str | None = None
        self._last_failure: str | None = None
        self._consecutive_failures: int = 0

    @abstractmethod
    async def get_latest_news(self, limit: int = 50) -> list[NewsArticle]:
        """Fetch general real-time financial and macroeconomic headlines."""

    @abstractmethod
    async def search_news(self, query: str, limit: int = 50) -> list[NewsArticle]:
        """Search news records matching a specific text query or keyword."""

    @abstractmethod
    async def get_company_news(self, symbol: str, limit: int = 50) -> list[NewsArticle]:
        """Fetch targeted news records for an equity ticker or asset symbol."""

    @abstractmethod
    async def get_topic_news(self, topic: str, limit: int = 50) -> list[NewsArticle]:
        """Fetch news for a designated macro topic or sector category."""

    def record_success(self) -> None:
        from datetime import UTC, datetime
        self._last_successful_fetch = datetime.now(UTC).isoformat()
        self._consecutive_failures = 0

    def record_failure(self, error: Exception) -> None:
        from datetime import UTC, datetime
        self._last_failure = f"{datetime.now(UTC).isoformat()}: {error}"
        self._consecutive_failures += 1
        logger.warning(
            "Provider %s failure #%d: %s",
            self.provider_id,
            self._consecutive_failures,
            str(error),
        )

    def get_health_status(self) -> dict[str, Any]:
        """Return real-time operational status for the Data Observatory."""
        status = "HEALTHY"
        if not self.enabled:
            status = "DISABLED"
        elif self._consecutive_failures >= 3:
            status = "DEGRADED"

        return {
            "provider_id": self.provider_id,
            "status": status,
            "enabled": self.enabled,
            "consecutive_failures": self._consecutive_failures,
            "last_successful_fetch": self._last_successful_fetch,
            "last_failure": self._last_failure,
        }
