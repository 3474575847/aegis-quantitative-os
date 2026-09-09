from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class NewsMomentumConfig:
    positive_sentiment_z: float = 0.5
    negative_sentiment_z: float = -0.5
    min_momentum: float = 0.0
    sentiment_weight: float = 0.6
    technical_weight: float = 0.4
    factor_weights: dict[str, float] | None = None


class NewsMomentumStrategy:
    """PIT-safe news momentum strategy shared by live views and backtests."""

    def __init__(self, config: NewsMomentumConfig | None = None) -> None:
        self.config = config or NewsMomentumConfig()

    def evaluate(
        self,
        sentiment_z: float,
        momentum: float,
        article_ids: list[str] | None = None,
        rationale_context: str | None = None,
        factor_values: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        sentiment_direction = (
            sentiment_z >= self.config.positive_sentiment_z if pd.notna(sentiment_z) else False
        )
        negative_direction = (
            sentiment_z <= self.config.negative_sentiment_z if pd.notna(sentiment_z) else False
        )
        positive_momentum = momentum > self.config.min_momentum
        negative_momentum = momentum < -self.config.min_momentum

        if sentiment_direction and positive_momentum:
            action = "BUY"
        elif negative_direction and negative_momentum:
            action = "SELL"
        else:
            action = "HOLD"

        sentiment_contribution = float(sentiment_z) if pd.notna(sentiment_z) else 0.0
        technical_contribution = float(momentum) if pd.notna(momentum) else 0.0
        score = (
            self.config.sentiment_weight * sentiment_contribution
            + self.config.technical_weight * technical_contribution
        )
        confidence = min(
            1.0,
            abs(self.config.sentiment_weight * sentiment_contribution)
            + abs(self.config.technical_weight * technical_contribution),
        )
        rationale = (
            f"{rationale_context + '; ' if rationale_context else ''}"
            f"sentiment z={sentiment_contribution:.4g}, "
            f"prior momentum={technical_contribution:.4g}"
        )
        factors = factor_values or {
            "sentiment_z": sentiment_contribution,
            "momentum": technical_contribution,
        }
        weights = self.config.factor_weights or {
            "sentiment_z": self.config.sentiment_weight,
            "momentum": self.config.technical_weight,
        }
        factor_results = [
            {
                "name": name,
                "value": value,
                "weight": weights.get(name, 0.0),
                "contribution": value * weights.get(name, 0.0),
            }
            for name, value in factors.items()
        ]
        return {
            "action": action,
            "score": float(score),
            "confidence": float(confidence),
            "sentiment_contribution": sentiment_contribution,
            "technical_contribution": technical_contribution,
            "rationale": rationale,
            "source_article_ids": article_ids or [],
            "factor_values": factors,
            "factor_weights": weights,
            "factor_contributions": factor_results,
            "contributing_factors": [item["name"] for item in factor_results if item["value"] != 0],
        }

    def compute(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Evaluate rows containing PIT sentiment and prior-bar momentum."""
        required_columns = {"sentiment_z", "momentum"}
        missing_columns = required_columns.difference(frame.columns)
        if missing_columns:
            raise ValueError(f"Missing strategy columns: {sorted(missing_columns)}")

        evaluations = [
            self.evaluate(
                row["sentiment_z"],
                row["momentum"],
                row.get("article_ids", []),
                row.get("rationale_context"),
                {
                    name: float(row[name])
                    for name in row.index
                    if name in (self.config.factor_weights or {})
                },
            )
            for _, row in frame.iterrows()
        ]
        return pd.concat([frame.reset_index(drop=True), pd.DataFrame(evaluations)], axis=1)
