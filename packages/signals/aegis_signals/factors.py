from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import ClassVar

import pandas as pd


class ApplicabilityStatus(str, Enum):
    VALID = "VALID"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


@dataclass(frozen=True)
class FactorResult:
    name: str
    value: float
    weight: float
    contribution: float
    applicability_status: ApplicabilityStatus = ApplicabilityStatus.VALID


FactorFunction = Callable[[pd.DataFrame, int | None], pd.Series]


def _latest(series: pd.Series) -> float:
    value = series.iloc[-1] if not series.empty else float("nan")
    return float(value) if pd.notna(value) else 0.0


def momentum(frame: pd.DataFrame, periods: int | None = 1) -> pd.Series:
    return pd.to_numeric(frame["price"], errors="coerce").pct_change(periods=periods or 1)


def volatility(frame: pd.DataFrame, window: int | None = 20) -> pd.Series:
    return pd.to_numeric(frame["price"], errors="coerce").pct_change().rolling(window or 20).std()


def volume_surprise(frame: pd.DataFrame, window: int | None = 20) -> pd.Series:
    volume = pd.to_numeric(frame["volume"], errors="coerce")
    baseline = volume.rolling(window or 20).mean()
    scale = volume.rolling(window or 20).std(ddof=0).replace(0, pd.NA)
    return (volume - baseline) / scale


def sma_deviation(frame: pd.DataFrame, window: int | None = 20) -> pd.Series:
    price = pd.to_numeric(frame["price"], errors="coerce")
    average = price.rolling(window or 20).mean()
    return (price - average) / average.replace(0, pd.NA)


def rsi(frame: pd.DataFrame, window: int | None = 14) -> pd.Series:
    delta = pd.to_numeric(frame["price"], errors="coerce").diff()
    gains = delta.clip(lower=0).rolling(window or 14).mean()
    losses = (-delta.clip(upper=0)).rolling(window or 14).mean().replace(0, pd.NA)
    relative_strength = gains / losses
    return 100.0 - (100.0 / (1.0 + relative_strength))


def corroborated_sentiment(frame: pd.DataFrame, _window: int | None = None) -> pd.Series:
    sentiment = pd.to_numeric(
        frame.get(
            "sentiment_polarity", frame.get("sentiment_z", pd.Series(0.0, index=frame.index))
        ),
        errors="coerce",
    ).fillna(0.0)
    corroboration = pd.to_numeric(
        frame.get("corroboration", pd.Series(0.75, index=frame.index)), errors="coerce"
    ).fillna(0.75)
    return sentiment * (corroboration**2)


def csvd_divergence(frame: pd.DataFrame, window: int | None = 20) -> pd.Series:
    w = window or 20
    cwsi = corroborated_sentiment(frame)
    cwsi_mean = cwsi.rolling(w).mean()
    cwsi_std = cwsi.rolling(w).std().replace(0, pd.NA).fillna(0.01)
    z_sentiment = (cwsi - cwsi_mean) / cwsi_std

    price = pd.to_numeric(frame["price"], errors="coerce")
    price_ret = price.pct_change().fillna(0.0)
    ret_mean = price_ret.rolling(w).mean()
    ret_std = price_ret.rolling(w).std().replace(0, pd.NA).fillna(0.0001)
    z_price = (price_ret - ret_mean) / ret_std

    return (z_sentiment - z_price).clip(-4.0, 4.0).fillna(0.0)


class FactorEngine:
    """Deterministic, composable factor calculator with auditable attribution."""

    BUILT_INS: ClassVar[dict[str, FactorFunction]] = {
        "momentum": momentum,
        "volatility": volatility,
        "volume_surprise": volume_surprise,
        "sma_deviation": sma_deviation,
        "rsi": rsi,
        "sentiment_z": lambda frame, _window: pd.to_numeric(frame["sentiment_z"], errors="coerce"),
        "corroborated_sentiment": corroborated_sentiment,
        "csvd_divergence": csvd_divergence,
    }

    def __init__(self, factors: dict[str, float], windows: dict[str, int] | None = None) -> None:
        self.factors = dict(factors)
        self.windows = windows or {}

    def calculate(self, frame: pd.DataFrame) -> tuple[pd.DataFrame, list[FactorResult]]:
        values: dict[str, pd.Series] = {}
        results: list[FactorResult] = []
        for name, weight in self.factors.items():
            function = self.BUILT_INS.get(name)
            if function is None:
                raise ValueError(f"Unknown factor: {name}")
            window = self.windows.get(name)
            values[name] = function(frame, window)
            value = _latest(values[name])
            results.append(FactorResult(name, value, float(weight), value * float(weight)))
        return pd.DataFrame(values, index=frame.index), results

    @staticmethod
    def combine(results: list[FactorResult]) -> float:
        valid_results = [r for r in results if r.applicability_status == ApplicabilityStatus.VALID]
        total_weight = sum(abs(result.weight) for result in valid_results)
        if total_weight == 0:
            return 0.0
        return sum(result.contribution for result in valid_results) / total_weight
