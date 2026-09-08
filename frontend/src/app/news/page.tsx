'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl, formatFigure, formatSignedFigure } from '@/lib/api';

interface CanonicalArticle {
  cluster_id: string;
  primary_headline: string;
  primary_url: string;
  primary_publisher: string;
  publisher_count: number;
  first_published_at: string;
  first_available_at: string;
  corroboration_score: number;
  entities: string[];
  sentiment_polarity: number;
  member_article_ids: string[];
}

interface RawArticle {
  id: string;
  provider_id: string;
  headline: string;
  url: string;
  publisher: string;
  published_at: string;
  available_at: string;
  entities: string[];
  provenance: Record<string, unknown>;
}

interface ClusterDetail {
  canonical: CanonicalArticle;
  raw_articles: RawArticle[];
  raw_article_count: number;
}

function corroborationBadgeClass(score: number): string {
  if (score >= 0.9) return 'badge-green';
  if (score >= 0.7) return 'badge-cyan';
  return 'badge-amber';
}

function corroborationLabel(score: number): string {
  if (score >= 0.9) return 'HIGH';
  if (score >= 0.7) return 'MED';
  return 'LOW';
}

function sentimentColor(polarity: number): string {
  if (polarity > 0.1) return 'var(--accent-green)';
  if (polarity < -0.1) return 'var(--accent-red)';
  return 'var(--text-muted)';
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return iso; }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return iso; }
}

export default function NewsfeedPage() {
  const [articles, setArticles] = useState<CanonicalArticle[]>([]);
  const [selected, setSelected] = useState<CanonicalArticle | null>(null);
  const [detail, setDetail] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [minCorroboration, setMinCorroboration] = useState(0.0);
  const [limit, setLimit] = useState(50);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sym = symbolFilter.trim().toUpperCase();
      const url = sym
        ? apiUrl(`/api/news/symbol/${encodeURIComponent(sym)}?limit=${limit}`)
        : apiUrl(`/api/news/latest?limit=${limit}&min_corroboration=${minCorroboration}`);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 422) {
          const body = await res.json() as { detail?: string };
          setError(`Could not resolve symbol "${sym}": ${body.detail ?? 'unknown reason'}`);
          setArticles([]);
          return;
        }
        setError(`API returned ${res.status}`);
        return;
      }
      const data: CanonicalArticle[] = await res.json();
      setArticles(data);
      setSelected(data[0] ?? null);
    } catch (e) {
      setError('Cannot reach API — check that the backend is running.');
      console.error('Newsfeed fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [symbolFilter, minCorroboration, limit]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setDetailLoading(true);
    fetch(apiUrl(`/api/news/cluster/${encodeURIComponent(selected.cluster_id)}`))
      .then((r) => (r.ok ? r.json() as Promise<ClusterDetail> : Promise.reject(r.status)))
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selected]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.5px' }}>Canonical Newsfeed</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Deduplicated, provider-corroborated news clusters ingested by the Aegis pipeline. Every
          article carries its point-in-time{' '}
          <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontSize: '11px' }}>available_at</span>
          {' '}— when the market could first have known the information.
        </p>
      </div>

      <div className="grid-4">
        <div className="card">
          <span className="card-title">Clusters shown</span>
          <span className="card-value">{articles.length}</span>
          <span className="card-subtitle">Canonical, deduplicated</span>
        </div>
        <div className="card">
          <span className="card-title">Corroboration filter</span>
          <span className="card-value" style={{ color: 'var(--accent-cyan)', fontSize: '22px' }}>
            &ge;{formatFigure(minCorroboration * 100)}%
          </span>
          <span className="card-subtitle">Publisher threshold</span>
        </div>
        <div className="card">
          <span className="card-title">High corroboration</span>
          <span className="card-value" style={{ color: 'var(--accent-green)', fontSize: '22px' }}>
            {articles.filter((a) => a.corroboration_score >= 0.9).length}
          </span>
          <span className="card-subtitle">3+ independent publishers</span>
        </div>
        <div className="card">
          <span className="card-title">Symbol filter</span>
          <span className="card-value font-mono" style={{ fontSize: '18px', color: symbolFilter ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
            {symbolFilter || 'ALL'}
          </span>
          <span className="card-subtitle">Entity-resolved ticker</span>
        </div>
      </div>

      <div className="card" style={{ flexDirection: 'row', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 0 160px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Symbol filter</label>
          <input
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
            placeholder="AAPL, BTC, Apple…"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '6px 10px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px', minWidth: '180px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Min corroboration — {formatFigure(minCorroboration * 100)}%
          </label>
          <input type="range" min={0} max={0.95} step={0.05} value={minCorroboration}
            onChange={(e) => setMinCorroboration(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-cyan)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
            <span>0% — any</span><span>75% — 2 pub</span><span>95% — 3+</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Limit</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '13px', padding: '6px 8px' }}>
            {[25, 50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <button className="btn btn-secondary" onClick={fetchFeed} style={{ alignSelf: 'flex-end' }}>Refresh</button>

        {error && (
          <div style={{ flex: '1 1 100%', padding: '8px 12px', background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)', borderRadius: '5px', fontSize: '12px', color: 'var(--accent-red)' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', alignItems: 'start' }}>

        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Canonical article clusters</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              ordered by <span className="font-mono">first_available_at DESC</span>
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Fetching newsfeed from database…
            </div>
          ) : articles.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>No articles ingested yet</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto' }}>
                The Aegis news pipeline polls Marketaux, Alpha Vantage, Finnhub, and GDELT on a 5-minute
                cycle. Articles will appear here once the worker has completed its first ingest run.
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Headline</th>
                  <th>Entities</th>
                  <th>Pub</th>
                  <th>Corr</th>
                  <th>Available (PIT)</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => {
                  const isSel = selected?.cluster_id === a.cluster_id;
                  return (
                    <tr key={a.cluster_id} onClick={() => setSelected(a)}
                      style={{ cursor: 'pointer', backgroundColor: isSel ? 'var(--bg-card-hover)' : undefined, borderLeft: isSel ? '2px solid var(--accent-cyan)' : '2px solid transparent' }}>
                      <td style={{ maxWidth: '280px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: isSel ? 600 : 400, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {a.primary_headline}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{a.primary_publisher}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {a.entities.length === 0
                            ? <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                            : a.entities.slice(0, 3).map((e) => (
                                <span key={e} className="badge badge-cyan font-mono" style={{ fontSize: '10px' }}>{e}</span>
                              ))}
                          {a.entities.length > 3 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{a.entities.length - 3}</span>}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{a.publisher_count}</span>
                      </td>
                      <td>
                        <span className={`badge ${corroborationBadgeClass(a.corroboration_score)} font-mono`}>{corroborationLabel(a.corroboration_score)}</span>
                        <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{formatFigure(a.corroboration_score)}</div>
                      </td>
                      <td>
                        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>{fmtTime(a.first_available_at)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!selected ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select a cluster to inspect its provenance chain</span>
            </div>
          ) : detailLoading ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading provenance…</span>
            </div>
          ) : (
            <>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <span className="card-title">Canonical cluster</span>
                  <span className={`badge ${corroborationBadgeClass(selected.corroboration_score)}`}>
                    {corroborationLabel(selected.corroboration_score)}
                  </span>
                </div>

                <a href={selected.primary_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5, textDecoration: 'none' }}>
                  {selected.primary_headline}
                </a>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  {[
                    ['Primary publisher', selected.primary_publisher, false],
                    ['Ind. publishers', String(selected.publisher_count), true],
                    ['First published', fmtDateTime(selected.first_published_at), true],
                    ['Available at (PIT)', fmtDateTime(selected.first_available_at), true],
                    ['Sentiment', formatSignedFigure(selected.sentiment_polarity), true],
                    ['Corroboration', formatFigure(selected.corroboration_score), true],
                  ].map(([label, val, mono]) => (
                    <div key={label as string}>
                      <div style={{ color: label === 'Available at (PIT)' ? 'var(--accent-cyan)' : 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>{label}</div>
                      <div className={mono ? 'font-mono' : ''} style={{ color: label === 'Available at (PIT)' ? 'var(--accent-cyan)' : label === 'Sentiment' ? sentimentColor(selected.sentiment_polarity) : 'var(--text-primary)', marginTop: '2px', fontSize: '11px' }}>{val}</div>
                    </div>
                  ))}
                </div>

                {selected.entities.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Resolved entities</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {selected.entities.map((e) => (
                        <span key={e} className="badge badge-cyan font-mono" style={{ fontSize: '11px' }}>{e}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  cluster_id: {selected.cluster_id}
                </div>
              </div>

              {detail && (
                <div className="table-container">
                  <div className="table-header">
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                      Provenance — {detail.raw_article_count} raw observation{detail.raw_article_count !== 1 ? 's' : ''}
                    </span>
                    <span className="badge badge-amber" style={{ fontSize: '10px' }}>PROVIDER-BACKED</span>
                  </div>

                  {detail.raw_article_count === 0 ? (
                    <div style={{ padding: '20px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      No raw observations stored for this cluster
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Headline</th>
                          <th>Available (PIT)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.raw_articles.map((raw) => (
                          <tr key={raw.id}>
                            <td><span className="badge badge-amber font-mono" style={{ fontSize: '10px' }}>{raw.provider_id.toUpperCase()}</span></td>
                            <td style={{ maxWidth: '200px' }}>
                              <a href={raw.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none', lineHeight: 1.4, display: '-webkit-box', overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {raw.headline}
                              </a>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{raw.publisher}</div>
                            </td>
                            <td>
                              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>{fmtTime(raw.available_at)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
