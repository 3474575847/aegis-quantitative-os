from typing import Any

import pandas as pd

from aegis_signals.analytics import point_in_time_zscore, rolling_mean
from aegis_signals.engine import BaseSignalProcessor


class BtcMomentumProcessor(BaseSignalProcessor):
    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        baseline = float(params.get("baseline", 60000.0))
        scale = float(params.get("scale", 10000.0))
        return (df["price"] - baseline) / scale


class MeanReversionProcessor(BaseSignalProcessor):
    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        lookback = max(1, int(params.get("lookback_period", 20)))
        mean = rolling_mean(df["price"], lookback)
        mean = mean.fillna(df["price"])
        return ((df["price"] - mean) / mean.replace(0, pd.NA) * 100).fillna(0.0)


class RedditSentimentProcessor(BaseSignalProcessor):
    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        score = pd.to_numeric(df["score"], errors="coerce").fillna(0.0)
        window = max(1, int(params.get("window", params.get("lookback", 20))))
        min_history = max(1, int(params.get("min_history", min(5, window))))
        zscore = point_in_time_zscore(score, window, min_history, ddof=0)
        if "clip" in params and params["clip"] is not None:
            clip = float(params["clip"])
            if clip <= 0:
                raise ValueError("clip must be positive when configured")
            zscore = zscore.clip(-clip, clip)
        return zscore
