"""
FRED Macro Data Provider
========================
Fetches macroeconomic time series from the Federal Reserve Economic Data (FRED)
API (St. Louis Fed). No API key is required for the public observations endpoint,
though a key raises rate limits from 120 → 120_000 req/day.

Point-in-time semantics
-----------------------
``observation_date``  : The date the economic data refers to (e.g. 2024-09-01).
``available_at``      : The datetime Aegis retrieved the value. This is used as
                        the look-ahead barrier in backtests — a value is never
                        usable before it was retrieved.

The FRED API returns data with a ``realtime_start`` / ``realtime_end`` range.
We do NOT use those as ``available_at`` because FRED publication lags vary by
series. Using retrieval time is conservative and always correct.
"""

from __future__ import annotations

import contextlib
import os
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

import httpx
from aegis_observability.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Series catalogue — the 6 series specified in the blueprint
# ---------------------------------------------------------------------------

FRED_SERIES: dict[str, dict[str, str]] = {
    "DGS10": {
        "name": "10-Year Treasury Constant Maturity Rate",
        "unit": "percent",
        "category": "yields",
        "description": "10-Year Treasury yield — proxy for long-term growth expectations.",
    },
    "DGS2": {
        "name": "2-Year Treasury Constant Maturity Rate",
        "unit": "percent",
        "category": "yields",
        "description": "2-Year Treasury yield — sensitive to Fed rate expectations.",
    },
    "FEDFUNDS": {
        "name": "Federal Funds Effective Rate",
        "unit": "percent",
        "category": "monetary_policy",
        "description": "Overnight interbank lending rate set by FOMC policy.",
    },
    "CPIAUCSL": {
        "name": "Consumer Price Index for All Urban Consumers",
        "unit": "index_1982_84_100",
        "category": "inflation",
        "description": "Headline CPI; YoY change used as inflation proxy in regime model.",
    },
    "UNRATE": {
        "name": "Civilian Unemployment Rate",
        "unit": "percent",
        "category": "labour",
        "description": "Unemployment rate; 3-month change used as growth proxy in regime model.",
    },
    "BAMLH0A0HYM2": {
        "name": "ICE BofA US High Yield OAS",
        "unit": "percent",
        "category": "credit",
        "description": "High-yield credit spread over Treasuries — credit-stress indicator.",
    },
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MacroObservation:
    """
    A single point-in-time macroeconomic observation.

    ``observation_date``  The economic period this data refers to.
    ``value``             The numeric value, or None if FRED returned '.'.
    ``available_at``      When Aegis retrieved this value (look-ahead barrier).
    ``series_id``         FRED series identifier (e.g. "DGS10").
    ``series_name``       Human-readable series name.
    ``unit``              Unit string (e.g. "percent").
    ``category``          Grouping tag (yields / inflation / labour / credit / monetary_policy).
    ``is_revised``        True if FRED returned a value flagged as a revision.
    ``provider``          Always "FRED".
    """

    series_id: str
    series_name: str
    unit: str
    category: str
    observation_date: date
    value: float | None
    available_at: datetime
    is_revised: bool = False
    provider: str = "FRED"
    raw_metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

_FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"


class FREDProvider:
    """
    Fetches the most recent N observations for each configured FRED series.

    Usage::

        provider = FREDProvider()
        observations = await provider.fetch_latest(limit=12)
    """

    def __init__(self) -> None:
        self._api_key: str | None = os.getenv("FRED_API_KEY")
        if not self._api_key:
            logger.info(
                "FRED_API_KEY not set — using public endpoint (120 req/day limit). "
                "Set FRED_API_KEY for higher rate limits."
            )

    @property
    def provider_id(self) -> str:
        return "fred"

    async def fetch_series(
        self,
        series_id: str,
        limit: int = 24,
    ) -> list[MacroObservation]:
        """
        Fetch the most recent ``limit`` observations for a single FRED series.

        Returns an empty list if the series is unavailable or the request fails.
        Never raises — caller should handle empty list gracefully.
        """
        meta = FRED_SERIES.get(series_id)
        if meta is None:
            logger.warning("Unknown FRED series: %s", series_id)
            return []

        params: dict[str, Any] = {
            "series_id": series_id,
            "sort_order": "desc",
            "limit": limit,
            "file_type": "json",
        }
        if self._api_key:
            params["api_key"] = self._api_key

        retrieved_at = datetime.now(UTC)
        observations: list[MacroObservation] = []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(_FRED_BASE, params=params)
                if resp.status_code != 200:
                    logger.warning(
                        "FRED returned HTTP %d for series %s", resp.status_code, series_id
                    )
                    return []
                data = resp.json()
        except Exception as exc:
            logger.warning("FRED fetch failed for %s: %s", series_id, exc)
            return []

        for obs in data.get("observations", []):
            raw_value = obs.get("value", ".")
            # FRED encodes missing / not-yet-available values as "."
            value: float | None = None
            if raw_value != ".":
                with contextlib.suppress(ValueError):
                    value = float(raw_value)

            try:
                obs_date = date.fromisoformat(obs["date"])
            except (KeyError, ValueError):
                continue

            observations.append(
                MacroObservation(
                    series_id=series_id,
                    series_name=meta["name"],
                    unit=meta["unit"],
                    category=meta["category"],
                    observation_date=obs_date,
                    value=value,
                    available_at=retrieved_at,
                    is_revised=False,
                    provider="FRED",
                    raw_metadata={"fred_obs": obs},
                )
            )

        # Return chronologically ascending (oldest first)
        return list(reversed(observations))

    async def fetch_latest(
        self, series_ids: list[str] | None = None, limit_per_series: int = 24
    ) -> list[MacroObservation]:
        """
        Fetch recent observations for all (or a subset of) configured series.
        Errors on individual series are logged and skipped.
        """
        targets = series_ids or list(FRED_SERIES.keys())
        all_obs: list[MacroObservation] = []
        for sid in targets:
            obs = await self.fetch_series(sid, limit=limit_per_series)
            all_obs.extend(obs)
            if obs:
                logger.info("FRED: fetched %d observations for %s", len(obs), sid)
        return all_obs
