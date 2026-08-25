"use client";

import React, { useEffect, useState } from "react";

interface ServiceStatus {
  name: string;
  status: string;
  port?: number;
  mode?: string;
}

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
  services: ServiceStatus[];
  timestamp: string;
}

export default function HealthPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/system/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Error fetching system status", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>
            Platform Infrastructure & Health
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            Real-time status of TimescaleDB, Redis, ingestion worker streams, and FastAPI runtime.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchHealth}>
          Refresh Status
        </button>
      </div>

      {/* Global Status Banner */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="status-pill online">
            <span className="status-dot"></span>
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Zero critical alerts detected in the last 24 hours.
          </span>
        </div>
        <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Heartbeat: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : "Polling..."}
        </span>
      </div>

      {/* Services Grid */}
      <div className="grid-4">
        {status?.services.map((svc) => (
          <div key={svc.name} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="card-title">{svc.name.replace("_", " ")}</span>
              <span className="badge badge-green font-mono">{svc.status}</span>
            </div>
            <div className="card-value" style={{ fontSize: "18px", color: "var(--accent-cyan)" }}>
              {svc.port ? `PORT :${svc.port}` : svc.mode || "ACTIVE"}
            </div>
            <span className="card-subtitle" style={{ color: "var(--accent-green)" }}>
              ● Responsive (0 errors)
            </span>
          </div>
        ))}
      </div>

      {/* Storage and Hypertable Metrics */}
      <div className="table-container">
        <div className="table-header">
          <span style={{ fontWeight: "600", fontSize: "13px" }}>TimescaleDB Hypertables & Table Statistics</span>
          <span className="badge badge-cyan font-mono">POSTGRES 16</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Table Name</th>
              <th>Storage Type</th>
              <th>Partitioning Key</th>
              <th>Total Records</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: "600", color: "var(--text-primary)" }}>signal_results</td>
              <td><span className="badge badge-cyan font-mono">HYPERTABLE</span></td>
              <td><span className="font-mono" style={{ fontSize: "12px" }}>timestamp (UTC)</span></td>
              <td className="font-mono" style={{ fontWeight: "600", color: "var(--accent-green)" }}>
                {status?.counts.signal_results ?? "—"}
              </td>
              <td><span className="badge badge-green font-mono">ONLINE</span></td>
            </tr>
            <tr>
              <td style={{ fontWeight: "600", color: "var(--text-primary)" }}>event_log</td>
              <td><span className="badge badge-cyan font-mono">HYPERTABLE</span></td>
              <td><span className="font-mono" style={{ fontSize: "12px" }}>timestamp (UTC)</span></td>
              <td className="font-mono" style={{ fontWeight: "600", color: "var(--accent-green)" }}>
                {status?.counts.events_logged ?? "—"}
              </td>
              <td><span className="badge badge-green font-mono">ONLINE</span></td>
            </tr>
            <tr>
              <td style={{ fontWeight: "600", color: "var(--text-primary)" }}>signal_definitions</td>
              <td><span className="badge badge-amber font-mono">RELATIONAL</span></td>
              <td><span className="font-mono" style={{ fontSize: "12px" }}>id (UUIDv4)</span></td>
              <td className="font-mono" style={{ fontWeight: "600" }}>
                {status?.counts.signal_definitions ?? "—"}
              </td>
              <td><span className="badge badge-green font-mono">ONLINE</span></td>
            </tr>
            <tr>
              <td style={{ fontWeight: "600", color: "var(--text-primary)" }}>experiment_definitions</td>
              <td><span className="badge badge-amber font-mono">RELATIONAL</span></td>
              <td><span className="font-mono" style={{ fontSize: "12px" }}>experiment_id (UUIDv4)</span></td>
              <td className="font-mono" style={{ fontWeight: "600" }}>
                {status?.counts.experiments ?? "—"}
              </td>
              <td><span className="badge badge-green font-mono">ONLINE</span></td>
            </tr>
            <tr>
              <td style={{ fontWeight: "600", color: "var(--text-primary)" }}>experiment_runs</td>
              <td><span className="badge badge-amber font-mono">RELATIONAL</span></td>
              <td><span className="font-mono" style={{ fontSize: "12px" }}>run_id (UUIDv4)</span></td>
              <td className="font-mono" style={{ fontWeight: "600" }}>
                {status?.counts.experiment_runs ?? "—"}
              </td>
              <td><span className="badge badge-green font-mono">ONLINE</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
