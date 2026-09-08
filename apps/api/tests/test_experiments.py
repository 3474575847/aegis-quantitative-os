"""
Experiment API endpoint tests.

Uses httpx.AsyncClient + ASGITransport so the full async stack runs in one event
loop — no thread-boundary DB connection issues.

Covers:
- Create experiment: valid, missing name, empty name, symbol uppercasing, defaults
- Get experiment: found, not found
- Clone experiment: inherits params, applies overrides, independent IDs
- Run experiment: missing signal_id rejected, result persisted, appears in history,
                  summary updated with run_count and best_sharpe
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _backtest_payload(signal_id: str, symbol: str = "BTC") -> dict[str, Any]:
    """Minimal valid backtest response from run_backtest()."""
    return {
        "signal_id": signal_id,
        "symbol": symbol,
        "market_source": "Coinbase candles",
        "methodology": "signal at t positions at t+1 close; costs deducted on position changes",
        "experiment_run_id": None,
        "result": {
            "observations": 50,
            "initial_capital": 1.0,
            "final_equity": 1.052,
            "total_return": 0.052,
            "annualized_volatility": 0.12,
            "cagr": 0.08,
            "sharpe": 0.918,
            "sortino": 1.12,
            "max_drawdown": -0.015,
            "calmar": 5.3,
            "turnover": 3.0,
            "transaction_cost_bps": 5.0,
            "slippage_bps": 0.0,
            "execution": "next_bar_close",
            "equity_curve": [{"timestamp": "2026-01-01", "equity": 1.0}],
        },
    }


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCreateExperiment:
    async def test_valid_creation_returns_expected_shape(self, async_client: AsyncClient) -> None:
        resp = await async_client.post("/api/experiments", json={
            "name": "Momentum BTC",
            "description": "Testing BTC momentum",
            "signal_id": str(uuid.uuid4()),
            "symbol": "BTC",
            "transaction_cost_bps": 5.0,
            "slippage_bps": 1.0,
            "tags": ["momentum", "crypto"],
        })
        assert resp.status_code == 200
        d = resp.json()
        assert d["name"] == "Momentum BTC"
        assert d["symbol"] == "BTC"
        assert d["transaction_cost_bps"] == 5.0
        assert d["slippage_bps"] == 1.0
        assert d["tags"] == ["momentum", "crypto"]
        assert d["run_count"] == 0
        assert d["latest_status"] == "NONE"
        assert uuid.UUID(d["experiment_id"])

    async def test_missing_name_rejected(self, async_client: AsyncClient) -> None:
        resp = await async_client.post("/api/experiments", json={"symbol": "BTC"})
        assert resp.status_code == 422

    async def test_empty_name_rejected(self, async_client: AsyncClient) -> None:
        resp = await async_client.post("/api/experiments", json={"name": ""})
        assert resp.status_code == 422

    async def test_symbol_is_uppercased(self, async_client: AsyncClient) -> None:
        resp = await async_client.post(
            "/api/experiments", json={"name": "Case test", "symbol": "btc"}
        )
        assert resp.status_code == 200
        assert resp.json()["symbol"] == "BTC"

    async def test_defaults_applied(self, async_client: AsyncClient) -> None:
        resp = await async_client.post("/api/experiments", json={"name": "Defaults test"})
        assert resp.status_code == 200
        d = resp.json()
        assert d["symbol"] == "BTC"
        assert d["transaction_cost_bps"] == 5.0
        assert d["slippage_bps"] == 0.0
        assert d["tags"] == []


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestGetExperiment:
    async def test_nonexistent_returns_404(self, async_client: AsyncClient) -> None:
        resp = await async_client.get(f"/api/experiments/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_roundtrip_create_then_get(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        created = (await async_client.post("/api/experiments", json={
            "name": "Roundtrip",
            "signal_id": sig_id,
            "symbol": "ETH",
            "transaction_cost_bps": 10.0,
        })).json()
        exp_id = created["experiment_id"]

        fetched = (await async_client.get(f"/api/experiments/{exp_id}")).json()

        assert fetched["experiment_id"] == exp_id
        assert fetched["name"] == "Roundtrip"
        assert fetched["signal_id"] == sig_id
        assert fetched["symbol"] == "ETH"
        assert fetched["transaction_cost_bps"] == 10.0


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCloneExperiment:
    async def test_clone_nonexistent_returns_404(self, async_client: AsyncClient) -> None:
        resp = await async_client.post(
            f"/api/experiments/{uuid.uuid4()}/clone",
            params={"name": "Ghost clone"},
        )
        assert resp.status_code == 404

    async def test_clone_inherits_source_params(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        source = (await async_client.post("/api/experiments", json={
            "name": "Source",
            "signal_id": sig_id,
            "symbol": "BTC",
            "transaction_cost_bps": 20.0,
            "slippage_bps": 2.0,
            "tags": ["original"],
        })).json()

        clone = (await async_client.post(
            f"/api/experiments/{source['experiment_id']}/clone",
            params={"name": "Clone A"},
        )).json()

        assert clone["name"] == "Clone A"
        assert clone["signal_id"] == sig_id
        assert clone["symbol"] == "BTC"
        assert clone["transaction_cost_bps"] == 20.0
        assert clone["slippage_bps"] == 2.0
        assert "cloned" in clone["tags"]
        assert clone["experiment_id"] != source["experiment_id"]
        assert clone["run_count"] == 0

    async def test_clone_with_overrides(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        new_sig_id = str(uuid.uuid4())
        source = (await async_client.post("/api/experiments", json={
            "name": "Base",
            "signal_id": sig_id,
            "symbol": "BTC",
            "transaction_cost_bps": 5.0,
        })).json()

        clone = (await async_client.post(
            f"/api/experiments/{source['experiment_id']}/clone",
            params={
                "name": "Override clone",
                "symbol": "ETH",
                "transaction_cost_bps": 10.0,
                "signal_id": new_sig_id,
            },
        )).json()

        assert clone["symbol"] == "ETH"
        assert clone["transaction_cost_bps"] == 10.0
        assert clone["signal_id"] == new_sig_id


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRunExperiment:
    async def test_run_without_signal_id_rejected(self, async_client: AsyncClient) -> None:
        exp = (await async_client.post("/api/experiments", json={"name": "No signal"})).json()
        resp = await async_client.post(f"/api/experiments/{exp['experiment_id']}/run")
        assert resp.status_code == 422
        assert "signal_id" in resp.json()["detail"]

    async def test_run_nonexistent_experiment_404(self, async_client: AsyncClient) -> None:
        resp = await async_client.post(f"/api/experiments/{uuid.uuid4()}/run")
        assert resp.status_code == 404

    async def test_run_persists_and_returns_result(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        with patch("aegis_api.main.run_backtest", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = _backtest_payload(sig_id)
            exp = (await async_client.post("/api/experiments", json={
                "name": "Persist run",
                "signal_id": sig_id,
            })).json()
            run_resp = await async_client.post(f"/api/experiments/{exp['experiment_id']}/run")

        assert run_resp.status_code == 200
        run = run_resp.json()
        assert run["status"] == "COMPLETED"
        assert run["experiment_id"] == exp["experiment_id"]
        assert run["signal_id"] == sig_id
        assert run["result"] is not None
        assert run["result"]["sharpe"] == pytest.approx(0.918, rel=1e-3)
        assert run["result"]["sortino"] == pytest.approx(1.12, rel=1e-3)
        assert run["result"]["cagr"] == pytest.approx(0.08, rel=1e-3)
        assert uuid.UUID(run["run_id"])

    async def test_run_appears_in_history(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        with patch("aegis_api.main.run_backtest", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = _backtest_payload(sig_id)
            exp = (await async_client.post("/api/experiments", json={
                "name": "History check",
                "signal_id": sig_id,
            })).json()
            exp_id = exp["experiment_id"]
            await async_client.post(f"/api/experiments/{exp_id}/run")
            await async_client.post(f"/api/experiments/{exp_id}/run")
            runs = (await async_client.get(f"/api/experiments/{exp_id}/runs")).json()

        assert len(runs) == 2
        for run in runs:
            assert run["status"] == "COMPLETED"
            assert run["result"] is not None
            assert run["symbol"] == "BTC"

    async def test_run_updates_experiment_summary(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        with patch("aegis_api.main.run_backtest", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = _backtest_payload(sig_id)
            exp = (await async_client.post("/api/experiments", json={
                "name": "Summary update",
                "signal_id": sig_id,
            })).json()
            exp_id = exp["experiment_id"]
            await async_client.post(f"/api/experiments/{exp_id}/run")
            summary = (await async_client.get(f"/api/experiments/{exp_id}")).json()

        assert summary["run_count"] == 1
        assert summary["latest_status"] == "COMPLETED"
        assert summary["best_sharpe"] == pytest.approx(0.918, rel=1e-3)
        assert summary["latest_run_id"] is not None

    async def test_create_with_initial_result_persists_run(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        payload = _backtest_payload(sig_id)["result"]
        created = (await async_client.post("/api/experiments", json={
            "name": "Direct Saved Experiment",
            "signal_id": sig_id,
            "symbol": "BTC",
            "initial_result": payload,
            "methodology": "signal at t positions at t+1",
        })).json()

        assert created["run_count"] == 1
        assert created["latest_status"] == "COMPLETED"
        assert created["best_sharpe"] == pytest.approx(0.918, rel=1e-3)
        assert created["latest_run_id"] is not None

        # Verify run exists in runs list
        runs = (await async_client.get(f"/api/experiments/{created['experiment_id']}/runs")).json()
        assert len(runs) == 1
        assert runs[0]["result"]["sharpe"] == pytest.approx(0.918, rel=1e-3)


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCompareExperiments:
    async def test_compare_multiple_experiments_post(self, async_client: AsyncClient) -> None:
        sig_id_1 = str(uuid.uuid4())
        sig_id_2 = str(uuid.uuid4())
        res_1 = _backtest_payload(sig_id_1)["result"]
        res_2 = dict(res_1, sharpe=1.45, total_return=0.15)

        exp1 = (await async_client.post("/api/experiments", json={
            "name": "Exp 1",
            "signal_id": sig_id_1,
            "symbol": "BTC",
            "initial_result": res_1,
        })).json()

        exp2 = (await async_client.post("/api/experiments", json={
            "name": "Exp 2",
            "signal_id": sig_id_2,
            "symbol": "ETH",
            "initial_result": res_2,
        })).json()

        compare_resp = await async_client.post("/api/experiments/compare", json={
            "experiment_ids": [exp1["experiment_id"], exp2["experiment_id"]],
        })
        assert compare_resp.status_code == 200
        comp_data = compare_resp.json()
        assert comp_data["count"] == 2
        assert len(comp_data["experiments"]) == 2

        exp1_id = exp1["experiment_id"]
        exp2_id = exp2["experiment_id"]
        exp1_comp = next(e for e in comp_data["experiments"] if e["experiment_id"] == exp1_id)
        exp2_comp = next(e for e in comp_data["experiments"] if e["experiment_id"] == exp2_id)

        assert exp1_comp["metrics"]["sharpe"] == pytest.approx(0.918, rel=1e-3)
        assert exp2_comp["metrics"]["sharpe"] == pytest.approx(1.45, rel=1e-3)
        assert exp1_comp["symbol"] == "BTC"
        assert exp2_comp["symbol"] == "ETH"

    async def test_compare_via_get_endpoint(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        exp = (await async_client.post("/api/experiments", json={
            "name": "Get Compare Test",
            "signal_id": sig_id,
        })).json()

        resp = await async_client.get(f"/api/experiments/compare?ids={exp['experiment_id']}")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1

    async def test_compare_with_missing_metrics_shows_none(self, async_client: AsyncClient) -> None:
        sig_id = str(uuid.uuid4())
        exp = (await async_client.post("/api/experiments", json={
            "name": "No Runs Yet",
            "signal_id": sig_id,
            "symbol": "SOL",
            "transaction_cost_bps": 12.0,
            "slippage_bps": 2.5,
        })).json()

        resp = await async_client.post("/api/experiments/compare", json={
            "experiment_ids": [exp["experiment_id"]],
        })
        assert resp.status_code == 200
        item = resp.json()["experiments"][0]
        assert item["metrics"] is None
        assert item["run_count"] == 0
        assert item["transaction_cost_bps"] == 12.0
        assert item["slippage_bps"] == 2.5

    async def test_compare_invalid_uuid_returns_422(self, async_client: AsyncClient) -> None:
        resp = await async_client.post("/api/experiments/compare", json={
            "experiment_ids": ["invalid-not-a-uuid"],
        })
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Failure & Edge Case Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestBacktestFailureModes:
    async def test_backtest_signal_not_found_returns_404(self, async_client: AsyncClient) -> None:
        non_existent = str(uuid.uuid4())
        with patch("aegis_api.main.get_market_ticker_history", new_callable=AsyncMock) as mock_hist:
            mock_hist.return_value = {
                "source": "coinbase",
                "datapoints": [
                    {"time": 1700000000, "close": 50000},
                    {"time": 1700000300, "close": 50100},
                ],
            }
            resp = await async_client.post(f"/api/backtests/{non_existent}?symbol=BTC")
            assert resp.status_code == 404

    async def test_backtest_insufficient_market_candles_returns_422(
        self, async_client: AsyncClient
    ) -> None:
        sig_id = str(uuid.uuid4())
        with patch("aegis_api.main.get_market_ticker_history", new_callable=AsyncMock) as mock_hist:
            mock_hist.return_value = {
                "source": "coinbase",
                "datapoints": [{"time": 1700000000, "close": 50000}],  # only 1 candle
            }
            resp = await async_client.post(f"/api/backtests/{sig_id}?symbol=BTC")
            assert resp.status_code == 422
            assert "Insufficient real market history" in resp.json()["detail"]

    async def test_rerun_does_not_mutate_experiment_definition(
        self, async_client: AsyncClient
    ) -> None:
        sig_id = str(uuid.uuid4())
        with patch("aegis_api.main.run_backtest", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = _backtest_payload(sig_id)
            exp = (await async_client.post("/api/experiments", json={
                "name": "Immutability Test",
                "signal_id": sig_id,
                "symbol": "BTC",
                "transaction_cost_bps": 7.5,
                "slippage_bps": 1.0,
            })).json()
            exp_id = exp["experiment_id"]

            # Run twice
            run1 = (await async_client.post(f"/api/experiments/{exp_id}/run")).json()
            run2 = (await async_client.post(f"/api/experiments/{exp_id}/run")).json()

            assert run1["run_id"] != run2["run_id"]

            # Fetch definition again
            exp_after = (await async_client.get(f"/api/experiments/{exp_id}")).json()
            assert exp_after["name"] == "Immutability Test"
            assert exp_after["symbol"] == "BTC"
            assert exp_after["transaction_cost_bps"] == 7.5
            assert exp_after["slippage_bps"] == 1.0
            assert exp_after["run_count"] == 2
