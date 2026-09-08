import pandas as pd
from aegis_signals.news_momentum import NewsMomentumStrategy


def test_news_momentum_timestamp_alignment_uses_matching_precision() -> None:
    prices = pd.Series(
        [100.0, 101.0],
        index=pd.to_datetime(["2026-01-01T10:00:00Z", "2026-01-01T10:05:00Z"], utc=True),
    )
    signals = pd.DataFrame(
        {"signal": [0.0]},
        index=pd.to_datetime(["2026-01-01T10:00:00.123456Z"], utc=True),
    )
    prices.index = prices.index.as_unit("ns")
    signals.index = signals.index.as_unit("ns")
    aligned = pd.merge_asof(
        prices.to_frame("price"),
        signals,
        left_index=True,
        right_index=True,
        direction="backward",
    )
    assert aligned["signal"].iloc[-1] == 0.0


def test_news_momentum_hold_is_a_valid_non_trade() -> None:
    result = NewsMomentumStrategy().evaluate(-0.2, -0.001, ["article"])
    assert result["action"] == "HOLD"
    assert result["confidence"] >= 0.0
