"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import EquityCurveChart, { EquityPoint } from "../components/EquityCurveChart";

interface Signal {
  id: string;
  name: string;
  version: string;
  parameters?: Record<string, any>;
}

interface BacktestResult {
  observations: number;
  initial_capital: number;
  final_equity: number;
  total_return: number;
  annualized_volatility: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  calmar: number;
  win_rate: number;
  turnover: number;
  transaction_cost_bps: number;
  slippage_bps: number;
  execution: string;
  equity_curve: EquityPoint[];
}

export default function ResearchPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalId, setSignalId] = useState("");
  const [symbol, setSymbol] = useState("BTC");
  const [costs, setCosts] = useState("5");
  const [slippage, setSlippage] = useState("0");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [message, setMessage] = useState("Select a signal and run a point-in-time backtest.");
  const [running, setRunning] = useState(false);

  // Save as Experiment modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [expName, setExpName] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [expTags, setExpTags] = useState("momentum, backtest");
  const [saving, setSaving] = useState(false);
  const [savedExpId, setSavedExpId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/signals")
      .then((response) => response.json())
      .then((items: Signal[]) => {
        setSignals(items);
        if (items[0]) {
          setSignalId(items[0].id);
          setExpName(`${items[0].name} - ${symbol} Baseline`);
        }
      })
      .catch(() => setMessage("Signal catalog unavailable."));
  }, [symbol]);

  const selectedSignal = signals.find((s) => s.id === signalId);

  async function runBacktest() {
    if (!signalId) return;
    setRunning(true);
    setResult(null);
    setSavedExpId(null);
    setMessage("Running against stored signal observations and real market candles...");
    try {
      const response = await fetch(
        `http://localhost:8000/api/backtests/${signalId}?symbol=${encodeURIComponent(symbol)}&transaction_cost_bps=${costs}&slippage_bps=${slippage}`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Backtest unavailable");
      setResult(payload.result);
      setSource(payload.market_source);
      setMessage(payload.methodology);
      if (selectedSignal) {
        setExpName(`${selectedSignal.name} (${symbol}) - ${new Date().toISOString().slice(0, 10)}`);
        setExpDescription(`Point-in-time backtest of ${selectedSignal.name} on ${symbol} with ${costs}bps cost & ${slippage}bps slippage.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backtest unavailable.");
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveExperiment(e: React.FormEvent) {
    e.preventDefault();
    if (!result || !expName.trim()) return;
    setSaving(true);
    setSaveError(null);

    const tagsList = expTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch("http://localhost:8000/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: expName.trim(),
          description: expDescription.trim() || null,
          signal_id: signalId,
          symbol: symbol.toUpperCase().trim(),
          transaction_cost_bps: parseFloat(costs) || 0,
          slippage_bps: parseFloat(slippage) || 0,
          tags: tagsList,
          initial_result: result,
          methodology: message,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save experiment");

      setSavedExpId(data.experiment_id);
      setShowSaveModal(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <header>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="card-title">Research Lab / Strategy Execution</p>
            <h1 style={{ fontSize: "24px", marginTop: "4px", fontWeight: "700" }}>
              Reproducible Signal Backtesting
            </h1>
            <p style={{ color: "var(--text-muted)", marginTop: "4px", maxWidth: "760px", fontSize: "13px" }}>
              Deterministic next-bar execution against stored signal observations and real provider candles.
              Every run is point-in-time aligned with explicit trading-cost and slippage deductions.
            </p>
          </div>
          {result && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowSaveModal(true)}
              style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>+</span> Save as Experiment
            </button>
          )}
        </div>

        {savedExpId && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid var(--accent-green)",
              borderRadius: "6px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--accent-green)" }}>
              ✓ Experiment saved successfully with full parameter lineage and run metrics!
            </span>
            <Link
              href="/experiments"
              className="btn btn-secondary"
              style={{ fontSize: "11px", padding: "4px 10px" }}
            >
              View in Experiment Catalog →
            </Link>
          </div>
        )}
      </header>

      {/* Configuration Form */}
      <section className="card">
        <div className="grid-4">
          <label>
            Signal Strategy
            <select
              value={signalId}
              onChange={(event) => setSignalId(event.target.value)}
              style={{ width: "100%", marginTop: "4px" }}
            >
              {signals.map((signal) => (
                <option key={signal.id} value={signal.id}>
                  {signal.name} (v{signal.version})
                </option>
              ))}
            </select>
          </label>
          <label>
            Asset Symbol
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="e.g. BTC, ETH"
              style={{ width: "100%", marginTop: "4px" }}
            />
          </label>
          <label>
            Transaction Cost (bps)
            <input
              type="number"
              min="0"
              step="0.5"
              value={costs}
              onChange={(event) => setCosts(event.target.value)}
              style={{ width: "100%", marginTop: "4px" }}
            />
          </label>
          <label>
            Slippage (bps)
            <input
              type="number"
              min="0"
              step="0.5"
              value={slippage}
              onChange={(event) => setSlippage(event.target.value)}
              style={{ width: "100%", marginTop: "4px" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={runBacktest}
            disabled={running || !signalId}
          >
            {running ? "Running Deterministic Backtest..." : "Run Reproducible Backtest"}
          </button>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{message}</span>
        </div>
      </section>

      {/* Results View */}
      {result && (
        <>
          {/* Equity Curve & Drawdown Chart */}
          <EquityCurveChart
            data={result.equity_curve || []}
            title={`${selectedSignal?.name || "Signal"} on ${symbol} — Cumulative Equity & Drawdown`}
          />

          {/* Institutional Metrics Grid */}
          <div>
            <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600", marginBottom: "8px" }}>
              Institutional Risk & Return Telemetry
            </div>
            <div className="grid-4">
              <div className="card">
                <span className="card-title">Sharpe Ratio</span>
                <strong
                  className="card-value"
                  style={{
                    fontSize: "22px",
                    color: result.sharpe >= 1.0 ? "var(--accent-green)" : result.sharpe >= 0 ? "var(--accent-cyan)" : "var(--accent-red)",
                  }}
                >
                  {result.sharpe.toFixed(3)}
                </strong>
                <span className="card-subtitle">Zero-rate baseline</span>
              </div>

              <div className="card">
                <span className="card-title">Sortino Ratio</span>
                <strong className="card-value" style={{ fontSize: "22px", color: "var(--accent-cyan)" }}>
                  {result.sortino.toFixed(3)}
                </strong>
                <span className="card-subtitle">Downside deviation</span>
              </div>

              <div className="card">
                <span className="card-title">CAGR</span>
                <strong
                  className="card-value"
                  style={{
                    fontSize: "22px",
                    color: result.cagr >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                  }}
                >
                  {(result.cagr * 100).toFixed(2)}%
                </strong>
                <span className="card-subtitle">Annualized growth</span>
              </div>

              <div className="card">
                <span className="card-title">Max Drawdown</span>
                <strong className="card-value" style={{ fontSize: "22px", color: "var(--accent-red)" }}>
                  {(result.max_drawdown * 100).toFixed(2)}%
                </strong>
                <span className="card-subtitle">Peak-to-trough</span>
              </div>

              <div className="card">
                <span className="card-title">Calmar Ratio</span>
                <strong className="card-value" style={{ fontSize: "20px" }}>
                  {result.calmar.toFixed(2)}
                </strong>
                <span className="card-subtitle">CAGR / |Max Drawdown|</span>
              </div>

              <div className="card">
                <span className="card-title">Win Rate</span>
                <strong className="card-value" style={{ fontSize: "20px" }}>
                  {(result.win_rate * 100).toFixed(1)}%
                </strong>
                <span className="card-subtitle">Active bar periods</span>
              </div>

              <div className="card">
                <span className="card-title">Ann. Volatility</span>
                <strong className="card-value" style={{ fontSize: "20px" }}>
                  {(result.annualized_volatility * 100).toFixed(2)}%
                </strong>
                <span className="card-subtitle">252-period root-T</span>
              </div>

              <div className="card">
                <span className="card-title">Total Return</span>
                <strong
                  className="card-value"
                  style={{
                    fontSize: "20px",
                    color: result.total_return >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                  }}
                >
                  {(result.total_return * 100).toFixed(2)}%
                </strong>
                <span className="card-subtitle">Net of costs & slippage</span>
              </div>
            </div>
          </div>

          {/* Execution & Methodology Details */}
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span className="card-title">Execution Model & Assumptions</span>
              <span className="badge badge-cyan font-mono">{source || "Market Feed"}</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.5" }}>
              {message}
            </p>
            <div
              className="font-mono"
              style={{
                marginTop: "12px",
                padding: "10px",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--text-muted)",
                display: "flex",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <span>Observations: <strong style={{ color: "var(--text-primary)" }}>{result.observations} bars</strong></span>
              <span>Turnover: <strong style={{ color: "var(--text-primary)" }}>{result.turnover.toFixed(2)} units</strong></span>
              <span>Transaction Cost: <strong style={{ color: "var(--text-primary)" }}>{result.transaction_cost_bps} bps</strong></span>
              <span>Slippage: <strong style={{ color: "var(--text-primary)" }}>{result.slippage_bps} bps</strong></span>
              <span>Execution: <strong style={{ color: "var(--accent-green)" }}>{result.execution}</strong></span>
            </div>
          </section>
        </>
      )}

      {/* Save as Experiment Modal */}
      {showSaveModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: "500px",
              maxWidth: "90vw",
              backgroundColor: "var(--bg-card)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px" }}>
              Save Backtest as Experiment
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Store this backtest configuration and its results permanently in the Experiment Catalog for reproducible tracking and side-by-side comparison.
            </p>

            {saveError && (
              <div style={{ color: "var(--accent-red)", fontSize: "12px", marginBottom: "12px" }}>
                Error: {saveError}
              </div>
            )}

            <form onSubmit={handleSaveExperiment} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label>
                Experiment Name *
                <input
                  required
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  placeholder="e.g. BTC Momentum Q3"
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </label>

              <label>
                Description
                <textarea
                  rows={3}
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="Research hypothesis and test details..."
                  style={{ width: "100%", marginTop: "4px", resize: "vertical" }}
                />
              </label>

              <label>
                Tags (comma-separated)
                <input
                  value={expTags}
                  onChange={(e) => setExpTags(e.target.value)}
                  placeholder="e.g. momentum, crypto, production"
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSaveModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving Experiment..." : "Confirm & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
