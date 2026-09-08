"""
MacroRepository — persistence and query helpers for macro observations.
"""

from __future__ import annotations

from collections.abc import Sequence

from aegis_storage.models.macro import MacroObservationRecord
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class MacroRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    async def upsert_observations(self, records: list[MacroObservationRecord]) -> int:
        """
        Insert new observations; skip rows that already exist for the same
        (series_id, observation_date) pair — older retrievals are never
        overwritten (PIT invariant).

        Returns the number of new rows inserted.
        """
        if not records:
            return 0

        inserted = 0
        for rec in records:
            # Check if this (series_id, observation_date) already exists
            existing = (
                (
                    await self.session.execute(
                        select(MacroObservationRecord).where(
                            MacroObservationRecord.series_id == rec.series_id,
                            MacroObservationRecord.observation_date == rec.observation_date,
                        )
                    )
                )
                .scalars()
                .first()
            )

            if existing is None:
                self.session.add(rec)
                inserted += 1
            # If it exists we do NOT overwrite — the first retrieval is
            # the point-in-time record; subsequent revisions are ignored
            # until a revised value endpoint is implemented.

        return inserted

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def get_latest_per_series(
        self, series_ids: list[str] | None = None
    ) -> list[MacroObservationRecord]:
        """
        Return the most recent observation for each series (or each in
        ``series_ids``). Filters out NULL values so the caller always gets
        the most recent *published* value.
        """
        if series_ids is None:
            # Get all distinct series stored
            series_ids_result = (
                (await self.session.execute(select(MacroObservationRecord.series_id).distinct()))
                .scalars()
                .all()
            )
            series_ids = list(series_ids_result)

        result: list[MacroObservationRecord] = []
        for sid in series_ids:
            row = (
                (
                    await self.session.execute(
                        select(MacroObservationRecord)
                        .where(
                            MacroObservationRecord.series_id == sid,
                            MacroObservationRecord.value.is_not(None),
                        )
                        .order_by(MacroObservationRecord.observation_date.desc())
                        .limit(1)
                    )
                )
                .scalars()
                .first()
            )
            if row is not None:
                result.append(row)

        return result

    async def get_series_history(
        self,
        series_id: str,
        limit: int = 60,
    ) -> Sequence[MacroObservationRecord]:
        """Return recent history for a single series, oldest-first."""
        return (
            (
                await self.session.execute(
                    select(MacroObservationRecord)
                    .where(
                        MacroObservationRecord.series_id == series_id,
                        MacroObservationRecord.value.is_not(None),
                    )
                    .order_by(MacroObservationRecord.observation_date.asc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
