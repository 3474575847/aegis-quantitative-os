from aegis_storage.database import DatabaseManager
from aegis_storage.models.events import EventLog

from aegis_events.models import BaseEvent


class EventPersistenceHandler:
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager

    async def handle(self, event: BaseEvent) -> None:
        async for session in self.db_manager.get_session():
            db_event = EventLog(
                event_id=event.event_id,
                event_type=event.event_type,
                timestamp=event.timestamp,
                source=event.source,
                correlation_id=event.correlation_id,
                payload=event.payload,
                metadata_json=event.metadata,
            )
            session.add(db_event)
