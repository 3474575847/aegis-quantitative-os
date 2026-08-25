from typing import Any

import pandas as pd

from aegis_signals.analytics import rolling_mean
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
        score = df["score"].astype(float)
        center = float(params.get("center_score", 750.0))
        scale = float(params.get("scale", 400.0))
        return ((score - center) / scale).clip(-3.0, 3.0)
