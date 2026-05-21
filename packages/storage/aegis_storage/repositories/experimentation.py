import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis_storage.models.experimentation import ExperimentRunRecord
from aegis_storage.repositories.base import BaseRepository


class ExperimentRepository(BaseRepository[ExperimentRunRecord]):
    def __init__(self, session: AsyncSession):
        super().__init__(ExperimentRunRecord, session)

    async def get_runs_by_experiment(
        self, experiment_id: uuid.UUID
    ) -> Sequence[ExperimentRunRecord]:
        query = select(ExperimentRunRecord).where(
            ExperimentRunRecord.experiment_id == experiment_id
        )
        result = await self.session.execute(query)
        return result.scalars().all()
