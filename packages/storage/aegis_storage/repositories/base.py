from collections.abc import Sequence
from typing import Any, TypeVar

from aegis_storage.models.base import Base
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T", bound=Base)


class BaseRepository[T: Base]:
    def __init__(self, model: type[T], session: AsyncSession):
        self.model = model
        self.session = session

    async def add(self, entity: T) -> T:
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def get_by_id(self, entity_id: Any) -> T | None:
        return await self.session.get(self.model, entity_id)

    async def list_all(self, limit: int = 100) -> Sequence[T]:
        query = select(self.model).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()
