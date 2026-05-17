from typing import Any

from aegis_orchestration.models import ResearchWorkflowDefinition


class LineageTracker:
    """Utilities for resolving and tracking research lineage."""

    @staticmethod
    def get_lineage_graph(definition: ResearchWorkflowDefinition) -> dict[str, Any]:
        """Generate a basic dependency graph for the research workflow."""
        return {
            "workflow_id": str(definition.workflow_id),
            "signals": [str(sid) for sid in definition.signal_ids],
            "backtest": str(definition.backtest_id),
            "parameters": definition.parameters,
        }

    @staticmethod
    def verify_reproducibility(
        original: ResearchWorkflowDefinition, replayed: ResearchWorkflowDefinition
    ) -> bool:
        """Ensure two workflow definitions are functionally identical."""
        return (
            original.signal_ids == replayed.signal_ids
            and original.backtest_id == replayed.backtest_id
            and original.parameters == replayed.parameters
        )
