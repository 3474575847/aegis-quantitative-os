from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import ClassVar

import pandas as pd


@dataclass(frozen=True)
class FactorResult:
    name: str
    value: float
    weight: float
    contribution: float


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


class FactorEngine:
    """Deterministic, composable factor calculator with auditable attribution."""

    BUILT_INS: ClassVar[dict[str, FactorFunction]] = {
        "momentum": momentum,
        "volatility": volatility,
        "volume_surprise": volume_surprise,
        "sma_deviation": sma_deviation,
        "rsi": rsi,
        "sentiment_z": lambda frame, _window: pd.to_numeric(frame["sentiment_z"], errors="coerce"),
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
        total_weight = sum(abs(result.weight) for result in results)
        if total_weight == 0:
            return 0.0
        return sum(result.contribution for result in results) / total_weight
