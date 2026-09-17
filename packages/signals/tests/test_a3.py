"""Unit tests for AEGIS Adaptive Alpha Engine (A³) Python implementation."""

import pandas as pd
import pytest

from aegis_signals.a3 import compute_market_structure, evaluate_a3_adaptive_alpha


def test_market_structure_computation() -> None:
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    df = pd.DataFrame(
        {
            "open": [100 + i for i in range(30)],
            "high": [102 + i for i in range(30)],
            "low": [99 + i for i in range(30)],
            "close": [101 + i for i in range(30)],
            "volume": [5000 + (i % 5) * 1000 for i in range(30)],
        },
        index=dates,
    )

    mkt = compute_market_structure("BTC", df)
    assert mkt.symbol == "BTC"
    assert mkt.composite_technical_score is not None
    assert "trend_score" in mkt.dimensions
    assert "momentum_score" in mkt.dimensions
    assert "volume_participation_score" in mkt.dimensions


def test_a3_evaluation() -> None:
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    df = pd.DataFrame(
        {
            "open": [100 + i for i in range(30)],
            "high": [102 + i for i in range(30)],
            "low": [99 + i for i in range(30)],
            "close": [101 + i for i in range(30)],
            "volume": [5000 for _ in range(30)],
        },
        index=dates,
    )

    eval_result = evaluate_a3_adaptive_alpha("BTC", df, csvd_score=1.5)
    assert eval_result.symbol == "BTC"
    assert eval_result.model_version == "A3-V1.3.0"
    assert eval_result.signal_action in ["BUY", "WATCH", "SELL", "NO TRADE"]
    assert len(eval_result.factor_contributions) == 8
    assert eval_result.expected_excess_return_pct > 0
    assert eval_result.uncertainty_pct > 0

    # Verify hard asset barrier: Crypto assets must have NOT_APPLICABLE status with 0 net contribution for equity fundamentals
    fund_contrib = next(
        c for c in eval_result.factor_contributions if c.factor_id == "aegis-fund-v1"
    )
    val_contrib = next(c for c in eval_result.factor_contributions if c.factor_id == "aegis-val-v1")
    assert fund_contrib.net_contribution == 0.0
    assert val_contrib.net_contribution == 0.0
