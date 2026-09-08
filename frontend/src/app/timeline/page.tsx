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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px' }}>
          Append-Only Event Stream Ledger
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Immutable TimescaleDB hypertable audit log supporting deterministic time-travel and
          replay.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid-4">
        <div className="card">
          <span className="card-title">Logged Events</span>
          <span className="card-value">{events.length}</span>
          <span className="card-subtitle">Recent window captured</span>
        </div>
        <div className="card">
          <span className="card-title">Partition Strategy</span>
          <span className="card-value" style={{ color: 'var(--accent-green)', fontSize: '20px' }}>
            TIMESTAMP UTC
          </span>
          <span className="card-subtitle">Hypertables indexed</span>
        </div>
        <div className="card">
          <span className="card-title">Correlation Tracing</span>
          <span className="card-value" style={{ color: 'var(--accent-cyan)', fontSize: '20px' }}>
            UUIDv4 LINKED
          </span>
          <span className="card-subtitle">End-to-end lineage</span>
        </div>
        <div className="card">
          <span className="card-title">Replay Capability</span>
          <span className="card-value" style={{ color: 'var(--accent-purple)', fontSize: '20px' }}>
            ZERO-BIAS
          </span>
          <span className="card-subtitle">Deterministic replay active</span>
        </div>
      </div>

      {/* Event Stream & Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
        {/* Events Table */}
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: '600', fontSize: '13px' }}>Event Stream Log</span>
            <button
              className="btn btn-secondary"
              onClick={fetchEvents}
              style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              Refresh
            </button>
          </div>
          <table className="data-table">
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
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px' }}>
                    Loading event log...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px' }}>
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
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--bg-card-hover)' : undefined,
                      }}
                    >
                      <td>
                        <span
                          className={`badge ${
                            evt.event_type.includes('Success') ||
                            evt.event_type.includes('Completed')
                              ? 'badge-green'
                              : evt.event_type.includes('Failed') ||
                                  evt.event_type.includes('Error')
                                ? 'badge-red'
                                : evt.event_type.includes('Signal')
                                  ? 'badge-cyan'
                                  : 'badge-amber'
                          } font-mono`}
                        >
                          {evt.event_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        {evt.source}
                      </td>
                      <td>
                        <span
                          className="font-mono"
                          style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                        >
                          {evt.correlation_id.slice(0, 8)}...
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
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

        {/* Selected Event JSON Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedEvent ? (
            <div className="card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span className="card-title">Event Payload Inspector</span>
                <span className="badge badge-cyan font-mono">{selectedEvent.event_type}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px',
                  marginTop: '8px',
                }}
              >
                <div>
                  <strong>Event ID:</strong>{' '}
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {selectedEvent.event_id}
                  </span>
                </div>
                <div>
                  <strong>Correlation ID:</strong>{' '}
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {selectedEvent.correlation_id}
                  </span>
                </div>
                <div>
                  <strong>Source System:</strong>{' '}
                  <span className="font-mono">{selectedEvent.source}</span>
                </div>
                <div>
                  <strong>UTC Timestamp:</strong>{' '}
                  <span className="font-mono">{selectedEvent.timestamp}</span>
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    fontWeight: '600',
                  }}
                >
                  Payload Data
                </div>
                <pre
                  className="font-mono"
                  style={{
                    marginTop: '6px',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'var(--accent-green)',
                    border: '1px solid var(--border-color)',
                    maxHeight: '220px',
                    overflowY: 'auto',
                  }}
                >
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>

              <div style={{ marginTop: '8px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    fontWeight: '600',
                  }}
                >
                  Metadata Context
                </div>
                <pre
                  className="font-mono"
                  style={{
                    marginTop: '6px',
                    padding: '10px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'var(--accent-cyan)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Select an event to inspect its payload
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
