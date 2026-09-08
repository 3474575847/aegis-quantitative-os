import pandas as pd
import pytest
from aegis_signals.news_momentum import NewsMomentumStrategy


def test_positive_news_and_momentum_is_buy() -> None:
    result = NewsMomentumStrategy().evaluate(1.2, 0.03, ["article-a"])
    assert result["action"] == "BUY"
    assert result["source_article_ids"] == ["article-a"]
    assert result["confidence"] > 0


def test_negative_news_and_momentum_is_sell() -> None:
    result = NewsMomentumStrategy().evaluate(-1.2, -0.03, ["article-b"])
    assert result["action"] == "SELL"


@pytest.mark.parametrize("sentiment_z,momentum", [(1.2, -0.01), (-1.2, 0.01), (0.1, 0.01)])
def test_misaligned_inputs_hold(sentiment_z: float, momentum: float) -> None:
    assert NewsMomentumStrategy().evaluate(sentiment_z, momentum)["action"] == "HOLD"


def test_strategy_computes_audit_columns() -> None:
    frame = pd.DataFrame(
        {
            "sentiment_z": [1.0, -1.0],
            "momentum": [0.02, -0.02],
            "article_ids": [["a"], ["b"]],
        }
    )
    result = NewsMomentumStrategy().compute(frame)
    assert result["action"].tolist() == ["BUY", "SELL"]
    assert {"score", "confidence", "rationale", "source_article_ids"}.issubset(result)


def test_strategy_exposes_factor_attribution() -> None:
    result = NewsMomentumStrategy().evaluate(
        1.0,
        0.02,
        factor_values={"sentiment_z": 1.0, "momentum": 0.02},
    )
    assert result["factor_values"] == {"sentiment_z": 1.0, "momentum": 0.02}
    assert {"sentiment_z", "momentum"}.issubset(result["contributing_factors"])
    assert result["factor_contributions"][0]["weight"] == 0.6
