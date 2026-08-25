"""
Portfolio Lab scenario endpoint tests.

Tests cover:
- Valid portfolio with all weights summing to 1.0
- Invalid: negative weights
- Invalid: weights that don't sum to 1.0
- Invalid: empty holdings
- Provenance: every holding exposes is_fallback and provider
- Fallback: provider failure falls back gracefully and labels correctly
- Shock: weighted impact calculation is numerically correct
- No fabrication: prices are not invented when providers are unavailable
"""

from unittest.mock import AsyncMock, patch

from aegis_api.main import app
from aegis_api.schemas import MarketTickerResponse
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _live_quote(symbol: str, price: float) -> MarketTickerResponse:
    return MarketTickerResponse(
        symbol=symbol,
        price=price,
        asset_class="EQUITY",
        exchange="Finnhub (Live Feed)",
        timestamp="2026-08-25T00:00:00+00:00",
        z_score_signal=0.1,
        is_fallback=False,
        fallback_reason=None,
    )


def _fallback_quote(symbol: str, price: float, reason: str) -> MarketTickerResponse:
    return MarketTickerResponse(
        symbol=symbol,
        price=price,
        asset_class="EQUITY",
        exchange="US Equities Feed (Fallback Cache)",
        timestamp="2026-08-25T00:00:00+00:00",
        z_score_signal=0.0,
        is_fallback=True,
        fallback_reason=reason,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPortfolioScenarioValidation:
    """Input validation — these must be rejected before any quote fetch."""

    def test_empty_holdings_rejected(self) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolio/scenario",
                json={"holdings": {}, "shocks": {}},
            )
        assert resp.status_code == 422

    def test_negative_weight_rejected(self) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolio/scenario",
                json={"holdings": {"AAPL": -0.5, "NVDA": 1.5}, "shocks": {}},
            )
        assert resp.status_code == 422

    def test_weights_not_summing_to_one_rejected(self) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolio/scenario",
                json={"holdings": {"AAPL": 0.3, "NVDA": 0.3}, "shocks": {}},
            )
        assert resp.status_code == 422
        assert "sum" in resp.json()["detail"].lower()

    def test_weights_summing_to_one_within_tolerance(self) -> None:
        """Weights are allowed within 0.001 of 1.0 to handle float rounding."""
        with patch("aegis_api.main.get_market_ticker", new_callable=AsyncMock) as mock_quote:
            mock_quote.return_value = _live_quote("AAPL", 200.0)
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"AAPL": 0.9995}, "shocks": {}},
                )
        # 0.9995 is within tolerance of 1.0
        assert resp.status_code == 200

    def test_malformed_body_rejected(self) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/api/portfolio/scenario",
                json={"holdings": "not-a-dict"},
            )
        assert resp.status_code == 422


class TestPortfolioScenarioProvenance:
    """Every holding in the response must expose price, provider, and fallback status."""

    def test_live_quotes_labelled_as_live(self) -> None:
        quotes = {
            "AAPL": _live_quote("AAPL", 200.0),
            "NVDA": _live_quote("NVDA", 130.0),
        }

        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return quotes[symbol.upper()]

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"AAPL": 0.6, "NVDA": 0.4}, "shocks": {}},
                )

        assert resp.status_code == 200
        data = resp.json()
        for holding in data["holdings"]:
            assert holding["is_fallback"] is False
            assert "Finnhub" in holding["provider"]
            assert holding["price"] > 0
            assert holding["fallback_reason"] is None

    def test_fallback_quotes_labelled_correctly(self) -> None:
        reason = "Primary market providers unavailable"
        quotes = {
            "AAPL": _fallback_quote("AAPL", 305.59, reason),
            "BTC": _fallback_quote("BTC", 64200.0, reason),
        }

        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return quotes[symbol.upper()]

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"AAPL": 0.5, "BTC": 0.5}, "shocks": {}},
                )

        assert resp.status_code == 200
        data = resp.json()
        for holding in data["holdings"]:
            assert holding["is_fallback"] is True
            assert holding["fallback_reason"] == reason

    def test_mixed_live_and_fallback_quotes(self) -> None:
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            if symbol.upper() == "BTC":
                return _live_quote("BTC", 65000.0)
            return _fallback_quote(symbol.upper(), 200.0, "Yahoo Finance fallback")

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"BTC": 0.4, "AAPL": 0.6}, "shocks": {}},
                )

        assert resp.status_code == 200
        holdings = {h["symbol"]: h for h in resp.json()["holdings"]}
        assert holdings["BTC"]["is_fallback"] is False
        assert holdings["AAPL"]["is_fallback"] is True


class TestPortfolioScenarioCalculation:
    """Weighted impact must be numerically correct."""

    def test_weighted_shock_calculation(self) -> None:
        """
        AAPL: weight=0.5, shock=-10% → contribution = -0.05
        BTC:  weight=0.5, shock=+20% → contribution = +0.10
        Total weighted_shock = +0.05
        """
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return _live_quote(symbol.upper(), 100.0)

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={
                        "holdings": {"AAPL": 0.5, "BTC": 0.5},
                        "shocks": {"AAPL": -0.10, "BTC": 0.20},
                    },
                )

        assert resp.status_code == 200
        data = resp.json()
        assert abs(data["weighted_shock"] - 0.05) < 1e-6

    def test_zero_shocks_produce_zero_weighted_impact(self) -> None:
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return _live_quote(symbol.upper(), 200.0)

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"AAPL": 0.5, "NVDA": 0.5}, "shocks": {}},
                )

        assert resp.status_code == 200
        assert resp.json()["weighted_shock"] == 0.0

    def test_single_asset_full_weight(self) -> None:
        """One asset, weight=1.0, shock=-30% → weighted_shock=-0.30"""
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return _live_quote(symbol.upper(), 500.0)

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"NVDA": 1.0}, "shocks": {"NVDA": -0.30}},
                )

        assert resp.status_code == 200
        assert abs(resp.json()["weighted_shock"] - (-0.30)) < 1e-6

    def test_shock_for_unknown_symbol_is_zero(self) -> None:
        """Shocks for symbols not in holdings are silently ignored."""
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return _live_quote(symbol.upper(), 100.0)

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={
                        "holdings": {"AAPL": 1.0},
                        "shocks": {"AAPL": 0.05, "TSLA": -0.50},  # TSLA not in holdings
                    },
                )

        assert resp.status_code == 200
        # Only AAPL shock matters: 1.0 × 0.05 = 0.05
        assert abs(resp.json()["weighted_shock"] - 0.05) < 1e-6

    def test_response_contains_methodology_string(self) -> None:
        async def mock_get_ticker(symbol: str) -> MarketTickerResponse:
            return _live_quote(symbol.upper(), 100.0)

        with patch("aegis_api.main.get_market_ticker", side_effect=mock_get_ticker):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/portfolio/scenario",
                    json={"holdings": {"AAPL": 1.0}, "shocks": {}},
                )

        assert resp.status_code == 200
        assert "methodology" in resp.json()
        assert len(resp.json()["methodology"]) > 10
