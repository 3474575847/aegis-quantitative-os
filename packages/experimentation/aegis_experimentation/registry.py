import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from aegis_experimentation.models import (
    ExperimentDefinition,
    ExperimentRun,
    ExperimentStatus,
)
from aegis_storage.models.experimentation import ExperimentRunRecord
from aegis_storage.repositories.experimentation import ExperimentRepository


class ExperimentRegistry:
    """Registry for managing and versioning research experiments."""

    def __init__(self, session: AsyncSession):
        self.repository = ExperimentRepository(session)

    async def register_experiment(
        self, definition: ExperimentDefinition
    ) -> ExperimentDefinition:
        """Register a new experiment definition."""
        return definition

    async def create_run(
        self, experiment_id: uuid.UUID, workflow_run_ids: list[uuid.UUID]
    ) -> ExperimentRun:
        """Create a new record for an experiment run."""
        run = ExperimentRun(
            experiment_id=experiment_id,
            workflow_run_ids=workflow_run_ids,
            status=ExperimentStatus.RUNNING,
            started_at=datetime.now(UTC),
        )

        record = ExperimentRunRecord(
            run_id=run.run_id,
            experiment_id=run.experiment_id,
            status=run.status,
            started_at=run.started_at,
            workflow_run_ids=run.workflow_run_ids,
            metadata_json=run.metadata,
        )
        await self.repository.add(record)
        return run

    async def complete_run(self, run_id: uuid.UUID, metadata: dict | None = None) -> None:
        """Mark an experiment run as completed."""
        record = await self.repository.get_by_id(run_id)
        if record:
            record.status = ExperimentStatus.COMPLETED
            record.completed_at = datetime.now(UTC)
            if metadata:
                record.metadata_json.update(metadata)
            await self.repository.session.flush()

    async def get_experiment_history(self, experiment_id: uuid.UUID) -> list[ExperimentRun]:
        """Retrieve historical runs for a specific experiment."""
        records = await self.repository.get_runs_by_experiment(experiment_id)
        return [
            ExperimentRun(
                run_id=r.run_id,
                experiment_id=r.experiment_id,
                status=ExperimentStatus(r.status),
                started_at=r.started_at,
                completed_at=r.completed_at,
                workflow_run_ids=r.workflow_run_ids,
                metadata=r.metadata_json,
            )
            for r in records
        ]
