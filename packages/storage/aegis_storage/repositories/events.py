from collections.abc import Sequence

from aegis_storage.models.events import NormalizedEvent, RawEvent
from aegis_storage.repositories.base import BaseRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class RawEventRepository(BaseRepository[RawEvent]):
    def __init__(self, session: AsyncSession):
        super().__init__(RawEvent, session)


class NormalizedEventRepository(BaseRepository[NormalizedEvent]):
    def __init__(self, session: AsyncSession):
        super().__init__(NormalizedEvent, session)

    async def get_by_type(self, event_type: str, limit: int = 100) -> Sequence[NormalizedEvent]:
        query = select(NormalizedEvent).where(NormalizedEvent.event_type == event_type).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()
