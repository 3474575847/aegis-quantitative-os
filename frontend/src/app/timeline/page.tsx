'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

interface EventItem {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  correlation_id: string;
  payload: Record<string, any>;
  metadata: Record<string, any>;
}

export default function TimelinePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/events?limit=60'));
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        if (data.length > 0) {
          setSelectedEvent(data[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching events', e);
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
              Event Stream Ledger
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Immutable TimescaleDB hypertable audit log supporting deterministic time-travel and replay
          </p>
        </div>
        <button
          className="terminal-btn text-xs"
          onClick={fetchEvents}
        >
          Refresh Ledger
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Logged Events</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">{events.length}</span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Active window captured</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Partition Strategy</span>
          <span className="text-xl font-bold font-mono text-[#3fb950] mt-1">
            Timestamp UTC
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Hypertables indexed</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Correlation Tracing</span>
          <span className="text-xl font-bold font-mono text-[#58a6ff] mt-1">
            UUIDv4 Linked
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">End-to-end lineage</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Replay Capability</span>
          <span className="text-xl font-bold font-mono text-[#e3b341] mt-1">
            Zero-Bias
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Deterministic replay active</span>
        </div>
      </div>

      {/* Event Stream & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Events Table */}
        <div className="lg:col-span-7 panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">Event Stream Log</span>
            <span className="text-xs font-mono text-[#8b949e]">{events.length} Records</span>
          </div>
          <div className="overflow-x-auto max-h-[620px]">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Source</th>
                  <th>Correlation ID</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-[#586069] text-xs">
                      Loading event log...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-[#586069] text-xs">
                      No events recorded.
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => {
                    const isSelected = selectedEvent?.event_id === evt.event_id;
                    return (
                      <tr
                        key={evt.event_id}
                        onClick={() => setSelectedEvent(evt)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#192231]/80' : 'hover:bg-[#121722]'
                        }`}
                      >
                        <td>
                          <span
                            className={`font-mono text-xs font-semibold ${
                              evt.event_type.includes('Success') ||
                              evt.event_type.includes('Completed')
                                ? 'text-[#3fb950]'
                                : evt.event_type.includes('Failed') ||
                                    evt.event_type.includes('Error')
                                  ? 'text-[#f85149]'
                                  : evt.event_type.includes('Signal')
                                    ? 'text-[#58a6ff]'
                                    : 'text-[#e3b341]'
                            }`}
                          >
                            {evt.event_type}
                          </span>
                        </td>
                        <td className="text-xs text-[#e6edf3] font-mono">
                          {evt.source}
                        </td>
                        <td>
                          <span className="font-mono text-xs text-[#8b949e]">
                            {evt.correlation_id ? evt.correlation_id.slice(0, 8) : '—'}
                          </span>
                        </td>
                        <td className="text-xs text-[#586069] font-mono">
                          {new Date(evt.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Event JSON Inspector */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          {selectedEvent ? (
            <div className="panel p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center pb-2.5 border-b border-[#1b2230]">
                <span className="metric-label">Event Payload Inspector</span>
                <span className="text-xs font-mono text-[#58a6ff] font-bold">{selectedEvent.event_type}</span>
              </div>

              <div className="flex flex-col gap-2 text-xs font-mono bg-[#10141d] p-3 rounded-[2px] border border-[#1b2230]">
                <div className="flex justify-between">
                  <span className="text-[#586069]">Event ID</span>
                  <span className="text-[#8b949e]">{selectedEvent.event_id.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#586069]">Correlation ID</span>
                  <span className="text-[#8b949e]">{selectedEvent.correlation_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#586069]">Source System</span>
                  <span className="text-[#e6edf3]">{selectedEvent.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#586069]">Timestamp</span>
                  <span className="text-[#e6edf3]">{new Date(selectedEvent.timestamp).toISOString()}</span>
                </div>
              </div>

              <div>
                <span className="metric-label block mb-1.5">Payload Data</span>
                <pre className="font-mono text-xs text-[#3fb950] bg-[#090c10] border border-[#1b2230] p-3 rounded-[2px] max-h-56 overflow-y-auto leading-relaxed">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>

              <div>
                <span className="metric-label block mb-1.5">Metadata Context</span>
                <pre className="font-mono text-xs text-[#58a6ff] bg-[#090c10] border border-[#1b2230] p-3 rounded-[2px] max-h-40 overflow-y-auto leading-relaxed">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="panel p-12 text-center text-xs text-[#586069] font-mono">
              Select an event from the ledger to inspect its payload
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
