import pandas as pd
import pytest
from aegis_signals.factors import (
    FactorEngine,
    momentum,
    rsi,
    sma_deviation,
    volatility,
    volume_surprise,
)


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "price": [100.0, 101.0, 103.0, 102.0, 105.0, 108.0],
            "volume": [10.0, 11.0, 12.0, 20.0, 22.0, 25.0],
            "sentiment_z": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        }
    )


def test_factor_functions_use_historical_rows() -> None:
    frame = _frame()
    assert momentum(frame).iloc[-1] > 0
    assert volatility(frame, window=3).iloc[-1] >= 0
    assert volume_surprise(frame, window=3).iloc[-1] > 0
    assert sma_deviation(frame, window=3).iloc[-1] > 0
    assert 0 <= rsi(frame, window=3).iloc[-1] <= 100


def test_factor_engine_returns_auditable_attribution() -> None:
    values, attribution = FactorEngine(
        {"momentum": 0.5, "sentiment_z": 0.5}, {"momentum": 3}
    ).calculate(_frame())
    assert {"momentum", "sentiment_z"}.issubset(values.columns)
    assert [item.name for item in attribution] == ["momentum", "sentiment_z"]
    assert FactorEngine.combine(attribution) == pytest.approx(
        sum(item.contribution for item in attribution)
    )


def test_unknown_factor_fails_explicitly() -> None:
    with pytest.raises(ValueError, match="Unknown factor"):
        FactorEngine({"does_not_exist": 1.0}).calculate(_frame())


def test_research_experts_exp01_exp02_exp11() -> None:
    from aegis_signals.processors import (
        BipowerJumpProcessor,
        HarqVolProcessor,
        VolScaledTsmomProcessor,
    )

    df = pd.DataFrame(
        {
            "price": [100.0 + (i % 5) * 2.0 - (i % 3) * 1.5 for i in range(30)],
        }
    )

    exp01 = VolScaledTsmomProcessor().compute(df, {"lookback": 5, "vol_window": 10})
    exp02 = HarqVolProcessor().compute(df, {})
    exp11 = BipowerJumpProcessor().compute(df, {})

    assert len(exp01) == 30
    assert len(exp02) == 30
    assert len(exp11) == 30
    assert not exp01.isna().all()
    assert not exp02.isna().all()
    assert (exp11 >= 0.0).all()
