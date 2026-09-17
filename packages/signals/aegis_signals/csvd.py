from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from aegis_signals.engine import BaseSignalProcessor


@dataclass(frozen=True)
class CSVDConfig:
    half_life_hours: float = 48.0
    velocity_fast_span: int = 6
    velocity_slow_span: int = 24
    divergence_window: int = 20
    divergence_threshold: float = 1.5
    min_corroboration: float = 0.70


class CSVDProcessor(BaseSignalProcessor):
    """
    Aegis Corroborated Sentiment & Velocity Divergence (C-SVD v1) Processor.

    Computes Point-in-Time Corroboration-Weighted Sentiment (CWSI), Sentiment Acceleration
    & Velocity (SAV), and News-Price Divergence Oscillator (NPDO).
    """

    def __init__(self, config: CSVDConfig | None = None) -> None:
        self.config = config or CSVDConfig()

    def compute(self, df: pd.DataFrame, params: dict[str, Any]) -> pd.Series:
        """
        Compute C-SVD NPDO series from dataframe containing price and canonical sentiment fields.
        Expected columns: 'price', 'sentiment_polarity' (or 'score'), optional 'corroboration', 'publisher_count'.
        """
        if df.empty or "price" not in df.columns:
            return pd.Series(dtype=float)

        price = pd.to_numeric(df["price"], errors="coerce")
        sentiment = pd.to_numeric(
            df.get("sentiment_polarity", df.get("score", pd.Series(0.0, index=df.index))),
            errors="coerce",
        ).fillna(0.0)

        corroboration = pd.to_numeric(
            df.get("corroboration", pd.Series(0.75, index=df.index)), errors="coerce"
        ).fillna(0.75)

        pub_count = pd.to_numeric(
            df.get("publisher_count", pd.Series(2, index=df.index)), errors="coerce"
        ).fillna(2)

        # 1. Corroborated Sentiment Index (CWSI): bounded sentiment scaled by corroboration
        cwsi = (sentiment * corroboration).clip(-1.0, 1.0)

        # 2. Sentiment Velocity: Fast EMA - Slow EMA
        fast_span = int(params.get("velocity_fast_span", self.config.velocity_fast_span))
        slow_span = int(params.get("velocity_slow_span", self.config.velocity_slow_span))
        ema_fast = cwsi.ewm(span=fast_span, adjust=False).mean()
        ema_slow = cwsi.ewm(span=slow_span, adjust=False).mean()

        window = max(2, int(params.get("divergence_window", self.config.divergence_window)))
        cwsi_std = cwsi.rolling(window=window, min_periods=1).std().fillna(0.01).replace(0, 0.01)
        sav = (ema_fast - ema_slow) / cwsi_std

        # 3. Price Return & Z-score
        price_ret = price.pct_change().fillna(0.0)
        ret_mean = price_ret.rolling(window=window, min_periods=1).mean().fillna(0.0)
        ret_std = (
            price_ret.rolling(window=window, min_periods=1).std().fillna(0.0001).replace(0, 0.0001)
        )
        z_price = (price_ret - ret_mean) / ret_std

        # 4. Sentiment Z-score
        cwsi_mean = cwsi.rolling(window=window, min_periods=1).mean().fillna(0.0)
        z_sentiment = (cwsi - cwsi_mean) / cwsi_std

        # 5. News-Price Divergence Oscillator (NPDO)
        npdo = z_sentiment - z_price
        threshold = float(params.get("divergence_threshold", self.config.divergence_threshold))

        # Signal output: mapped into actionable range or raw npdo z-score
        if params.get("raw_npdo", False):
            return npdo.fillna(0.0)

        # Truncate and bound
        return npdo.clip(-4.0, 4.0).fillna(0.0)
