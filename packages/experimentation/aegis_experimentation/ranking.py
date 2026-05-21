import uuid
from typing import Any

from aegis_storage.models.experimentation import ExperimentDefinitionRecord
from sqlalchemy import asc, desc

from aegis_experimentation.models import ExperimentDefinition, RankingStrategy


def get_ranking_logic(strategy: RankingStrategy) -> list[Any]:
    """Return list of SQLAlchemy sort expressions for a given strategy.

    All strategies include a tie-break on experiment_id for deterministic results.
    """
    tie_break = [asc(ExperimentDefinitionRecord.experiment_id)]

    if strategy == RankingStrategy.OLDEST:
        return [asc(ExperimentDefinitionRecord.created_at), *tie_break]

    # Run-based and performance-based ranking require joins or aggregates
    # For Phase 2 foundation, we return created_at as fallback for complex rankings
    # until the QueryEngine integrates aggregate metrics.
    return [desc(ExperimentDefinitionRecord.created_at), *tie_break]


class Ranker:
    """Handles deterministic ranking of experiments."""

    @staticmethod
    def sort_in_memory(
        experiments: list[ExperimentDefinition],
        strategy: RankingStrategy,
        metrics: dict[uuid.UUID, dict[str, Any]] | None = None,
    ) -> list[ExperimentDefinition]:
        """Apply ranking strategy to a list of experiments in memory."""
        metrics = metrics or {}

        def sort_key(exp: ExperimentDefinition) -> Any:
            m = metrics.get(exp.experiment_id, {"run_count": 0, "success_rate": 0.0})

            if strategy == RankingStrategy.NEWEST:
                return (-exp.created_at.timestamp(), exp.experiment_id)
            if strategy == RankingStrategy.OLDEST:
                return (exp.created_at.timestamp(), exp.experiment_id)
            if strategy == RankingStrategy.MOST_RUNS:
                return (-m["run_count"], exp.experiment_id)
            if strategy == RankingStrategy.HIGHEST_SUCCESS_RATE:
                return (-m["success_rate"], exp.experiment_id)

            return (-exp.created_at.timestamp(), exp.experiment_id)

        return sorted(experiments, key=sort_key)
