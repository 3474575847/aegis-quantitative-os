"""
Tests for GET /api/market/ticker/{symbol}/history — equity candle fallback path.

Verifies:
  - Finnhub 403 → Yahoo Finance fallback → OHLCV data returned (no 502)
  - Finnhub s='no_data' → Yahoo Finance fallback → OHLCV data returned (no 502)
  - Both providers fail → empty datapoints, is_fallback=True, no 502
  - Finnhub success → data returned, is_fallback=False
  - Fallback provenance: is_fallback, fallback_reason, source all set correctly
  - Crypto path (BTC) unaffected — still uses Coinbase directly

All tests mock httpx so no live network calls are made.
"""

import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from aegis_api.main import app
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Mock response builders
# ---------------------------------------------------------------------------


def _mock_response(status_code: int, json_data: Any = None) -> MagicMock:
    m = MagicMock()
    m.status_code = status_code
    m.json = MagicMock(return_value=json_data or {})
    return m


def _finnhub_ok() -> dict[str, Any]:
    """Minimal valid Finnhub candle payload."""
    now = int(time.time())
    return {
        "s": "ok",
        "t": [now - 300, now],
        "o": [150.0, 151.0],
        "h": [152.0, 153.0],
        "l": [149.0, 150.0],
        "c": [151.5, 152.5],
        "v": [1_000_000, 1_200_000],
    }


def _finnhub_no_data() -> dict[str, Any]:
    return {"s": "no_data"}


def _yahoo_ok() -> dict[str, Any]:
    """Minimal valid Yahoo Finance v8 chart response."""
    now = int(time.time())
    return {
        "chart": {
            "result": [
                {
                    "timestamp": [now - 300, now],
                    "indicators": {
                        "quote": [
                            {
                                "open": [148.0, 149.0],
                                "high": [150.0, 151.0],
                                "low": [147.0, 148.0],
                                "close": [149.5, 150.5],
                                "volume": [800_000, 900_000],
                            }
                        ]
                    },
                    "meta": {"regularMarketPrice": 150.5, "exchangeName": "NASDAQ"},
                }
            ],
            "error": None,
        }
    }


def _yahoo_empty() -> dict[str, Any]:
    return {"chart": {"result": [], "error": None}}


def _coinbase_ok() -> list[Any]:
    now = int(time.time())
    # [timestamp, low, high, open, close, volume]
    return [
        [now - 300, 59000.0, 61000.0, 59500.0, 60500.0, 10.5],
        [now, 60000.0, 62000.0, 60500.0, 61500.0, 12.3],
    ]


# ---------------------------------------------------------------------------
# Helper: single httpx mock that returns different values per URL
# ---------------------------------------------------------------------------


def _make_get_mock(**url_responses: Any) -> AsyncMock:
    """
    Return an AsyncMock for httpx.AsyncClient.get that dispatches based on
    whether any key string appears in the URL.
    """

    async def _get(url: str, **_kwargs: Any) -> Any:
        for key, response in url_responses.items():
            if key in url:
                return response
        return _mock_response(404)

    return AsyncMock(side_effect=_get)


# ---------------------------------------------------------------------------
# Equity: Finnhub → Yahoo fallback path
# ---------------------------------------------------------------------------


class TestEquityCandleFallback:
    def test_finnhub_403_falls_back_to_yahoo(self) -> None:
        """Finnhub returns 403 → Yahoo returns data → 200 with candles, not 502."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(403),
            yahoo=_mock_response(200, _yahoo_ok()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/AAPL/history")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["datapoints"]) == 2
        assert data["is_fallback"] is True
        assert data["fallback_reason"] is not None
        assert "Yahoo" in data["fallback_reason"]
        assert data["source"] == "Yahoo Finance candles (fallback)"

    def test_finnhub_no_data_falls_back_to_yahoo(self) -> None:
        """Finnhub returns s='no_data' → Yahoo returns data → 200 with candles."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(200, _finnhub_no_data()),
            yahoo=_mock_response(200, _yahoo_ok()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/NVDA/history")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["datapoints"]) == 2
        assert data["is_fallback"] is True
        assert "Yahoo" in data["fallback_reason"]

    def test_both_providers_fail_returns_empty_not_502(self) -> None:
        """Both Finnhub and Yahoo fail → 200 with empty datapoints, never 502."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(403),
            yahoo=_mock_response(500, {}),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/TSLA/history")

        # Must NOT return 502 — graceful degradation
        assert resp.status_code == 200
        data = resp.json()
        assert data["datapoints"] == []
        assert data["is_fallback"] is True
        assert data["fallback_reason"] is not None
        assert data["current_price"] is None

    def test_yahoo_empty_result_returns_empty_not_502(self) -> None:
        """Yahoo returns 200 but empty result list → empty datapoints, no 502."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(403),
            yahoo=_mock_response(200, _yahoo_empty()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/MSFT/history")

        assert resp.status_code == 200
        data = resp.json()
        assert data["datapoints"] == []
        assert data["is_fallback"] is True

    def test_no_finnhub_key_still_falls_back_to_yahoo(self) -> None:
        """When FINNHUB_API_KEY is unset, skip Finnhub and go straight to Yahoo."""
        import os

        get_mock = _make_get_mock(
            yahoo=_mock_response(200, _yahoo_ok()),
        )
        orig = os.environ.pop("FINNHUB_API_KEY", None)
        try:
            with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
                resp = client.get("/api/market/ticker/AAPL/history")
        finally:
            if orig is not None:
                os.environ["FINNHUB_API_KEY"] = orig

        assert resp.status_code == 200
        data = resp.json()
        assert data["is_fallback"] is True
        assert len(data["datapoints"]) == 2

    def test_finnhub_success_is_not_fallback(self) -> None:
        """When Finnhub returns valid candles, is_fallback must be False."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(200, _finnhub_ok()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/AAPL/history")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["datapoints"]) == 2
        assert data["is_fallback"] is False
        assert data["fallback_reason"] is None
        assert data["source"] == "Finnhub candles"

    def test_datapoint_shape_from_yahoo_fallback(self) -> None:
        """Every candle returned by the Yahoo fallback must have required OHLCV fields."""
        get_mock = _make_get_mock(
            finnhub=_mock_response(403),
            yahoo=_mock_response(200, _yahoo_ok()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/AAPL/history")

        assert resp.status_code == 200
        for dp in resp.json()["datapoints"]:
            assert "timestamp" in dp
            assert "time" in dp
            assert "open" in dp
            assert "high" in dp
            assert "low" in dp
            assert "close" in dp
            assert "price" in dp
            assert "volume" in dp
            assert "sentimentZ" in dp
            # Basic OHLCV sanity
            assert dp["high"] >= dp["low"]
            assert dp["close"] > 0

    def test_yahoo_none_gaps_are_skipped(self) -> None:
        """Yahoo returns None for extended-hours gaps — those candles must be dropped."""
        yahoo_with_gap = {
            "chart": {
                "result": [
                    {
                        "timestamp": [1000, 2000, 3000],
                        "indicators": {
                            "quote": [
                                {
                                    "open": [100.0, None, 102.0],  # gap at index 1
                                    "high": [101.0, None, 103.0],
                                    "low": [99.0, None, 101.0],
                                    "close": [100.5, None, 102.5],
                                    "volume": [500_000, None, 600_000],
                                }
                            ]
                        },
                    }
                ],
            }
        }
        get_mock = _make_get_mock(
            finnhub=_mock_response(403),
            yahoo=_mock_response(200, yahoo_with_gap),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/AAPL/history")

        assert resp.status_code == 200
        # Only 2 valid candles — the None gap is dropped
        assert len(resp.json()["datapoints"]) == 2


# ---------------------------------------------------------------------------
# Crypto path: Coinbase — must be unaffected by equity changes
# ---------------------------------------------------------------------------


class TestCryptoCandleUnaffected:
    def test_btc_still_uses_coinbase(self) -> None:
        """BTC history must use Coinbase and not be affected by equity fallback logic."""
        get_mock = _make_get_mock(
            coinbase=_mock_response(200, _coinbase_ok()),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/BTC/history")

        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "Coinbase candles"
        assert data["is_fallback"] is False
        assert len(data["datapoints"]) == 2

    def test_coinbase_failure_still_returns_502_for_crypto(self) -> None:
        """Crypto has no fallback — Coinbase failure should still raise 502."""
        get_mock = _make_get_mock(
            coinbase=_mock_response(503),
        )
        with patch("httpx.AsyncClient.get", get_mock), TestClient(app) as client:
            resp = client.get("/api/market/ticker/BTC/history")

        assert resp.status_code == 502
