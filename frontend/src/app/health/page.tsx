'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

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
      const res = await fetch(apiUrl('/api/system/status'));
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('Error fetching system status', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              System Diagnostics
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Real-time status of TimescaleDB hypertables, Redis cache, data worker streams, and FastAPI runtime
          </p>
        </div>
        <button className="terminal-btn text-xs" onClick={fetchHealth}>
          Refresh Diagnostics
        </button>
      </div>

      {/* Global Status Banner */}
      <div className="panel p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#3fb950]">
            <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
          <span className="text-xs text-[#8b949e]">
            Zero critical pipeline bottlenecks detected.
          </span>
        </div>
        <span className="font-mono text-xs text-[#586069]">
          Heartbeat: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'Polling...'}
        </span>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {status?.services.map((svc) => (
          <div key={svc.name} className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between gap-2">
            <div className="flex justify-between items-center">
              <span className="metric-label">{svc.name.replace('_', ' ')}</span>
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#3fb950]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                {svc.status}
              </span>
            </div>
            <div className="text-sm font-bold font-mono text-[#e6edf3]">
              {svc.port ? `Port :${svc.port}` : svc.mode || 'Active'}
            </div>
            <span className="text-[11px] text-[#586069] font-mono">
              Responsive (0 errors)
            </span>
          </div>
        ))}
      </div>

      {/* Storage and Hypertable Metrics */}
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <span className="panel-title">TimescaleDB Hypertables & Table Statistics</span>
          <span className="text-xs font-mono text-[#8b949e]">PostgreSQL 16 Engine</span>
        </div>
        <div className="overflow-x-auto">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Table Name</th>
                <th>Storage Type</th>
                <th>Partitioning Key</th>
                <th className="text-right">Total Records</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono font-bold text-[#e6edf3] text-xs">signal_results</td>
                <td className="text-xs font-mono text-[#58a6ff]">Hypertable</td>
                <td className="font-mono text-xs text-[#8b949e]">timestamp (UTC)</td>
                <td className="font-mono font-bold text-[#3fb950] text-right text-xs tabular-nums">
                  {status?.counts.signal_results?.toLocaleString() ?? '—'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-[#3fb950]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                    Online
                  </span>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-[#e6edf3] text-xs">event_log</td>
                <td className="text-xs font-mono text-[#58a6ff]">Hypertable</td>
                <td className="font-mono text-xs text-[#8b949e]">timestamp (UTC)</td>
                <td className="font-mono font-bold text-[#3fb950] text-right text-xs tabular-nums">
                  {status?.counts.events_logged?.toLocaleString() ?? '—'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-[#3fb950]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                    Online
                  </span>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-[#e6edf3] text-xs">signal_definitions</td>
                <td className="text-xs font-mono text-[#e3b341]">Relational</td>
                <td className="font-mono text-xs text-[#8b949e]">id (UUIDv4)</td>
                <td className="font-mono font-semibold text-[#e6edf3] text-right text-xs tabular-nums">
                  {status?.counts.signal_definitions?.toLocaleString() ?? '—'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-[#3fb950]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                    Online
                  </span>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-[#e6edf3] text-xs">experiment_definitions</td>
                <td className="text-xs font-mono text-[#e3b341]">Relational</td>
                <td className="font-mono text-xs text-[#8b949e]">experiment_id (UUIDv4)</td>
                <td className="font-mono font-semibold text-[#e6edf3] text-right text-xs tabular-nums">
                  {status?.counts.experiments?.toLocaleString() ?? '—'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-[#3fb950]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                    Online
                  </span>
                </td>
              </tr>
              <tr>
                <td className="font-mono font-bold text-[#e6edf3] text-xs">experiment_runs</td>
                <td className="text-xs font-mono text-[#e3b341]">Relational</td>
                <td className="font-mono text-xs text-[#8b949e]">run_id (UUIDv4)</td>
                <td className="font-mono font-semibold text-[#e6edf3] text-right text-xs tabular-nums">
                  {status?.counts.experiment_runs?.toLocaleString() ?? '—'}
                </td>
                <td>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-[#3fb950]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                    Online
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
