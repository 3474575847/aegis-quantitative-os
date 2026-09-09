import uuid
from collections.abc import Sequence
from typing import Any

from aegis_storage.models.experimentation import (
    ExperimentDefinitionRecord,
    ExperimentRunRecord,
)
from aegis_storage.repositories.base import BaseRepository
from sqlalchemy import case, func, select


class ExperimentRepository(BaseRepository[Any]):
    def __init__(self, session: Any) -> None:
        super().__init__(ExperimentRunRecord, session)

    async def get_runs_by_experiment(
        self, experiment_id: uuid.UUID
    ) -> Sequence[ExperimentRunRecord]:
        query = select(ExperimentRunRecord).where(
            ExperimentRunRecord.experiment_id == experiment_id
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def add_definition(self, record: ExperimentDefinitionRecord) -> None:
        self.session.add(record)
        await self.session.flush()

    async def get_definition(self, experiment_id: uuid.UUID) -> ExperimentDefinitionRecord | None:
        query = select(ExperimentDefinitionRecord).where(
            ExperimentDefinitionRecord.experiment_id == experiment_id
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def query_definitions(
        self, filters: list[Any], order_by: list[Any], limit: int, offset: int
    ) -> tuple[Sequence[ExperimentDefinitionRecord], int]:
        # Base query for results
        query = (
            select(ExperimentDefinitionRecord)
            .where(*filters)
            .order_by(*order_by)
            .limit(limit)
            .offset(offset)
            .distinct()
        )
        result = await self.session.execute(query)
        items = result.scalars().all()

        # Count query
        count_query = select(func.count()).select_from(
            select(ExperimentDefinitionRecord.experiment_id).where(*filters).alias("subquery")
        )
        count_result = await self.session.execute(count_query)
        total_count = count_result.scalar_one()

        return items, total_count

    async def get_aggregate_metrics(self) -> dict[uuid.UUID, dict[str, Any]]:
        """Retrieve aggregate metrics (run count, success rate) per experiment."""
        query = select(
            ExperimentRunRecord.experiment_id,
            func.count(ExperimentRunRecord.run_id).label("run_count"),
            func.avg(case((ExperimentRunRecord.status == "COMPLETED", 1.0), else_=0.0)).label(
                "success_rate"
            ),
        ).group_by(ExperimentRunRecord.experiment_id)

        result = await self.session.execute(query)
        metrics = {}
        for row in result:
            metrics[row.experiment_id] = {
                "run_count": row.run_count,
                "success_rate": float(row.success_rate) if row.success_rate else 0.0,
            }
        return metrics
