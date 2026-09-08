import pandas as pd


def point_in_time_zscore(
    data: pd.Series,
    window: int = 20,
    min_history: int = 5,
    ddof: int = 0,
) -> pd.Series:
    """Normalize each observation against only its preceding observations.

    Values without enough prior history, or with zero historical variance, are
    returned as NaN so callers cannot mistake an unavailable score for neutral.
    """
    window = max(1, int(window))
    min_history = max(1, min(int(min_history), window))
    history = data.shift(1)
    mean = history.rolling(window=window, min_periods=min_history).mean()
    std = history.rolling(window=window, min_periods=min_history).std(ddof=ddof)
    return (data - mean).where(std > 0) / std.where(std > 0)


def rolling_mean(data: pd.Series, window: int) -> pd.Series:
    """Compute deterministic rolling mean."""
    return data.rolling(window=window).mean()


def rolling_std(data: pd.Series, window: int) -> pd.Series:
    """Compute deterministic rolling standard deviation."""
    return data.rolling(window=window).std()


def rolling_zscore(data: pd.Series, window: int) -> pd.Series:
    """Compute rolling z-score (normalization)."""
    mean = data.rolling(window=window).mean()
    std = data.rolling(window=window).std()
    return (data - mean) / std


def rolling_returns(data: pd.Series, periods: int = 1) -> pd.Series:
    """Compute rolling percentage returns."""
    return data.pct_change(periods=periods)


def lagged_correlation(
    series1: pd.Series, series2: pd.Series, window: int, lag: int = 0
) -> pd.Series:
    """Compute rolling correlation between two series with optional lag."""
    if lag > 0:
        series2 = series2.shift(lag)
    return series1.rolling(window=window).corr(series2)


def volatility_normalization(data: pd.Series, window: int, target_vol: float = 0.1) -> pd.Series:
    """Normalize series by rolling volatility to reach target volume."""
    vol = data.rolling(window=window).std()
    return (data / vol) * target_vol


def rolling_rank(data: pd.Series, window: int) -> pd.Series:
    """Compute rolling percentile rank (0 to 1)."""
    return data.rolling(window=window).rank(pct=True)
