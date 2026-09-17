from typing import Any

import pandas as pd

from aegis_signals.analytics import point_in_time_zscore, rolling_mean
from aegis_signals.csvd import CSVDProcessor
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


class VolScaledTsmomProcessor(BaseSignalProcessor):
    """
    EXP-01: Volatility-Scaled Time-Series Momentum (Moskowitz, Ooi, & Pedersen 2012).

    Calculates trend signal normalized by historical realized volatility:
    Signal = r_{t, t-lookback} / sigma_t
    """

    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        price = pd.to_numeric(df["price"] if "price" in df else df["close"], errors="coerce")
        lookback = max(1, int(params.get("lookback", 20)))
        vol_window = max(2, int(params.get("vol_window", 20)))

        ret = price.pct_change(periods=lookback)
        vol = price.pct_change().rolling(window=vol_window, min_periods=2).std(ddof=1)

        # Volatility-scaled signal
        scaled_mom = (ret / vol.replace(0.0, pd.NA)).fillna(0.0)
        return scaled_mom.clip(-3.0, 3.0)


class HarqVolProcessor(BaseSignalProcessor):
    """
    EXP-02: HARQ Realized Volatility Forecast (Bollerslev, Patton, & Quaedvlieg 2016).

    Attenuates volatility autoregression based on realized quarticity (RQ_t).
    """

    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        price = pd.to_numeric(df["price"] if "price" in df else df["close"], errors="coerce")
        rets = price.pct_change().fillna(0.0)

        rv_d = rets.pow(2).rolling(window=1).sum()
        rv_w = rets.pow(2).rolling(window=5).mean()
        rv_m = rets.pow(2).rolling(window=22).mean()

        # Realized Quarticity estimate
        rq = (1.0 / 3.0) * rets.pow(4).rolling(window=5).sum()
        rq_adj = 1.0 + (rq / (rv_d.pow(2).replace(0.0, pd.NA))).fillna(0.0).clip(0.0, 5.0)

        harq_forecast = (0.4 * rv_d * (1.0 / rq_adj) + 0.35 * rv_w + 0.25 * rv_m).pow(0.5)
        return harq_forecast.fillna(0.0)


class BipowerJumpProcessor(BaseSignalProcessor):
    """
    EXP-11: Bipower Variation Jump Detection (Barndorff-Nielsen & Shephard 2006).

    Detects non-continuous price shocks by comparing Realized Variance vs Bipower Variation:
    Jump = max(RV_t - BV_t, 0)
    """

    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        price = pd.to_numeric(df["price"] if "price" in df else df["close"], errors="coerce")
        abs_rets = price.pct_change().abs().fillna(0.0)

        rv = abs_rets.pow(2).rolling(window=20).sum()
        # Bipower variation: (pi/2) * sum(|r_i| * |r_{i-1}|)
        bv = (1.57079632679) * (abs_rets * abs_rets.shift(1)).rolling(window=20).sum()

        jump = (rv - bv).clip(lower=0.0).fillna(0.0)
        return jump
