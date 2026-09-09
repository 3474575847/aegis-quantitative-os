import math
from typing import Any

import pandas as pd


def _sortino(returns: pd.Series, annualization: float) -> float:
    """
    Sortino ratio: annualized mean return / annualized downside deviation.
    Downside deviation is the root-mean-square of negative returns relative to 0
    across all observations.
    """
    if len(returns) < 2 or returns.isna().all():
        return 0.0
    downside_diff = returns.clip(upper=0.0)
    downside_sq_sum = float((downside_diff**2).sum())
    if downside_sq_sum <= 0.0 or math.isnan(downside_sq_sum):
        # No negative returns in sample or NaN
        return 0.0
    # Sample downside deviation across all N periods (ddof=1)
    downside_dev = (downside_sq_sum / (len(returns) - 1)) ** 0.5
    if downside_dev == 0.0 or math.isnan(downside_dev):
        return 0.0
    res = float((returns.mean() / downside_dev) * (annualization**0.5))
    return res if math.isfinite(res) else 0.0


def _cagr(equity_curve: pd.Series, annualization: float) -> float:
    """Compound annual growth rate from an equity curve (starts at 1.0)."""
    n = len(equity_curve)
    if n < 2:
        return 0.0
    start_val = float(equity_curve.iloc[0])
    end_val = float(equity_curve.iloc[-1])
    if start_val <= 0.0 or end_val <= 0.0:
        return -1.0
    total_return = end_val / start_val
    res = float(total_return ** (annualization / n) - 1.0)
    return res if math.isfinite(res) else 0.0


def _calmar(cagr: float, max_drawdown: float) -> float:
    """Calmar ratio: CAGR / abs(max drawdown). Returns 0 if drawdown is zero."""
    if max_drawdown >= 0.0 or not math.isfinite(cagr) or not math.isfinite(max_drawdown):
        # No drawdown or non-finite inputs — return 0 rather than inf
        return 0.0
    res = cagr / abs(max_drawdown)
    return res if math.isfinite(res) else 0.0


def run_signal_backtest(
    prices: pd.Series,
    signals: pd.Series,
    transaction_cost_bps: float = 5.0,
    slippage_bps: float = 0.0,
    position_size: float = 1.0,
    holding_period: int = 1,
    benchmark_prices: pd.Series | None = None,
    annualization: float = 252.0,
) -> dict[str, Any]:
    """
    Run a deterministic long/short sign strategy one bar after each signal.

    Execution model
    ---------------
    - Signal observed at bar t → position entered at bar t+1 open (next_bar_close
      approximation using close prices).
    - Position changes incur (transaction_cost_bps + slippage_bps) / 10_000 one-way.

    Metrics
    -------
    - Sharpe:   annualised mean / std of strategy returns (zero-rate assumption)
    - Sortino:  annualised mean / downside std of strategy returns
    - CAGR:     compound annual growth rate assuming 252-period year
    - Calmar:   CAGR / |max_drawdown| (0 when no drawdown)
    - Max drawdown: peak-to-trough decline in the equity curve
    """
    if len(prices) < 2 or len(signals) < 2:
        raise ValueError("At least two aligned prices and signals are required")
    if transaction_cost_bps < 0 or slippage_bps < 0:
        raise ValueError("Execution costs cannot be negative")
    if position_size < 0 or position_size > 1:
        raise ValueError("Position size must be between 0 and 1")
    if holding_period < 1:
        raise ValueError("Holding period must be at least one bar")
    if annualization <= 0:
        raise ValueError("Annualization must be positive")

    frame = pd.concat([prices.rename("price"), signals.rename("signal")], axis=1).dropna()
    if len(frame) < 2 or (frame["price"] <= 0).any():
        raise ValueError("Backtest requires at least two positive aligned prices")

    raw_positions = frame["signal"].map(lambda v: 1.0 if v > 0 else -1.0 if v < 0 else 0.0)
    positions: list[float] = []
    remaining = 0
    held_position = 0.0
    for raw_position in raw_positions:
        if remaining == 0:
            held_position = float(raw_position) * position_size
            remaining = holding_period
        positions.append(held_position)
        remaining -= 1
    frame["position"] = positions
    frame["market_return"] = frame["price"].pct_change().shift(-1)
    frame["position_change"] = frame["position"].diff().abs().fillna(frame["position"].abs())
    total_cost = (transaction_cost_bps + slippage_bps) / 10_000
    frame["strategy_return"] = (
        frame["position"] * frame["market_return"] - frame["position_change"] * total_cost
    )
    returns = frame["strategy_return"].dropna()
    if returns.empty:
        raise ValueError("Backtest produced no executable periods")

    equity = (1.0 + returns).cumprod()
    drawdown = equity / equity.cummax() - 1.0
    periods = len(returns)
    ret_std = float(returns.std(ddof=1)) if periods > 1 else 0.0
    ret_mean = float(returns.mean())
    volatility = ret_std * annualization**0.5 if periods > 1 else 0.0
    sharpe = (ret_mean / ret_std * annualization**0.5) if periods > 1 and ret_std > 0 else 0.0
    sortino = _sortino(returns, annualization)
    max_dd = float(drawdown.min())
    cagr = _cagr(equity, annualization)
    calmar = _calmar(cagr, max_dd)

    active_mask = frame.loc[returns.index, "position"] != 0
    active_returns = returns[active_mask]
    win_rate = float((active_returns > 0).mean()) if len(active_returns) > 0 else 0.0
    entry_mask = (frame["position"] != 0) & (frame["position"].shift(1).fillna(0) == 0)
    exit_mask = (frame["position"] == 0) & (frame["position"].shift(1).fillna(0) != 0)
    benchmark_return = None
    benchmark_final = None
    if benchmark_prices is not None:
        benchmark = pd.concat([benchmark_prices.rename("benchmark"), frame["price"]], axis=1)
        benchmark_returns = benchmark["benchmark"].pct_change().shift(-1).dropna()
        if not benchmark_returns.empty:
            benchmark_curve = (1.0 + benchmark_returns).cumprod()
            benchmark_final = round(float(benchmark_curve.iloc[-1]), 6)
            benchmark_return = round(float(benchmark_final - 1.0), 6)

    return {
        "observations": periods,
        "initial_capital": 1.0,
        "final_equity": round(float(equity.iloc[-1]), 6),
        "total_return": round(float(equity.iloc[-1] - 1.0), 6),
        "annualized_volatility": round(volatility, 6),
        "cagr": round(cagr, 6),
        "sharpe": round(sharpe, 6),
        "sortino": round(sortino, 6),
        "max_drawdown": round(max_dd, 6),
        "calmar": round(calmar, 6),
        "win_rate": round(win_rate, 6),
        "turnover": round(float(frame.loc[returns.index, "position_change"].sum()), 6),
        "position_size": position_size,
        "holding_period": holding_period,
        "entries": int(entry_mask.sum()),
        "exits": int(exit_mask.sum()),
        "trade_count": int((entry_mask | exit_mask).sum()),
        "benchmark_final_equity": benchmark_final,
        "benchmark_return": benchmark_return,
        "transaction_cost_bps": transaction_cost_bps,
        "slippage_bps": slippage_bps,
        "execution": "next_bar_close",
        "equity_curve": [
            {
                "timestamp": str(idx),
                "equity": round(float(val), 6),
                "drawdown": round(float(drawdown.loc[idx]), 6),
            }
            for idx, val in equity.items()
        ],
    }
