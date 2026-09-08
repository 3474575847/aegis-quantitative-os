"""
Aegis-Alpha Macro Ingestion Pipeline (P1.1)
==========================================
Polls the FRED API for 6 macro series, converts observations to ORM records,
and upserts them into the ``macro_observations`` hypertable.

Point-in-time invariant
-----------------------
``available_at`` is set to the retrieval timestamp inside ``FREDProvider``.
This is always >= the FRED realtime_start, so no look-ahead bias is introduced.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from aegis_observability.logger import get_logger
from aegis_sensors.providers.fred import FREDProvider, MacroObservation
from aegis_storage.database import DatabaseManager
from aegis_storage.models.macro import MacroObservationRecord
from aegis_storage.repositories.macro import MacroRepository

logger = get_logger(__name__)


class MacroPipeline:
    """
    Scheduled macro ingestion pipeline.

    Call ``run_cycle()`` on a timer (e.g. every 60 minutes; FRED data is
    released at most once per business day, so a 60-minute poll is sufficient).
    """

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager
        self.provider = FREDProvider()

    async def run_cycle(self) -> dict[str, int]:
        """
        Fetch latest observations for all 6 FRED series and persist new rows.

        Returns a summary dict: {"fetched": N, "new_rows": M}.
        """
        logger.info("MacroPipeline: starting FRED ingest cycle")
        start = datetime.now(UTC)

        observations = await self.provider.fetch_latest(limit_per_series=24)
        if not observations:
            logger.warning("MacroPipeline: no observations returned from FRED")
            return {"fetched": 0, "new_rows": 0}

        logger.info("MacroPipeline: fetched %d observations", len(observations))
        records = [_to_record(obs) for obs in observations]

        new_rows = 0
        async for session in self.db_manager.get_session():
            repo = MacroRepository(session)
            new_rows = await repo.upsert_observations(records)

        elapsed = (datetime.now(UTC) - start).total_seconds()
        logger.info(
            "MacroPipeline: cycle complete — %d new rows in %.1fs", new_rows, elapsed
        )
        return {"fetched": len(observations), "new_rows": new_rows}


def _to_record(obs: MacroObservation) -> MacroObservationRecord:
    """Convert a MacroObservation dataclass into a SQLAlchemy ORM record."""
    return MacroObservationRecord(
        id=uuid.uuid4(),
        series_id=obs.series_id,
        series_name=obs.series_name,
        unit=obs.unit,
        category=obs.category,
        observation_date=obs.observation_date,
        value=obs.value,
        available_at=obs.available_at,
        provider=obs.provider,
        metadata_json={"raw": obs.raw_metadata} if obs.raw_metadata else None,
    )
