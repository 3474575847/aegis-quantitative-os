import pandas as pd
import pytest
from aegis_backtesting import metrics


def test_sharpe_ratio() -> None:
    # 1% daily return, 0 vol (impossible but for math check)
    returns = pd.Series([0.01] * 10)
    # Sharpe with 0 vol is 0.0 in our implementation to avoid Inf
    assert metrics.calculate_sharpe_ratio(returns) == 0.0

    # Simple case with variance
    returns = pd.Series([0.01, -0.01, 0.02, -0.005, 0.01])
    sharpe = metrics.calculate_sharpe_ratio(returns)
    assert isinstance(sharpe, float)
    assert sharpe > 0


def test_max_drawdown() -> None:
    returns = pd.Series([0.1, -0.2, 0.1, 0.1])
    # peak is 1.1, goes to 1.1 * 0.8 = 0.88
    # drawdown is (0.88 - 1.1) / 1.1 = -0.2
    mdd = metrics.calculate_max_drawdown(returns)
    assert pytest.approx(mdd) == -0.2
