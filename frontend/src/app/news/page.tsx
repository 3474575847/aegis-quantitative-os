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
    <div className="flex flex-col gap-4 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              News & Intelligence Feed
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Deduplicated, provider-corroborated news clusters with point-in-time publication timestamps
          </p>
        </div>
        <button className="terminal-btn text-xs" onClick={fetchFeed}>
          Refresh Feed
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Clusters Ingested</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">{articles.length}</span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Canonical, deduplicated</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Corroboration Threshold</span>
          <span className="text-xl font-bold font-mono text-[#58a6ff] tabular-nums mt-1">
            &ge;{formatFigure(minCorroboration * 100)}%
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Publisher consensus</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">High Corroboration</span>
          <span className="text-xl font-bold font-mono text-[#3fb950] tabular-nums mt-1">
            {articles.filter((a) => a.corroboration_score >= 0.9).length}
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">3+ independent publishers</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Symbol Filter</span>
          <span className="text-xl font-bold font-mono mt-1 text-[#e6edf3]">
            {symbolFilter || 'ALL'}
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Entity-resolved ticker</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel p-3.5 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 w-44">
          <label className="metric-label">Symbol Filter</label>
          <input
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL, BTC"
            className="terminal-input w-full text-xs"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <div className="flex justify-between items-center">
            <label className="metric-label">Min Corroboration</label>
            <span className="font-mono text-xs text-[#58a6ff]">{formatFigure(minCorroboration * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={minCorroboration}
            onChange={(e) => setMinCorroboration(parseFloat(e.target.value))}
            className="w-full accent-[#d29922]"
          />
          <div className="flex justify-between text-[10px] text-[#586069] font-mono">
            <span>0% (Any)</span><span>75% (2+ pub)</span><span>95% (3+)</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 w-24">
          <label className="metric-label">Limit</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="terminal-input text-xs"
          >
            {[25, 50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {error && (
          <div className="w-full p-2 bg-[#28161a] border border-[#482025] text-[#f85149] text-xs font-mono rounded-[2px]">
            {error}
          </div>
        )}
      </div>

      {/* Articles Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Cluster Table */}
        <div className="lg:col-span-7 panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">Canonical Article Clusters</span>
            <span className="text-xs font-mono text-[#8b949e]">
              first_available_at DESC
            </span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-[#8b949e] text-xs font-mono">
              Fetching newsfeed from database…
            </div>
          ) : articles.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-xs text-[#8b949e] font-mono mb-2">No articles ingested yet</div>
              <div className="text-[11px] text-[#586069] max-w-sm mx-auto leading-relaxed">
                The Aegis news pipeline polls Marketaux, Alpha Vantage, Finnhub, and GDELT on a 5-minute
                cycle. Articles will appear here once the worker has completed its first ingest run.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[640px]">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>Headline</th>
                    <th>Entities</th>
                    <th>Pubs</th>
                    <th>Corr</th>
                    <th>Available (PIT)</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => {
                    const isSel = selected?.cluster_id === a.cluster_id;
                    return (
                      <tr
                        key={a.cluster_id}
                        onClick={() => setSelected(a)}
                        className={`cursor-pointer transition-colors ${
                          isSel ? 'bg-[#192231]/80' : 'hover:bg-[#121722]'
                        }`}
                      >
                        <td className="max-w-[280px]">
                          <div className={`text-xs leading-relaxed line-clamp-2 ${isSel ? 'text-[#58a6ff] font-semibold' : 'text-[#e6edf3]'}`}>
                            {a.primary_headline}
                          </div>
                          <div className="text-[10px] text-[#586069] font-mono mt-0.5">{a.primary_publisher}</div>
                        </td>
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {a.entities.length === 0 ? (
                              <span className="text-[10px] text-[#586069]">—</span>
                            ) : (
                              a.entities.slice(0, 3).map((e) => (
                                <span key={e} className="px-1 py-0.5 rounded-[2px] bg-[#14233a] border border-[#1f3a60] text-[10px] text-[#58a6ff] font-mono">
                                  {e}
                                </span>
                              ))
                            )}
                            {a.entities.length > 3 && (
                              <span className="text-[10px] text-[#586069] font-mono">+{a.entities.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="font-mono text-xs text-[#e6edf3] font-semibold">{a.publisher_count}</span>
                        </td>
                        <td>
                          <span className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10px] uppercase ${
                            a.corroboration_score >= 0.9
                              ? 'bg-[#12281e] text-[#3fb950] border border-[#235537]'
                              : a.corroboration_score >= 0.7
                                ? 'bg-[#14233a] text-[#58a6ff] border border-[#1f3a60]'
                                : 'bg-[#2b2111] text-[#d29922] border border-[#594217]'
                          }`}>
                            {corroborationLabel(a.corroboration_score)}
                          </span>
                          <div className="font-mono text-[10px] text-[#586069] mt-0.5">{formatFigure(a.corroboration_score)}</div>
                        </td>
                        <td>
                          <span className="font-mono text-[11px] text-[#58a6ff]">{fmtTime(a.first_available_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Provenance & Detail */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          {!selected ? (
            <div className="panel p-12 text-center text-xs text-[#586069] font-mono">
              Select an article cluster to inspect its provenance chain
            </div>
          ) : detailLoading ? (
            <div className="panel p-10 text-center text-xs text-[#8b949e] font-mono">
              Loading provenance telemetry…
            </div>
          ) : (
            <>
              <div className="panel p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2 pb-2 border-b border-[#1b2230]">
                  <span className="metric-label">Canonical Cluster Overview</span>
                  <span className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10px] uppercase ${
                    selected.corroboration_score >= 0.9
                      ? 'bg-[#12281e] text-[#3fb950] border border-[#235537]'
                      : 'bg-[#14233a] text-[#58a6ff] border border-[#1f3a60]'
                  }`}>
                    {corroborationLabel(selected.corroboration_score)}
                  </span>
                </div>

                <a
                  href={selected.primary_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-[#e6edf3] hover:text-[#58a6ff] leading-relaxed transition-colors"
                >
                  {selected.primary_headline} ↗
                </a>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#10141d] p-3 rounded-[2px] border border-[#1b2230]">
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Primary Publisher</span>
                    <span className="text-[#e6edf3] mt-0.5 block">{selected.primary_publisher}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Ind. Publishers</span>
                    <span className="text-[#e6edf3] mt-0.5 block">{selected.publisher_count}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">First Published</span>
                    <span className="text-[#8b949e] mt-0.5 block">{fmtDateTime(selected.first_published_at)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#58a6ff] uppercase block">Available (PIT)</span>
                    <span className="text-[#58a6ff] mt-0.5 block">{fmtDateTime(selected.first_available_at)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Sentiment Polarity</span>
                    <span className={`mt-0.5 block font-bold ${
                      selected.sentiment_polarity > 0.1
                        ? 'text-[#3fb950]'
                        : selected.sentiment_polarity < -0.1
                          ? 'text-[#f85149]'
                          : 'text-[#8b949e]'
                    }`}>
                      {formatSignedFigure(selected.sentiment_polarity)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Corroboration</span>
                    <span className="text-[#e6edf3] mt-0.5 block">{formatFigure(selected.corroboration_score)}</span>
                  </div>
                </div>

                {selected.entities.length > 0 && (
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block mb-1.5 font-mono">Resolved Entities</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {selected.entities.map((e) => (
                        <span key={e} className="px-1.5 py-0.5 rounded-[2px] bg-[#14233a] border border-[#1f3a60] text-xs text-[#58a6ff] font-mono">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-[#586069] font-mono break-all pt-2 border-t border-[#1b2230]">
                  cluster_id: {selected.cluster_id}
                </div>
              </div>

              {detail && (
                <div className="panel overflow-hidden">
                  <div className="panel-header">
                    <span className="panel-title">
                      Provenance — {detail.raw_article_count} Raw Observation{detail.raw_article_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] font-mono text-[#d29922] bg-[#2b2111] px-1.5 py-0.5 rounded-[2px] border border-[#594217]">
                      PROVIDER-BACKED
                    </span>
                  </div>

                  {detail.raw_article_count === 0 ? (
                    <div className="p-4 text-xs text-[#586069] font-mono text-center">
                      No raw observations stored for this cluster
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="terminal-table">
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
                              <td>
                                <span className="font-mono text-[10px] text-[#d29922] bg-[#2b2111] px-1 py-0.5 rounded-[2px]">
                                  {raw.provider_id.toUpperCase()}
                                </span>
                              </td>
                              <td className="max-w-[200px]">
                                <a
                                  href={raw.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-[#8b949e] hover:text-[#58a6ff] line-clamp-2 transition-colors"
                                >
                                  {raw.headline}
                                </a>
                                <div className="text-[10px] text-[#586069] font-mono mt-0.5">{raw.publisher}</div>
                              </td>
                              <td>
                                <span className="font-mono text-[10px] text-[#58a6ff]">{fmtTime(raw.available_at)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
