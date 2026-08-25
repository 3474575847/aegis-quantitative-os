from datetime import datetime, timedelta
from uuid import UUID, uuid4

from aegis_storage.database import DatabaseManager
from aegis_storage.models.events import EventLog, NormalizedEvent, RawEvent

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

            if event.event_type != "SensorRunCompleted":
                continue

            source_events = event.payload.get("events", [])
            for index, source_event in enumerate(source_events):
                source_event_id = source_event.get("event_id") or str(event.event_id)
                try:
                    source_id = UUID(source_event_id)
                except (TypeError, ValueError):
                    source_id = uuid4()

                occurred_at_value = source_event.get("occurred_at")
                occurred_at = (
                    datetime.fromisoformat(occurred_at_value)
                    if occurred_at_value
                    else event.timestamp
                )
                received_at = event.timestamp + timedelta(microseconds=index)
                raw_payload = source_event.get("data", {})

                session.add(
                    RawEvent(
                        id=source_id,
                        sensor_id=event.source,
                        received_at=received_at,
                        payload=raw_payload,
                        source_version="1",
                    )
                )
                session.add(
                    NormalizedEvent(
                        id=source_id,
                        raw_event_id=source_id,
                        event_type=source_event.get("event_type", "EVENT"),
                        occurred_at=occurred_at,
                        processed_at=event.timestamp,
                        data=raw_payload,
                        metadata_json={
                            "sensor_id": event.source,
                            "correlation_id": str(event.correlation_id),
                        },
                    )
                )
