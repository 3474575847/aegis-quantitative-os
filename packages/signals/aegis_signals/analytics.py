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


def evaluate_forward_outcomes(
    predictions: pd.Series,
    prices: pd.Series,
    horizons: list[int] | None = None,
    transaction_cost_tiers_bps: list[float] | None = None,
) -> dict[int, dict[str, float | dict[str, dict[str, float]]]]:
    """
    Evaluates point-in-time predictions against realized multi-horizon outcomes.

    Ensures zero future information leakage by shifting forward returns by +h bars
    relative to signal decision timestamp t.
    """
    if horizons is None:
        horizons = [1, 3, 6, 12, 24, 48]
    if transaction_cost_tiers_bps is None:
        transaction_cost_tiers_bps = [0.0, 5.0, 10.0, 20.0, 30.0]

    results: dict[int, dict[str, float | dict[str, dict[str, float]]]] = {}
    aligned = pd.concat([predictions.rename("pred"), prices.rename("price")], axis=1).dropna()
    if len(aligned) < 5:
        return results

    preds = aligned["pred"]
    px = aligned["price"]

    for h in horizons:
        fwd_returns = (px.shift(-h) - px) / px
        valid_mask = preds.notna() & fwd_returns.notna()
        p_valid = preds[valid_mask]
        r_valid = fwd_returns[valid_mask]

        if len(p_valid) < 3:
            continue

        ic = float(p_valid.rank().corr(r_valid.rank())) if len(p_valid) > 2 else 0.0
        hit_rate = float(
            (
                p_valid.apply(lambda x: 1 if x > 0 else -1)
                == r_valid.apply(lambda x: 1 if x > 0 else -1)
            ).mean()
        )
        mae = float((p_valid - r_valid).abs().mean())

        cost_evals: dict[str, dict[str, float]] = {}
        for cost_bps in transaction_cost_tiers_bps:
            cost_pct = cost_bps / 10000.0
            pos = p_valid.apply(lambda x: 1.0 if x > 0 else -1.0 if x < 0 else 0.0)
            net_ret = pos * r_valid - cost_pct
            cost_evals[f"{cost_bps}bps"] = {
                "mean_net_return": float(net_ret.mean()),
                "total_net_return": float(net_ret.sum()),
                "post_cost_hit_rate": float((net_ret > 0).mean()),
            }

        results[h] = {
            "horizon_bars": float(h),
            "sample_count": float(len(p_valid)),
            "information_coefficient": round(ic, 4),
            "hit_rate": round(hit_rate, 4),
            "mae": round(mae, 6),
            "cost_sensitivity": cost_evals,
        }

    return results
