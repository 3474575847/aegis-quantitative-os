import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from aegis_events.models import Event

from aegis_sensors.base import BaseSensor


class RedditFinanceSensor(BaseSensor[Any]):
    def __init__(self, config: Any, client: httpx.AsyncClient | None = None) -> None:
        super().__init__(config)
        self._client = client

    async def fetch(self) -> Any:
        if self.config.mock_mode and self.config.mock_path:
            with Path(self.config.mock_path).open() as f:
                return json.load(f)

        url = "https://www.reddit.com/r/wallstreetbets/new.json?limit=10"

        # Use provided client or create a temporary one (though persistent is preferred)
        if self._client:
            response = await self._client.get(url, headers={"User-Agent": "Aegis-Alpha/0.1.0"})
            response.raise_for_status()
            return response.json()

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers={"User-Agent": "Aegis-Alpha/0.1.0"})
            response.raise_for_status()
            return response.json()

    async def normalize(self, data: Any) -> list[Event]:
        events = []
        posts = data.get("data", {}).get("children", [])
        for post in posts:
            post_data = post.get("data", {})

            # Defensive key checking
            created_utc = post_data.get("created_utc")
            if created_utc is None:
                continue

            events.append(
                Event(
                    event_type="REDDIT_POST",
                    occurred_at=datetime.fromtimestamp(created_utc, tz=UTC),
                    data={
                        "title": post_data.get("title", "No Title"),
                        "subreddit": post_data.get("subreddit", "unknown"),
                        "author": post_data.get("author", "anonymous"),
                        "score": post_data.get("score", 0),
                        "url": post_data.get("url", ""),
                    },
                    metadata={"sensor_id": self.config.sensor_id},
                )
            )
        return events

    async def validate(self, events: list[Event]) -> list[Event]:
        return [e for e in events if e.data.get("title") != "No Title"]

    async def emit(self, events: list[Event]) -> None:
        for _event in events:
            # Placeholder for actual emission logic (e.g. to event bus or DB)
            pass
