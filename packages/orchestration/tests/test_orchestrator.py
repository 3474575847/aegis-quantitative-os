from uuid import uuid4

import pytest
from aegis_orchestration.engine import WorkflowOrchestrator
from aegis_orchestration.models import ResearchWorkflowDefinition


@pytest.mark.asyncio
async def test_workflow_execution_flow() -> None:
    orchestrator = WorkflowOrchestrator()

    definition = ResearchWorkflowDefinition(
        name="test_workflow", signal_ids=[uuid4()], backtest_id=uuid4()
    )

    success = await orchestrator.execute_workflow(definition=definition, correlation_id=uuid4())

    assert success is True
