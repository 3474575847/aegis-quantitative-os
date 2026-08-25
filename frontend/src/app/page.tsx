"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

interface SystemStatus {
  status: string;
  uptime_seconds: number;
  counts: {
    signal_definitions: number;
    signal_results: number;
    experiments: number;
    experiment_runs: number;
    events_logged: number;
  };
  services: Array<{
    name: string;
    status: string;
    port?: number;
    mode?: string;
  }>;
  timestamp: string;
}

interface TickerQuote {
  symbol: string;
  price: number;
  asset_class: string;
  exchange: string;
  timestamp: string;
  z_score_signal: number;
  is_fallback: boolean;
  fallback_reason?: string | null;
}

interface SignalItem {
  id: string;
  name: string;
  version: string;
  parameters: Record<string, any>;
  latest_value: number | null;
  latest_timestamp: string | null;
}

interface EventItem {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  correlation_id: string;
  payload: Record<string, any>;
}

export default function CommandCenterPage() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [quotes, setQuotes] = useState<Record<string, TickerQuote>>({});
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const loadDashboardData = async () => {
    try {
      const [statusRes, sigsRes, eventsRes, btcRes, ethRes, nvdaRes, aaplRes] = await Promise.allSettled([
        fetch("http://localhost:8000/api/system/status").then((r) => r.json()),
        fetch("http://localhost:8000/api/signals").then((r) => r.json()),
        fetch("http://localhost:8000/api/events?limit=8").then((r) => r.json()),
        fetch("http://localhost:8000/api/market/ticker/BTC").then((r) => r.json()),
        fetch("http://localhost:8000/api/market/ticker/ETH").then((r) => r.json()),
        fetch("http://localhost:8000/api/market/ticker/NVDA").then((r) => r.json()),
        fetch("http://localhost:8000/api/market/ticker/AAPL").then((r) => r.json()),
      ]);

      if (statusRes.status === "fulfilled") setSystemStatus(statusRes.value);
      if (sigsRes.status === "fulfilled") setSignals(sigsRes.value);
      if (eventsRes.status === "fulfilled") setEvents(eventsRes.value);

      const quoteMap: Record<string, TickerQuote> = {};
      if (btcRes.status === "fulfilled") quoteMap["BTC"] = btcRes.value;
      if (ethRes.status === "fulfilled") quoteMap["ETH"] = ethRes.value;
      if (nvdaRes.status === "fulfilled") quoteMap["NVDA"] = nvdaRes.value;
      if (aaplRes.status === "fulfilled") quoteMap["AAPL"] = aaplRes.value;
      setQuotes(quoteMap);

      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Failed to load command center telemetry", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 15_000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (val: number) => {
    if (val >= 1000) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${val.toFixed(2)}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner / System Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.5px" }}>
              Aegis Command Center
            </h1>
            <span
              className={`badge ${
                systemStatus?.status === "OPERATIONAL" ? "badge-green" : "badge-amber"
              } font-mono`}
              style={{ fontSize: "11px", letterSpacing: "0.5px" }}
            >
              {systemStatus?.status || "CONNECTING..."}
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Real-time financial intelligence telemetry, deterministic factor pipelines, and live market synchronization.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }} className="font-mono">
            {lastRefreshed ? `Refreshed: ${lastRefreshed}` : "Syncing..."}
          </span>
          <button
            className="btn btn-secondary"
            onClick={loadDashboardData}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid-4">
        <div className="card">
          <span className="card-title">Events Logged (Timescale)</span>
          <strong className="card-value" style={{ fontSize: "22px", color: "var(--accent-cyan)" }}>
            {systemStatus?.counts.events_logged?.toLocaleString() || "—"}
          </strong>
          <span className="card-subtitle">Hypertable audit trail</span>
        </div>

        <div className="card">
          <span className="card-title">Factor Observations</span>
          <strong className="card-value" style={{ fontSize: "22px", color: "var(--accent-green)" }}>
            {systemStatus?.counts.signal_results?.toLocaleString() || "—"}
          </strong>
          <span className="card-subtitle">Point-in-time signal results</span>
        </div>

        <div className="card">
          <span className="card-title">Active Experiments</span>
          <strong className="card-value" style={{ fontSize: "22px" }}>
            {systemStatus?.counts.experiments || "—"}
          </strong>
          <span className="card-subtitle">
            {systemStatus?.counts.experiment_runs || 0} executed runs
          </span>
        </div>

        <div className="card">
          <span className="card-title">Engine Latency / Health</span>
          <strong className="card-value" style={{ fontSize: "20px", color: "var(--accent-green)" }}>
            SUB-SECOND
          </strong>
          <span className="card-subtitle">Deterministic pipeline active</span>
        </div>
      </div>

      {/* Section 1: Live Market Watchlist & Freshness Provenance */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" }}>
            Live Market Feeds & Provenance
          </span>
          <Link href="/signals" style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>
            Open Signal Explorer →
          </Link>
        </div>

        <div className="grid-4">
          {["BTC", "ETH", "NVDA", "AAPL"].map((sym) => {
            const q = quotes[sym];
            if (!q) {
              return (
                <div className="card" key={sym}>
                  <span className="card-title">{sym}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>Fetching live feed...</span>
                </div>
              );
            }
            return (
              <div className="card" key={sym}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="card-title">{q.symbol}</span>
                  <span
                    className={`badge ${q.is_fallback ? "badge-amber" : "badge-green"} font-mono`}
                    style={{ fontSize: "9px" }}
                  >
                    {q.is_fallback ? "FALLBACK" : "LIVE FEED"}
                  </span>
                </div>
                <strong className="card-value" style={{ fontSize: "20px", marginTop: "4px" }}>
                  {formatPrice(q.price)}
                </strong>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Z-Score:</span>
                  <span
                    className="font-mono"
                    style={{
                      color: q.z_score_signal > 0 ? "var(--accent-green)" : q.z_score_signal < 0 ? "var(--accent-red)" : "inherit",
                    }}
                  >
                    {q.z_score_signal >= 0 ? `+${q.z_score_signal.toFixed(3)}` : q.z_score_signal.toFixed(3)}
                  </span>
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }} className="font-mono">
                  {q.exchange}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Active Factor Signals & Pipeline State */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px" }}>
        {/* Active Factor Models */}
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: "600", fontSize: "13px" }}>Active Factor Signals</span>
            <Link href="/research" style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>
              Test in Research Lab →
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Factor Name</th>
                <th>Version</th>
                <th>Latest Value</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "20px" }}>Loading signals...</td>
                </tr>
              ) : (
                signals.map((sig) => (
                  <tr key={sig.id}>
                    <td>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{sig.name}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        {Object.entries(sig.parameters || {})
                          .map(([k, v]) => `${k}:${v}`)
                          .join(" • ")}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-cyan font-mono" style={{ fontSize: "10px" }}>
                        v{sig.version}
                      </span>
                    </td>
                    <td>
                      <span
                        className="font-mono"
                        style={{
                          fontWeight: "700",
                          color:
                            sig.latest_value !== null && sig.latest_value > 0
                              ? "var(--accent-green)"
                              : sig.latest_value !== null && sig.latest_value < 0
                              ? "var(--accent-red)"
                              : "inherit",
                        }}
                      >
                        {sig.latest_value !== null ? (sig.latest_value >= 0 ? `+${sig.latest_value.toFixed(4)}` : sig.latest_value.toFixed(4)) : "Pending"}
                      </span>
                    </td>
                    <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {sig.latest_timestamp
                        ? new Date(sig.latest_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* System Services & Ingestion Workers */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-title">Infrastructure Status</span>
            <Link href="/health" style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>
              Detailed Health →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
            {systemStatus?.services.map((srv) => (
              <div
                key={srv.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  backgroundColor: "var(--bg-secondary)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <strong style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>
                    {srv.name.replace(/_/g, " ")}
                  </strong>
                  {srv.port && (
                    <span className="font-mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      Port {srv.port} {srv.mode ? `• ${srv.mode}` : ""}
                    </span>
                  )}
                </div>
                <span
                  className={`badge ${
                    srv.status === "UP" || srv.status === "STREAMING" || srv.status === "DETERMINISTIC"
                      ? "badge-green"
                      : srv.status === "DEGRADED"
                      ? "badge-amber"
                      : "badge-red"
                  } font-mono`}
                  style={{ fontSize: "10px" }}
                >
                  {srv.status}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              padding: "10px",
              backgroundColor: "rgba(6, 182, 212, 0.05)",
              border: "1px solid var(--accent-cyan)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--text-secondary)",
            }}
          >
            <strong>Research Protocol:</strong> Point-in-time guarantees enforce that signals computed at bar <em>t</em> execute strictly at <em>t+1</em> close without lookahead bias.
          </div>
        </div>
      </div>

      {/* Section 3: Live Event Log Stream */}
      <div className="table-container">
        <div className="table-header">
          <span style={{ fontWeight: "600", fontSize: "13px" }}>Recent Event Stream (Audit Ledger)</span>
          <Link href="/timeline" style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>
            Full Event Timeline →
          </Link>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Source Sensor</th>
              <th>Correlation ID</th>
              <th>Timestamp</th>
              <th>Payload Summary</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "20px" }}>No events received yet.</td>
              </tr>
            ) : (
              events.map((evt) => (
                <tr key={evt.event_id}>
                  <td>
                    <span
                      className={`badge ${
                        evt.event_type.includes("Completed")
                          ? "badge-green"
                          : evt.event_type.includes("Triggered")
                          ? "badge-cyan"
                          : "badge-amber"
                      } font-mono`}
                      style={{ fontSize: "10px" }}
                    >
                      {evt.event_type}
                    </span>
                  </td>
                  <td style={{ fontSize: "11px", fontWeight: "600" }}>{evt.source}</td>
                  <td>
                    <span className="font-mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {evt.correlation_id ? evt.correlation_id.slice(0, 8) + "..." : "—"}
                    </span>
                  </td>
                  <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td style={{ fontSize: "11px", color: "var(--text-secondary)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {JSON.stringify(evt.payload)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
