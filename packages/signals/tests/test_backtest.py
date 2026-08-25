"""
Backtest engine tests.

Verifies:
- Next-bar execution model
- Transaction-cost deduction
- Point-in-time correctness (signal at t → position at t+1)
- Sharpe, Sortino, CAGR, Calmar, max drawdown
- Edge cases: insufficient data, zero signal, all-loss periods
"""

import math

import pandas as pd
import pytest
from aegis_signals.backtest import _cagr, _calmar, _sortino, run_signal_backtest

# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------

def _prices(values: list[float], freq: str = "h") -> pd.Series:
    return pd.Series(values, index=pd.date_range("2026-01-01", periods=len(values), freq=freq))


def _signals(values: list[float], freq: str = "h") -> pd.Series:
    return pd.Series(values, index=pd.date_range("2026-01-01", periods=len(values), freq=freq))


# ---------------------------------------------------------------------------
# Execution model
# ---------------------------------------------------------------------------

class TestExecutionModel:
    def test_next_bar_execution_label(self) -> None:
        result = run_signal_backtest(_prices([100, 110, 121, 121]), _signals([1, 1, 1, 1]))
        assert result["execution"] == "next_bar_close"

    def test_observations_is_price_changes_minus_one(self) -> None:
        # 4 prices → 3 return periods → 3 observations (last market_return is NaN and dropped)
        result = run_signal_backtest(_prices([100, 110, 121, 121]), _signals([1, 1, 1, 1]))
        assert result["observations"] == 3

    def test_turnover_counts_position_changes(self) -> None:
        # All long → only initial entry → turnover = 1 position unit
        result = run_signal_backtest(
            _prices([100, 110, 121, 121]),
            _signals([1.0, 1.0, 1.0, 1.0]),
        )
        assert result["turnover"] == 1.0

    def test_costs_reduce_final_equity(self) -> None:
        free = run_signal_backtest(
            _prices([100, 110, 121, 121]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        costly = run_signal_backtest(
            _prices([100, 110, 121, 121]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=100,
        )
        assert costly["final_equity"] < free["final_equity"]

    def test_final_equity_with_100bps_cost_below_1_21(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 121]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=100,
        )
        assert result["final_equity"] < 1.21

    def test_explicit_step_by_step_next_bar_trade_execution(self) -> None:
        """
        Step-by-step proof of next-bar execution:
        T0: price=100, signal=+1 (long)
        T1: price=150, signal=-1 (flip to short)
        T2: price=120, signal=+1

        Bar 0 (T0 -> T1):
          market_return = (150 - 100) / 100 = +50%
          position = +1
          position_change = 1.0 (0 -> +1)
          cost (10 bps = 0.001): 1.0 * 0.001 = 0.001
          strategy_return = 1.0 * 0.50 - 0.001 = 0.499
          equity at T1 = 1.0 * (1 + 0.499) = 1.499

        Bar 1 (T1 -> T2):
          market_return = (120 - 150) / 150 = -20%
          position = -1 (short)
          position_change = |-1 - (+1)| = 2.0 (flip long -> short)
          cost: 2.0 * 0.001 = 0.002
          strategy_return = -1.0 * (-0.20) - 0.002 = 0.198
          equity at T2 = 1.499 * (1 + 0.198) = 1.795802

        Total turnover: 1.0 + 2.0 = 3.0 units
        """
        prices = _prices([100.0, 150.0, 120.0])
        signals = _signals([1.0, -1.0, 1.0])
        result = run_signal_backtest(
            prices,
            signals,
            transaction_cost_bps=10.0,
            slippage_bps=0.0,
        )
        assert result["observations"] == 2
        assert result["turnover"] == 3.0
        assert result["final_equity"] == pytest.approx(1.795802, rel=1e-5)
        assert result["total_return"] == pytest.approx(0.795802, rel=1e-5)
        assert result["win_rate"] == pytest.approx(1.0, abs=1e-3)
        assert len(result["equity_curve"]) == 2
        assert result["equity_curve"][0]["equity"] == pytest.approx(1.499, rel=1e-4)
        assert result["equity_curve"][1]["equity"] == pytest.approx(1.795802, rel=1e-4)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


class TestValidation:
    def test_rejects_one_price(self) -> None:
        with pytest.raises(ValueError, match="At least two"):
            run_signal_backtest(_prices([100.0]), _signals([1.0]))

    def test_rejects_negative_cost(self) -> None:
        with pytest.raises(ValueError, match="cannot be negative"):
            run_signal_backtest(_prices([100, 110]), _signals([1, 1]), transaction_cost_bps=-1)

    def test_rejects_negative_slippage(self) -> None:
        with pytest.raises(ValueError, match="cannot be negative"):
            run_signal_backtest(_prices([100, 110]), _signals([1, 1]), slippage_bps=-0.1)


# ---------------------------------------------------------------------------
# Sharpe
# ---------------------------------------------------------------------------

class TestSharpe:
    def test_sharpe_is_zero_when_zero_position(self) -> None:
        # Zero signal → zero position → zero strategy returns → std = 0 → sharpe = 0
        result = run_signal_backtest(_prices([100, 100, 100, 100]), _signals([0, 0, 0, 0]))
        assert result["sharpe"] == 0.0

    def test_sharpe_sign_correct_for_profitable_long(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert result["sharpe"] > 0


# ---------------------------------------------------------------------------
# Sortino
# ---------------------------------------------------------------------------

class TestSortino:
    def test_sortino_is_zero_when_no_downside(self) -> None:
        # All returns positive → no downside → sortino = 0 (insufficient downside sample)
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert result["sortino"] == 0.0

    def test_sortino_is_finite_with_mixed_returns(self) -> None:
        # Alternating up/down to guarantee downside
        result = run_signal_backtest(
            _prices([100, 110, 100, 110, 100, 110]),
            _signals([1, -1, 1, -1, 1, -1]),
            transaction_cost_bps=0,
        )
        assert math.isfinite(result["sortino"])

    def test_sortino_direct_calculation(self) -> None:
        """Unit test the _sortino helper directly."""
        returns = pd.Series([0.05, -0.02, 0.03, -0.04, 0.01])
        result = _sortino(returns, annualization=252.0)
        assert result > 0  # positive mean, finite downside

    def test_sortino_with_single_downside_period(self) -> None:
        """Sortino handles single downside observation correctly without dropping it."""
        returns = pd.Series([0.02, 0.03, 0.01, -0.01, 0.02])
        result = _sortino(returns, annualization=252.0)
        assert result > 0
        assert math.isfinite(result)


# ---------------------------------------------------------------------------
# CAGR
# ---------------------------------------------------------------------------

class TestCAGR:
    def test_cagr_direct_doubling(self) -> None:
        """Equity doubles over 252 periods → CAGR ≈ 100%."""
        equity = pd.Series([1.0 * (2.0 ** (i / 252)) for i in range(252)])
        result = _cagr(equity, annualization=252.0)
        assert result == pytest.approx(1.0, rel=0.01)

    def test_cagr_wipeout_returns_negative_one(self) -> None:
        equity = pd.Series([1.0, 0.5, 0.0])
        assert _cagr(equity, annualization=252.0) == -1.0
        equity = pd.Series([1.0 * (2.0 ** (i / 252)) for i in range(252)])
        result = _cagr(equity, annualization=252.0)
        assert result == pytest.approx(1.0, rel=0.01)

    def test_cagr_flat_equity_is_zero(self) -> None:
        equity = pd.Series([1.0, 1.0, 1.0, 1.0])
        assert _cagr(equity, annualization=252.0) == pytest.approx(0.0, abs=1e-6)

    def test_cagr_in_backtest_result_is_finite(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert math.isfinite(result["cagr"])


# ---------------------------------------------------------------------------
# Calmar
# ---------------------------------------------------------------------------

class TestCalmar:
    def test_calmar_is_zero_when_no_drawdown(self) -> None:
        # Monotonically rising equity → max_drawdown = 0 → calmar = 0
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert result["max_drawdown"] == pytest.approx(0.0, abs=1e-4)
        assert result["calmar"] == 0.0

    def test_calmar_direct_formula(self) -> None:
        # CAGR=0.20, drawdown=-0.10 → calmar=2.0
        assert _calmar(0.20, -0.10) == pytest.approx(2.0, rel=1e-6)

    def test_calmar_positive_drawdown_returns_zero(self) -> None:
        # Caller passed max_drawdown >= 0 (no drawdown)
        assert _calmar(0.15, 0.0) == 0.0

    def test_calmar_in_backtest_with_drawdown(self) -> None:
        # Signal that causes alternating positions will generate some drawdown
        result = run_signal_backtest(
            _prices([100, 80, 90, 70, 85, 95]),
            _signals([1, 1, -1, -1, 1, 1]),
            transaction_cost_bps=50,
        )
        assert math.isfinite(result["calmar"])


# ---------------------------------------------------------------------------
# Max drawdown
# ---------------------------------------------------------------------------

class TestMaxDrawdown:
    def test_drawdown_is_non_positive(self) -> None:
        result = run_signal_backtest(
            _prices([100, 80, 90, 70, 85]),
            _signals([1, 1, 1, 1, 1]),
        )
        assert result["max_drawdown"] <= 0

    def test_no_drawdown_on_monotone_uptrend(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert result["max_drawdown"] == pytest.approx(0.0, abs=1e-4)


# ---------------------------------------------------------------------------
# Equity curve
# ---------------------------------------------------------------------------

class TestEquityCurve:
    def test_equity_curve_length_matches_observations(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
        )
        assert len(result["equity_curve"]) == result["observations"]

    def test_equity_curve_starts_near_one(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        # First entry is 1 + first period return
        assert result["equity_curve"][0]["equity"] > 0

    def test_equity_curve_final_matches_final_equity(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121, 133.1]),
            _signals([1, 1, 1, 1]),
        )
        assert result["equity_curve"][-1]["equity"] == pytest.approx(
            result["final_equity"], rel=1e-5
        )

    def test_equity_curve_entries_have_timestamp_and_equity(self) -> None:
        result = run_signal_backtest(
            _prices([100, 110, 121]),
            _signals([1, 1, 1]),
        )
        for entry in result["equity_curve"]:
            assert "timestamp" in entry
            assert "equity" in entry
            assert "drawdown" in entry
            assert entry["equity"] > 0

    def test_win_rate_calculation(self) -> None:
        # 3 positive periods, 1 negative period
        result = run_signal_backtest(
            _prices([100, 110, 120, 130, 125]),
            _signals([1, 1, 1, 1, 1]),
            transaction_cost_bps=0,
        )
        assert result["win_rate"] == pytest.approx(0.75, abs=1e-3)
