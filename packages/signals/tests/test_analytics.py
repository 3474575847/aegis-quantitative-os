import pandas as pd
import pytest
from aegis_signals import analytics


def test_rolling_zscore() -> None:
    data = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    z = analytics.rolling_zscore(data, window=3)

    # window 3 mean of [1,2,3] is 2, std is 1
    # z of 3 is (3-2)/1 = 1
    assert pytest.approx(float(z.iloc[2])) == 1.0
    assert pd.isna(z.iloc[0])


def test_lagged_correlation() -> None:
    s1 = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    s2 = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    # Perfect correlation
    corr = analytics.lagged_correlation(s1, s2, window=3)
    assert pytest.approx(float(corr.iloc[2])) == 1.0
