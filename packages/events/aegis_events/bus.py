import asyncio
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import Callable
from typing import Any, TypeVar

from aegis_observability.logger import get_logger

from aegis_events.models import BaseEvent

logger = get_logger(__name__)

E = TypeVar("E", bound=BaseEvent)
EventHandler = Callable[[E], asyncio.Future[Any] | Any]


class EventPublisher(ABC):
    @abstractmethod
    async def publish(self, event: BaseEvent) -> None:
        pass

    @abstractmethod
    def subscribe(self, event_type: str, handler: EventHandler[Any]) -> None:
        pass


class InMemoryEventBus(EventPublisher):
    def __init__(self) -> None:
        self._subscribers: dict[str, list[EventHandler[Any]]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: EventHandler[Any]) -> None:
        self._subscribers[event_type].append(handler)
        logger.info(f"Subscribed handler to {event_type}")

    async def publish(self, event: BaseEvent) -> None:
        event_type = event.event_type
        handlers = self._subscribers.get(event_type, [])

        if not handlers:
            return

        tasks = []
        for handler in handlers:
            tasks.append(self._execute_handler(handler, event))

        await asyncio.gather(*tasks)

    async def _execute_handler(self, handler: EventHandler[Any], event: BaseEvent) -> None:
        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(event)
            else:
                handler(event)
        except Exception as e:
            logger.error(
                f"Error in event handler for {event.event_type}: {e!s}",
                event_id=str(event.event_id),
                error=str(e),
            )
