import asyncio
import logging
import time
from uuid import UUID

from aegis_events.bus import EventPublisher
from aegis_events.models import (
    ResearchWorkflowCompleted,
    ResearchWorkflowStarted,
    WorkflowFailed,
    WorkflowStageCompleted,
    WorkflowStageStarted,
)

from aegis_orchestration.metrics import (
    STAGE_LATENCY,
    WORKFLOW_DURATION,
    WORKFLOW_ERRORS,
)
from aegis_orchestration.models import (
    ResearchRun,
    ResearchWorkflowDefinition,
    WorkflowStatus,
)
from aegis_orchestration.state import WorkflowStateMachine

logger = logging.getLogger(__name__)


class WorkflowOrchestrator:
    """Foundational orchestrator for reproducible research workflows."""

    def __init__(self, publisher: EventPublisher | None = None):
        self.publisher = publisher

    async def execute_workflow(
        self, definition: ResearchWorkflowDefinition, correlation_id: UUID
    ) -> bool:
        """Run a research workflow through its lifecycle stages."""
        start_time = time.perf_counter()
        run = ResearchRun(
            workflow_id=definition.workflow_id,
            correlation_id=correlation_id,
            status=WorkflowStatus.PENDING,
        )

        if self.publisher:
            await self.publisher.publish(
                ResearchWorkflowStarted(
                    source="orchestrator",
                    correlation_id=correlation_id,
                )
            )

        try:
            # Stage: Running
            await self._run_stage(definition, run, WorkflowStatus.RUNNING)

            # Stage: Signal Generation
            await self._run_stage(definition, run, WorkflowStatus.SIGNAL_GENERATION)
            # Integration logic with SignalEngine would go here in future PRs

            # Stage: Backtesting
            await self._run_stage(definition, run, WorkflowStatus.BACKTESTING)
            # Integration logic with BacktestEngine would go here in future PRs

            # Stage: Persisting Artifacts
            await self._run_stage(definition, run, WorkflowStatus.PERSISTING_ARTIFACTS)

            # Finalize
            run.status = WorkflowStatus.COMPLETED

            WORKFLOW_DURATION.labels(workflow_name=definition.name).observe(
                time.perf_counter() - start_time
            )

            if self.publisher:
                await self.publisher.publish(
                    ResearchWorkflowCompleted(
                        source="orchestrator",
                        correlation_id=correlation_id,
                    )
                )

            return True

        except Exception as e:
            run.status = WorkflowStatus.FAILED
            WORKFLOW_ERRORS.labels(workflow_name=definition.name, stage_name=run.status.value).inc()

            logger.error(f"Workflow failed: {definition.name} - {e!s}")

            if self.publisher:
                await self.publisher.publish(
                    WorkflowFailed(
                        source="orchestrator", correlation_id=correlation_id, error=str(e)
                    )
                )
            return False

    async def _run_stage(
        self, definition: ResearchWorkflowDefinition, run: ResearchRun, next_status: WorkflowStatus
    ) -> None:
        """Execute a state transition and record stage metrics."""
        if not WorkflowStateMachine.validate_transition(run.status, next_status):
            raise ValueError(f"Invalid transition from {run.status} to {next_status}")

        stage_start = time.perf_counter()

        if self.publisher:
            await self.publisher.publish(
                WorkflowStageStarted(
                    source="orchestrator",
                    correlation_id=run.correlation_id,
                )
            )

        # Update run state
        run.status = next_status
        logger.info(f"Workflow {definition.name} entered stage: {next_status.value}")

        # Simulate stage work for foundation
        await asyncio.sleep(0.01)

        STAGE_LATENCY.labels(workflow_name=definition.name, stage_name=next_status.value).observe(
            time.perf_counter() - stage_start
        )

        if self.publisher:
            await self.publisher.publish(
                WorkflowStageCompleted(
                    source="orchestrator",
                    correlation_id=run.correlation_id,
                )
            )
