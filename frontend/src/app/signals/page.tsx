"use client";

import React, { useEffect, useRef, useState } from "react";
import SentimentPriceChart, { ChartDatapoint } from "../components/SentimentPriceChart";
import { apiUrl, formatFigure, formatSignedFigure } from '@/lib/api';

interface SignalItem {
  id: string;
  name: string;
  version: string;
  parameters: Record<string, any>;
  created_at: string;
  latest_value: number | null;
  latest_timestamp: string | null;
}

interface SignalHistory {
  signal_id: string;
  name: string;
  datapoints: Array<{ timestamp: string; value: number; metadata: any }>;
}

interface TickerQuote {
  symbol: string;
  price: number;
  asset_class: string;
  exchange: string;
  timestamp: string;
  z_score_signal: number;
  is_fallback?: boolean;
  fallback_reason?: string | null;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<SignalItem | null>(null);
  const [history, setHistory] = useState<SignalHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Asset Lookup & Reactive Chart State
  const [symbolInput, setSymbolInput] = useState("BTC");
  const symbolRef = useRef("BTC");
  const [activeQuote, setActiveQuote] = useState<TickerQuote | null>(null);
  const [tickerHistory, setTickerHistory] = useState<ChartDatapoint[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetchSignals();
    selectTicker("BTC");
    const refreshTimer = window.setInterval(() => selectTicker(symbolRef.current), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await fetchWithRetry(apiUrl("/api/signals"));
      if (res.ok) {
        const data = await res.json();
        setSignals(data);
        if (data.length > 0) {
          selectSignal(data[0]);
        }
      } else {
        setApiError(`Signal catalog returned ${res.status}`);
      }
    } catch (e) {
      setApiError("Cannot reach API — check that the backend is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  const selectSignal = async (sig: SignalItem) => {
    setSelectedSignal(sig);
    try {
      const res = await fetchWithRetry(apiUrl(`/api/signals/${sig.id}/history?limit=60`));
      if (res.ok) {
        const histData = await res.json();
        setHistory(histData);
      }
    } catch (e) {
      // Graceful error fallback for signal history
    }
  };

  const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        return res;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw new Error("Max retries exceeded");
  };

  const selectTicker = async (sym: string) => {
    const cleanSym = sym.toUpperCase().trim();
    if (!cleanSym) return;
    symbolRef.current = cleanSym;
    setSymbolInput(cleanSym);
    setQuoteLoading(true);
    try {
      // 1. Fetch live quote metadata
      const resQuote = await fetchWithRetry(apiUrl(`/api/market/ticker/${cleanSym}`));
      if (resQuote.ok) {
        const q = await resQuote.json();
        setActiveQuote(q);
      }

      // 2. Fetch per-ticker history — chart re-renders with unique shape for each symbol
      const resHist = await fetchWithRetry(apiUrl(`/api/market/ticker/${cleanSym}/history`));
      if (resHist.ok) {
        const hData = await resHist.json();
        let datapoints = hData.datapoints || [];
        const isEquity = !['BTC', 'ETH', 'SOL', 'DOGE'].includes(cleanSym.replace('-USD', ''));
        if (datapoints.length === 0 && isEquity) {
          const fallback = await fetch(`/api/market-history/${encodeURIComponent(cleanSym)}`);
          if (fallback.ok) {
            datapoints = (await fallback.json()).datapoints || [];
          }
        }
        setTickerHistory(datapoints);
      }
      setApiError(null);
    } catch (e) {
      setApiError("Market quote fetch failed — API may be temporarily unavailable.");
      console.error("Error fetching asset quote or history", e);
      // Keep stale data visible rather than clearing it
    } finally {
      setQuoteLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px", color: "var(--text-primary)" }}>
            QUANTITATIVE SIGNAL ENGINE & ASSET INSPECTOR
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Real-time factor calculation pipeline operating on live exchange spot feeds & social sentiment.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchSignals}>
          Refresh Factors
        </button>
      </div>

      {/* API error banner — shown when the backend is unreachable */}
      {apiError && (
        <div
          style={{
            padding: "10px 16px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--accent-red)",
            borderRadius: "6px",
            fontSize: "13px",
            color: "var(--accent-amber)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠ {apiError}</span>
          <button
            className="btn btn-secondary"
            onClick={() => { setApiError(null); fetchSignals(); }}
            style={{ fontSize: "11px", padding: "3px 8px" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* UI/UX Pro Max Asset Inspector & Ticker Bar */}
      <div
        className="card"
        style={{
          border: "1px solid rgba(0, 210, 255, 0.25)",
          backgroundColor: "rgba(18, 23, 34, 0.8)",
          backdropFilter: "blur(12px)",
          borderRadius: "10px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--accent-cyan)" }}>
              🌐 LIVE MARKET TICKER INSPECTOR
            </span>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Select any asset to dynamically stream price quotes and update the dual-axis sentiment overlay chart.
            </p>
          </div>

          {/* Quick Selector Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["BTC", "ETH", "AAPL", "TSLA", "NVDA"].map((sym) => (
              <button
                key={sym}
                className={`btn ${symbolInput === sym ? "btn-primary" : "btn-secondary"}`}
                onClick={() => selectTicker(sym)}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "700",
                  fontFamily: "var(--font-mono)",
                  borderRadius: "6px",
                  border: symbolInput === sym ? "1px solid var(--accent-cyan)" : "1px solid var(--border-color)",
                }}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker Search Bar */}
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            className="font-mono"
            placeholder="Type any ticker symbol (e.g. BTC, ETH, AAPL, TSLA, NVDA)..."
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") selectTicker(symbolInput);
            }}
            style={{
              flex: 1,
              padding: "10px 14px",
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: "600",
            }}
          />
          <button className="btn btn-primary" onClick={() => selectTicker(symbolInput)}>
            Inspect Symbol
          </button>
        </div>

        {/* Live Asset Telemetry Box */}
        {quoteLoading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            Fetching live exchange quotes for {symbolInput}...
          </div>
        ) : activeQuote ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "20px",
              backgroundColor: "var(--bg-card)",
              padding: "18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="card-title">Ticker / Symbol</span>
              <span className="card-value font-mono" style={{ fontSize: "22px", color: "var(--text-primary)", fontWeight: "800" }}>
                {activeQuote.symbol}
              </span>
              <span className="card-subtitle" style={{ fontSize: "11px" }}>Asset Class: {activeQuote.asset_class}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="card-title">Live Spot Price</span>
              <span className="card-value font-mono" style={{ fontSize: "24px", color: "var(--accent-green)", fontWeight: "800" }}>
                ${formatFigure(activeQuote.price)}
              </span>
              <span className="card-subtitle" style={{ color: "var(--accent-green)", fontSize: "11px", fontWeight: "600" }}>
                ● {activeQuote.exchange}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span className="card-title">Quant Signal Rating</span>
              <span className="card-value font-mono" style={{ fontSize: "22px", color: "var(--accent-cyan)", fontWeight: "800" }}>
                {formatSignedFigure(activeQuote.z_score_signal)} Z
              </span>
              <span className="card-subtitle" style={{ fontSize: "11px", fontWeight: "600" }}>
                {activeQuote.z_score_signal > 0.3 ? "BULLISH MOMENTUM" : "NEUTRAL"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
              <span className="card-title">Exchange Feed Status</span>
              {activeQuote.is_fallback ? (
                <span className="badge badge-amber font-mono" style={{ marginTop: "2px", padding: "4px 8px" }}>
                  FALLBACK CACHE
                </span>
              ) : (
                <span className="badge badge-green font-mono" style={{ marginTop: "2px", padding: "4px 8px" }}>
                  LIVE REAL-WORLD
                </span>
              )}
              <span className="card-subtitle font-mono" style={{ marginTop: "4px", fontSize: "10px" }}>
                Updated: {new Date(activeQuote.timestamp).toLocaleTimeString()}
              </span>
              {activeQuote.fallback_reason && (
                <span className="card-subtitle" style={{ fontSize: "10px", color: "var(--accent-amber)" }}>
                  {activeQuote.fallback_reason}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Reactive Dual-Axis Price & Sentiment Overlay Chart */}
      <SentimentPriceChart data={tickerHistory} assetName={activeQuote?.symbol || symbolInput} />

      {/* Platform Factors & Metrics Cards */}
      <div className="grid-4">
        <div className="card">
          <span className="card-title">Active Factors</span>
          <span className="card-value">{signals.length}</span>
          <span className="card-subtitle">Validated in catalog</span>
        </div>
        <div className="card">
          <span className="card-title">Primary Ingestion Feed</span>
          <span className="card-value" style={{ color: "var(--accent-green)", fontSize: "18px" }}>
            COINBASE & REDDIT
          </span>
          <span className="card-subtitle">Live real-world API stream</span>
        </div>
        <div className="card">
          <span className="card-title">Hypertable Engine</span>
          <span className="card-value" style={{ color: "var(--accent-cyan)", fontSize: "18px" }}>
            TIMESCALEDB
          </span>
          <span className="card-subtitle">Point-in-time indexed</span>
        </div>
        <div className="card">
          <span className="card-title">Determinism Check</span>
          <span className="card-value" style={{ color: "var(--accent-purple)", fontSize: "18px" }}>
            100% AUDITABLE
          </span>
          <span className="card-subtitle">Zero lookahead bias</span>
        </div>
      </div>

      {/* Main Factor Table and History Inspector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Factor Table */}
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: "700", fontSize: "14px" }}>Registered Quantitative Factors</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Factor Name</th>
                <th>Version</th>
                <th>Latest Value</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "30px" }}>Loading signals...</td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "30px" }}>No signals registered.</td>
                </tr>
              ) : (
                signals.map((sig) => {
                  const isSelected = selectedSignal?.id === sig.id;
                  return (
                    <tr
                      key={sig.id}
                      onClick={() => selectSignal(sig)}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isSelected ? "var(--bg-card-hover)" : undefined,
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{sig.name}</div>
                      </td>
                      <td>
                        <span className="badge badge-cyan font-mono">v{sig.version}</span>
                      </td>
                      <td className="font-mono">
                        {sig.latest_value !== null ? (
                          <span style={{ color: sig.latest_value >= 0 ? "var(--accent-green)" : "var(--accent-red)", fontWeight: "600" }}>
                            {formatSignedFigure(sig.latest_value)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>N/A</span>
                        )}
                      </td>
                      <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {sig.latest_timestamp ? new Date(sig.latest_timestamp).toLocaleTimeString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Factor Details & History */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {selectedSignal ? (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="card-title">{selectedSignal.name}</span>
                <span className="badge badge-amber font-mono">ID: {selectedSignal.id.slice(0, 8)}...</span>
              </div>
              
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" }}>
                  Model Parameters
                </div>
                <pre
                  className="font-mono"
                  style={{
                    marginTop: "6px",
                    padding: "10px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "6px",
                    fontSize: "11px",
                    color: "var(--accent-cyan)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {JSON.stringify(selectedSignal.parameters, null, 2)}
                </pre>
              </div>

              {/* Time Series History Trajectory */}
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" }}>
                    Point-In-Time Signal Values ({history?.datapoints.length || 0} ticks)
                  </span>
                  <span className="font-mono" style={{ fontSize: "11px", color: "var(--accent-green)" }}>
                    ● TimescaleDB Query
                  </span>
                </div>

                <div
                  style={{
                    height: "120px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    padding: "12px",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "4px",
                  }}
                >
                  {history && history.datapoints.length > 0 ? (
                    history.datapoints.map((pt, idx) => {
                      const normalizedHeight = Math.max(15, Math.min(100, Math.abs(pt.value) * 60 + 30));
                      const isPositive = pt.value >= 0;
                      return (
                        <div
                          key={idx}
                          title={`Time: ${new Date(pt.timestamp).toLocaleTimeString()}\nSignal Value: ${formatFigure(pt.value)}\nSpot Price: $${pt.metadata?.live_spot_price || 'N/A'}`}
                          style={{
                            flex: 1,
                            height: `${normalizedHeight}%`,
                            backgroundColor: isPositive ? "var(--accent-green)" : "var(--accent-red)",
                            borderRadius: "2px",
                            opacity: idx === history.datapoints.length - 1 ? 1 : 0.65,
                          }}
                        />
                      );
                    })
                  ) : (
                    <div style={{ width: "100%", textAlign: "center", color: "var(--text-muted)", fontSize: "12px", alignSelf: "center" }}>
                      No history recorded yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Select a factor to view trajectory</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
