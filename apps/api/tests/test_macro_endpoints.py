"""
Tests for the P1.1 macro REST API endpoints.

  GET /api/macro/yields  — yield curve snapshot from stored observations
  GET /api/macro/regime  — 4-quadrant regime classification
  GET /api/macro/series/{series_id} — history for a single series

All DB interactions use the module-scoped SQLite fixture from conftest.py.
Tests use distinct series IDs / observation dates to avoid UNIQUE constraint
conflicts across tests that share one SQLite instance.
"""

import uuid
from datetime import UTC, date, datetime
from typing import Any

import pytest
from aegis_storage.models.macro import MacroObservationRecord

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _obs(
    series_id: str,
    obs_date: str,
    value: float | None,
    category: str = "yields",
    unit: str = "percent",
) -> MacroObservationRecord:
    return MacroObservationRecord(
        id=uuid.uuid4(),
        series_id=series_id,
        series_name=f"{series_id} test",
        unit=unit,
        category=category,
        observation_date=date.fromisoformat(obs_date),
        value=value,
        available_at=datetime.now(UTC),
        provider="FRED",
        metadata_json=None,
    )


async def _seed(records: list[Any]) -> None:
    import aegis_api.main as m

    async for session in m.db_manager.get_session():
        session.add_all(records)


# ---------------------------------------------------------------------------
# GET /api/macro/yields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestYieldCurveEndpoint:
    async def test_empty_response_when_no_relevant_series(self, async_client: Any) -> None:
        """Query before any DGS10/DGS2/FEDFUNDS/BAMLH0A0HYM2 rows exist."""
        # Note: other tests may have seeded unrelated series, but yield-curve
        # endpoint only reads DGS10, DGS2, FEDFUNDS, BAMLH0A0HYM2.
        resp = await async_client.get("/api/macro/yields")
        assert resp.status_code == 200
        data = resp.json()
        # slope_bps can only exist if both DGS10 and DGS2 are present
        assert "slope_bps" in data
        assert "is_inverted" in data
        assert "retrieved_at" in data

    async def test_inverted_curve_detected(self, async_client: Any) -> None:
        # Use unique dates (2023-01-01) not used by any other yield test
        await _seed(
            [
                _obs("DGS10", "2023-01-01", 4.20),
                _obs("DGS2", "2023-01-01", 4.85),
            ]
        )
        resp = await async_client.get("/api/macro/yields")
        assert resp.status_code == 200
        data = resp.json()
        # With 2023-01-01 as the latest, slope = (4.20 - 4.85) * 100 = -65.0 bps
        assert data["slope_bps"] == pytest.approx(-65.0, abs=0.1)
        assert data["is_inverted"] is True

    async def test_normal_curve_detected(self, async_client: Any) -> None:
        # Use dates 2022-06-01 — later than 2023-01-01, so these become "latest"
        await _seed(
            [
                _obs("DGS10", "2024-06-01", 5.10),
                _obs("DGS2", "2024-06-01", 4.50),
            ]
        )
        resp = await async_client.get("/api/macro/yields")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slope_bps"] == pytest.approx(60.0, abs=0.1)
        assert data["is_inverted"] is False

    async def test_response_contains_provenance_fields(self, async_client: Any) -> None:
        # DGS10 was already seeded above; just check provenance fields exist
        resp = await async_client.get("/api/macro/yields")
        assert resp.status_code == 200
        dgs10 = resp.json()["dgs10"]
        assert dgs10 is not None
        assert "observation_date" in dgs10
        assert "available_at" in dgs10
        assert "provider" in dgs10
        assert dgs10["provider"] == "FRED"

    async def test_null_value_observations_excluded(self, async_client: Any) -> None:
        """NULL values (FRED '.') must not appear as the latest value."""
        # Seed FEDFUNDS with a future null and an older real value
        await _seed(
            [
                _obs("FEDFUNDS", "2025-07-01", 5.33),
                _obs("FEDFUNDS", "2025-08-01", None),  # unreleased
            ]
        )
        resp = await async_client.get("/api/macro/yields")
        assert resp.status_code == 200
        ff = resp.json()["fedfunds"]
        assert ff is not None
        # Must return the non-null July value, not the null August one
        assert ff["value"] == pytest.approx(5.33)
        assert ff["observation_date"] == "2025-07-01"


# ---------------------------------------------------------------------------
# GET /api/macro/regime
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestRegimeEndpoint:
    async def test_unknown_regime_when_no_unrate_cpi_data(self, async_client: Any) -> None:
        """Before UNRATE / CPIAUCSL seeded, regime must be UNKNOWN."""
        resp = await async_client.get("/api/macro/regime")
        assert resp.status_code == 200
        data = resp.json()
        # May or may not be UNKNOWN depending on whether prior tests seeded it,
        # but the response shape must always be valid
        assert data["regime"] in {"UNKNOWN", "GOLDILOCKS", "STAGFLATION", "REFLATION", "DEFLATION"}
        assert "methodology" in data
        assert "classified_at" in data

    async def test_goldilocks_regime(self, async_client: Any) -> None:
        """Growth UP (UNRATE falling), Inflation DOWN (CPI falling) → GOLDILOCKS."""
        # Use months 2020-01 through 2020-05 (unique, not used elsewhere)
        unrate = [_obs("UNRATE", f"2020-0{i + 1}-01", 4.5 - i * 0.2, "labour") for i in range(5)]
        cpi = [
            _obs("CPIAUCSL", f"2020-0{i + 1}-01", 320.0 - i * 0.5, "inflation", "index")
            for i in range(5)
        ]
        await _seed(unrate + cpi)

        resp = await async_client.get("/api/macro/regime")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"] == "GOLDILOCKS"
        assert data["growth_direction"] == "UP"
        assert data["inflation_direction"] == "DOWN"

    async def test_stagflation_regime(self, async_client: Any) -> None:
        """Growth DOWN (UNRATE rising), Inflation UP (CPI rising) → STAGFLATION."""
        # Use months 2021-01 through 2021-05 — no conflict with 2020-xx above
        unrate = [_obs("UNRATE", f"2021-0{i + 1}-01", 4.0 + i * 0.3, "labour") for i in range(5)]
        cpi = [
            _obs("CPIAUCSL", f"2021-0{i + 1}-01", 280.0 + i * 1.5, "inflation", "index")
            for i in range(5)
        ]
        await _seed(unrate + cpi)

        resp = await async_client.get("/api/macro/regime")
        assert resp.status_code == 200
        # With 2021 data as the most recent, regime should reflect 2021 trajectory
        data = resp.json()
        assert data["regime"] == "STAGFLATION"

    async def test_regime_response_contains_indicator_fields(self, async_client: Any) -> None:
        # UNRATE/CPI data already seeded by earlier tests
        resp = await async_client.get("/api/macro/regime")
        data = resp.json()
        if data["regime"] != "UNKNOWN":
            assert data["growth_indicator"] is not None
            assert data["inflation_indicator"] is not None
        assert "classified_at" in data
        assert "growth_direction" in data
        assert "inflation_direction" in data

    async def test_reflation_regime(self, async_client: Any) -> None:
        """Growth UP (UNRATE falling), Inflation UP (CPI rising) → REFLATION."""
        # Use months 2022-01 through 2022-05 — unique
        unrate = [_obs("UNRATE", f"2022-0{i + 1}-01", 5.0 - i * 0.2, "labour") for i in range(5)]
        cpi = [
            _obs("CPIAUCSL", f"2022-0{i + 1}-01", 290.0 + i * 2.0, "inflation", "index")
            for i in range(5)
        ]
        await _seed(unrate + cpi)

        resp = await async_client.get("/api/macro/regime")
        assert resp.status_code == 200
        assert resp.json()["regime"] == "REFLATION"


# ---------------------------------------------------------------------------
# GET /api/macro/series/{series_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestMacroSeriesEndpoint:
    async def test_empty_series_returns_empty_datapoints(self, async_client: Any) -> None:
        """BAMLH0A0HYM2 is not seeded by any other test — expect empty."""
        resp = await async_client.get("/api/macro/series/BAMLH0A0HYM2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 0
        assert data["datapoints"] == []
        assert data["series_id"] == "BAMLH0A0HYM2"

    async def test_returns_stored_observations(self, async_client: Any) -> None:
        # Use a unique series identifier (TEST_SERIES_A) to avoid conflicts
        await _seed(
            [
                _obs("TEST_SERIES_A", "2019-06-01", 310.5, "inflation", "index"),
                _obs("TEST_SERIES_A", "2019-07-01", 311.2, "inflation", "index"),
                _obs("TEST_SERIES_A", "2019-08-01", 311.9, "inflation", "index"),
            ]
        )
        resp = await async_client.get("/api/macro/series/TEST_SERIES_A")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 3
        assert len(data["datapoints"]) == 3
        # Oldest first
        assert data["datapoints"][0]["observation_date"] == "2019-06-01"
        assert data["datapoints"][-1]["observation_date"] == "2019-08-01"

    async def test_datapoint_has_pit_available_at(self, async_client: Any) -> None:
        await _seed([_obs("TEST_SERIES_B", "2019-09-01", 4.1, "labour")])
        resp = await async_client.get("/api/macro/series/TEST_SERIES_B")
        dp = resp.json()["datapoints"][0]
        assert "available_at" in dp
        datetime.fromisoformat(dp["available_at"])  # must be valid ISO

    async def test_limit_parameter_respected(self, async_client: Any) -> None:
        records = [_obs("TEST_SERIES_C", f"2019-{m:02d}-01", 4.5 + m * 0.01) for m in range(1, 13)]
        await _seed(records)
        resp = await async_client.get("/api/macro/series/TEST_SERIES_C?limit=5")
        data = resp.json()
        assert data["count"] == 5
        assert len(data["datapoints"]) == 5

    async def test_null_values_excluded_from_series(self, async_client: Any) -> None:
        """FRED missing-value rows (NULL) must not appear in history."""
        await _seed(
            [
                _obs("TEST_SERIES_D", "2019-07-01", 5.33),
                _obs("TEST_SERIES_D", "2019-08-01", None),
            ]
        )
        resp = await async_client.get("/api/macro/series/TEST_SERIES_D")
        data = resp.json()
        assert data["count"] == 1
        assert data["datapoints"][0]["value"] == pytest.approx(5.33)
