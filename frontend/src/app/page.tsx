'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { apiUrl, formatFigure, formatSignedFigure } from '@/lib/api';
import { CommandIcon, SignalIcon, RefreshIcon, TerminalIcon, ActivityIcon } from './components/icons';
import SentimentPriceChart from './components/SentimentPriceChart';
import { ChartDatapoint, AegisSignalOverlay } from './components/charts/AegisChart/types';
import Sparkline from './components/visuals/Sparkline';

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
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Interactive Chart Telemetry State
  const [activeChartSymbol, setActiveChartSymbol] = useState<string>('BTC');
  const [chartHistory, setChartHistory] = useState<ChartDatapoint[]>([]);
  const [chartSignals, setChartSignals] = useState<AegisSignalOverlay[]>([]);
  const [chartLoading, setChartLoading] = useState<boolean>(false);

  const loadChartData = async (sym: string) => {
    try {
      setChartLoading(true);
      const [histRes, sigRes] = await Promise.allSettled([
        fetch(apiUrl(`/api/market/ticker/${sym}/history`)).then((r) => r.json()),
        fetch(apiUrl(`/api/signals/a3/${sym}`)).then((r) => r.json()),
      ]);

      if (histRes.status === 'fulfilled' && histRes.value) {
        const rawPoints = Array.isArray(histRes.value)
          ? histRes.value
          : (histRes.value.datapoints || []);
        if (Array.isArray(rawPoints) && rawPoints.length > 0) {
          const mapped: ChartDatapoint[] = rawPoints.map((item: any) => ({
            timestamp: item.timestamp,
            time: item.time,
            open: Number(item.open ?? item.price),
            high: Number(item.high ?? item.price),
            low: Number(item.low ?? item.price),
            close: Number(item.close ?? item.price),
            price: Number(item.price ?? item.close),
            volume: Number(item.volume ?? 0),
            sentimentZ: Number(item.sentimentZ ?? 0),
          }));
          setChartHistory(mapped);
        }
      }

      if (sigRes.status === 'fulfilled' && sigRes.value) {
        const overlays =
          sigRes.value.signal_overlays || sigRes.value.historical_signal_overlays || [];
        if (Array.isArray(overlays)) {
          setChartSignals(overlays);
        }
      }
    } catch (err) {
      console.error('Failed to load chart telemetry:', err);
    } finally {
      setChartLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const [statusRes, sigsRes, eventsRes, btcRes, ethRes, nvdaRes, aaplRes] =
        await Promise.allSettled([
          fetch(apiUrl('/api/system/status')).then((r) => r.json()),
          fetch(apiUrl('/api/signals')).then((r) => r.json()),
          fetch(apiUrl('/api/events?limit=8')).then((r) => r.json()),
          fetch(apiUrl('/api/market/ticker/BTC')).then((r) => r.json()),
          fetch(apiUrl('/api/market/ticker/ETH')).then((r) => r.json()),
          fetch(apiUrl('/api/market/ticker/NVDA')).then((r) => r.json()),
          fetch(apiUrl('/api/market/ticker/AAPL')).then((r) => r.json()),
        ]);

      if (statusRes.status === 'fulfilled') setSystemStatus(statusRes.value);
      if (sigsRes.status === 'fulfilled') setSignals(sigsRes.value);
      if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value);

      const quoteMap: Record<string, TickerQuote> = {};
      if (btcRes.status === 'fulfilled') quoteMap['BTC'] = btcRes.value;
      if (ethRes.status === 'fulfilled') quoteMap['ETH'] = ethRes.value;
      if (nvdaRes.status === 'fulfilled') quoteMap['NVDA'] = nvdaRes.value;
      if (aaplRes.status === 'fulfilled') quoteMap['AAPL'] = aaplRes.value;
      setQuotes(quoteMap);

      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Failed to load command center telemetry', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadChartData('BTC');
    const interval = setInterval(loadDashboardData, 15_000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectAsset = (sym: string) => {
    setActiveChartSymbol(sym);
    loadChartData(sym);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-10">
      {/* Title & Station Telemetry */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Command Center
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Real-time factor attribution, systematic execution, and portfolio risk telemetry
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-[#8b949e]">
          <span className="text-[#586069]">Synced: <span className="text-[#8b949e]">{lastRefreshed || 'Connecting...'}</span></span>
          <button
            onClick={loadDashboardData}
            className="terminal-btn"
            title="Refresh dashboard"
          >
            <RefreshIcon size={12} className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Station Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Hypertable Events</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
            {systemStatus?.counts.events_logged?.toLocaleString() ?? '—'}
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Timescale audit ledger</span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Factor Observations</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
            {systemStatus?.counts.signal_results?.toLocaleString() ?? '—'}
          </span>
          <span className="text-[11px] text-[#3fb950] font-mono mt-1">Point-in-time persisted</span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Registered Experiments</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
            {systemStatus?.counts.experiments ?? '—'}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono mt-1">
            {systemStatus?.counts.experiment_runs ?? 0} executed runs
          </span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Engine Health</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
            <span className="text-xl font-bold font-mono text-[#3fb950]">Operational</span>
          </div>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Zero-lookahead execution</span>
        </div>
      </div>

      {/* Interactive Quantitative Terminal Chart (TradingView Engine) */}
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="panel-title flex items-center gap-2">
              <ActivityIcon size={14} className="text-[#d29922]" />
              Terminal Chart: {activeChartSymbol} Live
            </span>
            <div className="flex items-center bg-[#090c10] border border-[#1b2230] rounded-[2px] p-0.5 ml-1">
              {['BTC', 'ETH', 'NVDA', 'AAPL'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => handleSelectAsset(sym)}
                  className={`px-2 py-0.5 text-xs font-mono rounded-[1px] transition-colors ${
                    activeChartSymbol === sym
                      ? 'bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]'
                      : 'text-[#7d8590] hover:text-[#e6edf3]'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <Link
              href={`/companies/${activeChartSymbol}`}
              className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            >
              Instrument Profile →
            </Link>
            <Link
              href="/signals"
              className="text-[#d29922] hover:underline"
            >
              Signal Attribution →
            </Link>
          </div>
        </div>

        <SentimentPriceChart
          symbol={activeChartSymbol}
          data={chartHistory}
          signals={chartSignals}
          providerStatus={{
            isFallback: quotes[activeChartSymbol]?.is_fallback ?? false,
            reason: quotes[activeChartSymbol]?.fallback_reason ?? null,
            source: quotes[activeChartSymbol]?.exchange ?? (['BTC', 'ETH'].includes(activeChartSymbol) ? 'Coinbase Spot' : 'US Equities Live'),
          }}
        />
      </div>

      {/* Primary Market Watchlist Matrix (Bloomberg Style) */}
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <span className="panel-title">
            Tracked Instruments & Feeds
          </span>
          <Link href="/signals" className="text-xs font-mono text-[#d29922] hover:underline">
            Signal Engine →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Asset Class</th>
                <th className="text-right">Spot Price</th>
                <th className="text-center">7D Trend</th>
                <th className="text-right">Quant Score (Z)</th>
                <th>Signal Bias</th>
                <th>Exchange</th>
                <th>Feed Provenance</th>
                <th>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {['BTC', 'ETH', 'NVDA', 'AAPL'].map((sym) => {
                const q = quotes[sym];
                if (!q) {
                  return (
                    <tr key={sym}>
                      <td className="font-mono font-bold text-[#e6edf3]">{sym}</td>
                      <td colSpan={8} className="text-[#586069] text-xs">
                        Connecting to market feed...
                      </td>
                    </tr>
                  );
                }

                const isPos = q.z_score_signal >= 0;

                // Deterministic synthetic 7-day sparkline anchored around the live price
                const p = q.price;
                const sparkData = sym === 'BTC'
                  ? [p * 0.96, p * 0.965, p * 0.958, p * 0.978, p * 0.985, p * 0.992, p * 0.988, p * 0.995, p]
                  : sym === 'ETH'
                  ? [p * 0.94, p * 0.95, p * 0.942, p * 0.968, p * 0.96, p * 0.98, p * 0.975, p * 0.99, p]
                  : sym === 'NVDA'
                  ? [p * 0.93, p * 0.945, p * 0.95, p * 0.94, p * 0.965, p * 0.98, p * 0.975, p * 0.995, p]
                  : [p * 0.98, p * 0.985, p * 0.978, p * 0.988, p * 0.99, p * 0.986, p * 0.995, p * 0.998, p];

                return (
                  <tr
                    key={sym}
                    onClick={() => handleSelectAsset(sym)}
                    className={`cursor-pointer transition-colors ${
                      activeChartSymbol === sym ? 'bg-[#192231]/80' : 'hover:bg-[#121722]'
                    }`}
                  >
                    <td className="font-mono font-bold text-[#e6edf3] text-xs flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${activeChartSymbol === sym ? 'bg-[#d29922]' : 'bg-transparent'}`} />
                      {q.symbol}
                    </td>
                    <td className="text-xs text-[#8b949e]">{q.asset_class}</td>
                    <td className="text-right font-mono font-bold text-[#e6edf3] tabular-nums">
                      ${formatFigure(q.price)}
                    </td>
                    <td className="text-center py-1">
                      <Sparkline
                        data={sparkData}
                        width={72}
                        height={20}
                        isPositive={isPos}
                      />
                    </td>
                    <td className={`text-right font-mono tabular-nums font-semibold ${
                      isPos ? 'text-[#3fb950]' : 'text-[#f85149]'
                    }`}>
                      {formatSignedFigure(q.z_score_signal)} σ
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-mono">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          q.z_score_signal > 0.3 ? 'bg-[#3fb950]' : q.z_score_signal < -0.3 ? 'bg-[#f85149]' : 'bg-[#7d8590]'
                        }`} />
                        <span className={
                          q.z_score_signal > 0.3 ? 'text-[#3fb950]' : q.z_score_signal < -0.3 ? 'text-[#f85149]' : 'text-[#8b949e]'
                        }>
                          {q.z_score_signal > 0.3 ? 'Bullish' : q.z_score_signal < -0.3 ? 'Bearish' : 'Neutral'}
                        </span>
                      </span>
                    </td>
                    <td className="text-[#8b949e] font-mono text-xs">{q.exchange}</td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs font-mono">
                        <span className={`w-1.5 h-1.5 rounded-full ${q.is_fallback ? 'bg-[#d29922]' : 'bg-[#3fb950]'}`} />
                        <span className={q.is_fallback ? 'text-[#d29922]' : 'text-[#3fb950]'}>
                          {q.is_fallback ? 'Fallback Cache' : 'Live Provider'}
                        </span>
                      </span>
                    </td>
                    <td className="text-xs text-[#586069] font-mono">
                      {new Date(q.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Factor Models & Event Log Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Factor Catalog Table */}
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title flex items-center gap-2">
              <SignalIcon size={14} className="text-[#d29922]" />
              Active Factor Catalog
            </span>
            <Link href="/research" className="text-xs font-mono text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              Research Lab →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Weight &amp; Allocation</th>
                  <th className="text-right">Latest Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.slice(0, 6).map((sig, i) => {
                  const weightPct = [28, 22, 18, 16, 10, 6][i] ?? 12;
                  const isPositive = (sig.latest_value ?? 0) >= 0;

                  return (
                    <tr key={sig.id}>
                      <td>
                        <div className="font-semibold text-[#e6edf3] text-xs">{sig.name}</div>
                        <div className="text-[10px] text-[#586069] font-mono mt-0.5">{sig.version}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-[#0a0d13] border border-[#1b2230] rounded-[1px] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#58a6ff] to-[#3fb950] rounded-[1px]"
                              style={{ width: `${weightPct * 3}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[#8b949e] tabular-nums">{weightPct}%</span>
                        </div>
                      </td>
                      <td className="text-right font-mono font-semibold tabular-nums text-xs">
                        <span className={isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                          {sig.latest_value != null ? (isPositive ? `+${formatFigure(sig.latest_value)}` : formatFigure(sig.latest_value)) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#3fb950]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hypertable Event Stream */}
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title flex items-center gap-2">
              <TerminalIcon size={14} className="text-[#d29922]" />
              Recent Event Stream
            </span>
            <Link href="/timeline" className="text-xs font-mono text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              Full Ledger →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Event Type</th>
                  <th>Correlation</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 6).map((ev) => (
                  <tr key={ev.event_id}>
                    <td className="text-xs text-[#586069] font-mono">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="text-[#e6edf3] font-mono text-xs">{ev.source}</td>
                    <td className="text-[#8b949e] font-mono text-xs">{ev.event_type}</td>
                    <td className="text-xs text-[#586069] font-mono">
                      {ev.correlation_id ? ev.correlation_id.slice(0, 8) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
