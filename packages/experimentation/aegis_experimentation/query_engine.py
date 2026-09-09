import logging
import time
from typing import Any

from aegis_storage.models.experimentation import ExperimentDefinitionRecord
from aegis_storage.repositories.experimentation import ExperimentRepository

from aegis_experimentation.models import (
    ExperimentDefinition,
    ExperimentQuery,
    QueryResult,
    RankingStrategy,
)
from aegis_experimentation.ranking import Ranker, get_ranking_logic

logger = logging.getLogger(__name__)


class QueryEngine:
    """Deterministic query engine for experiment discovery."""

    def __init__(self, repository: ExperimentRepository):
        self.repository = repository

    async def execute(self, query: ExperimentQuery) -> QueryResult:
        """Execute experiment query with filtering, ranking, and pagination."""
        start_time = time.perf_counter()

        # Determine if we are on SQLite
        is_sqlite = self.repository.session.bind.dialect.name == "sqlite"

        filters = self._build_filters(query, is_sqlite)
        order_by = get_ranking_logic(query.ranking)

        records, total_count = await self.repository.query_definitions(
            filters=filters,
            order_by=order_by,
            limit=query.pagination.limit,
            offset=query.pagination.offset,
        )

        items = [
            ExperimentDefinition(
                experiment_id=r.experiment_id,
                name=r.name,
                description=r.description,
                workflow_ids=r.workflow_ids,
                parameters=r.parameters,
                metadata=r.metadata_json,
                tags=r.tags,
                created_at=r.created_at,
            )
            for r in records
        ]

        # In-memory filtering for SQLite fallback in tests
        if is_sqlite and query.filter.tags:
            items = [item for item in items if all(tag in item.tags for tag in query.filter.tags)]
            total_count = len(items)

        if query.ranking in [
            RankingStrategy.MOST_RUNS,
            RankingStrategy.HIGHEST_SUCCESS_RATE,
        ]:
            metrics = await self.repository.get_aggregate_metrics()
            items = Ranker.sort_in_memory(items, query.ranking, metrics)

        latency = time.perf_counter() - start_time

        logger.info(
            "experiment_query_executed",
            extra={
                "latency_ms": latency * 1000,
                "result_count": len(items),
                "total_count": total_count,
                "ranking": query.ranking,
            },
        )

        return QueryResult(
            items=items,
            total_count=total_count,
            limit=query.pagination.limit,
            offset=query.pagination.offset,
        )

    def _build_filters(self, query: ExperimentQuery, is_sqlite: bool) -> list[Any]:
        filters = []
        f = query.filter

        if f.tags:
            for tag in f.tags:
                if not is_sqlite:
                    filters.append(ExperimentDefinitionRecord.tags.contains([tag]))

        if f.created_after:
            filters.append(ExperimentDefinitionRecord.created_at >= f.created_after)

        if f.created_before:
            filters.append(ExperimentDefinitionRecord.created_at <= f.created_before)

        return filters
