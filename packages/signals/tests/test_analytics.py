import pandas as pd
import pytest
from aegis_signals import analytics
from aegis_signals.processors import RedditSentimentProcessor


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


def test_reddit_sentiment_uses_zscore_behavior() -> None:
    df = pd.DataFrame({"score": [10.0, 20.0, 30.0, 40.0, 50.0, 80.0]})
    result = RedditSentimentProcessor().compute(df, {"window": 3, "min_history": 2})

    assert pd.isna(result.iloc[0])
    assert pytest.approx(float(result.iloc[2]), rel=1e-6) == 3.0
    assert float(result.iloc[-1]) != float(result.iloc[2])


def test_sentiment_zscore_changes_with_historical_distribution() -> None:
    processor = RedditSentimentProcessor()
    narrow = processor.compute(
        pd.DataFrame({"score": [1.0, 2.0, 3.0, 4.0]}), {"window": 3, "min_history": 2}
    )
    wide = processor.compute(
        pd.DataFrame({"score": [1.0, 10.0, 20.0, 4.0]}), {"window": 3, "min_history": 2}
    )
    assert float(narrow.iloc[-1]) != float(wide.iloc[-1])


def test_sentiment_zscore_is_not_restricted_to_two_values() -> None:
    result = RedditSentimentProcessor().compute(
        pd.DataFrame({"score": [1.0, 2.0, 4.0, 8.0, 16.0, 32.0]}),
        {"window": 4, "min_history": 2},
    )
    values = result.dropna().tolist()
    assert len(set(values)) > 2
    assert 3 not in values
    assert 1.875 not in values


def test_sentiment_zscore_requires_history() -> None:
    result = RedditSentimentProcessor().compute(
        pd.DataFrame({"score": [10.0, 20.0]}), {"window": 5, "min_history": 3}
    )
    assert result.isna().all()


def test_sentiment_zscore_handles_zero_variance_without_fabricating() -> None:
    result = RedditSentimentProcessor().compute(
        pd.DataFrame({"score": [5.0, 5.0, 5.0, 6.0]}), {"window": 3, "min_history": 2}
    )
    assert pd.isna(result.iloc[2])
    assert pd.isna(result.iloc[3])


def test_sentiment_zscore_is_point_in_time() -> None:
    processor = RedditSentimentProcessor()
    baseline = processor.compute(
        pd.DataFrame({"score": [1.0, 2.0, 3.0, 4.0]}), {"window": 2, "min_history": 2}
    )
    with_future = processor.compute(
        pd.DataFrame({"score": [1.0, 2.0, 3.0, 4.0, 1000.0]}), {"window": 2, "min_history": 2}
    )
    assert baseline.iloc[:4].equals(with_future.iloc[:4])


def test_sentiment_zscore_supports_both_directions() -> None:
    result = RedditSentimentProcessor().compute(
        pd.DataFrame({"score": [1.0, 2.0, 3.0, 2.0, 1.0]}), {"window": 3, "min_history": 2}
    )
    assert (result.dropna() > 0).any()
    assert (result.dropna() < 0).any()


def test_sentiment_extremes_are_not_clipped_unless_configured() -> None:
    processor = RedditSentimentProcessor()
    result = processor.compute(
        pd.DataFrame({"score": [0.0, 1.0, 2.0, 100.0]}), {"window": 3, "min_history": 2}
    )
    clipped = processor.compute(
        pd.DataFrame({"score": [0.0, 1.0, 2.0, 100.0]}),
        {"window": 3, "min_history": 2, "clip": 3.0},
    )
    assert float(result.iloc[-1]) > 3.0
    assert float(clipped.iloc[-1]) == 3.0
