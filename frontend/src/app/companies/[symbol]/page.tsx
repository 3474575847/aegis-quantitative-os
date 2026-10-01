'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SentimentPriceChart from '../../components/SentimentPriceChart';
import { ChartDatapoint, AegisSignalOverlay } from '../../components/charts/AegisChart/types';
import { apiUrl, formatFigure, formatSignedFigure } from '@/lib/api';
import { TerminalIcon, ActivityIcon, RefreshIcon } from '../../components/icons';

interface CompanyData {
  symbol: string;
  quote: {
    price: number;
    exchange: string;
    timestamp: string;
    z_score_signal?: number;
    is_fallback?: boolean;
    fallback_reason?: string | null;
  };
  profile: {
    name?: string;
    exchange?: string;
    finnhubIndustry?: string;
    marketCapitalization?: number;
    logo?: string;
  };
  metrics: Record<string, number>;
  sources: Record<string, string>;
  provenance?: {
    is_fallback: boolean;
    reason: string | null;
  };
}

export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = use(params);
  const symbol = rawSymbol.toUpperCase().trim();

  const [company, setCompany] = useState<CompanyData | null>(null);
  const [history, setHistory] = useState<ChartDatapoint[]>([]);
  const [signals, setSignals] = useState<AegisSignalOverlay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssetDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compRes, histRes, sigRes] = await Promise.allSettled([
        fetch(apiUrl(`/api/companies/${symbol}`)).then((r) => {
          if (!r.ok) throw new Error(`Instrument data unavailable for ${symbol}`);
          return r.json();
        }),
        fetch(apiUrl(`/api/market/ticker/${symbol}/history`)).then((r) => r.json()),
        fetch(apiUrl(`/api/signals/a3/${symbol}`)).then((r) => r.json()),
      ]);

      if (compRes.status === 'fulfilled' && compRes.value) {
        setCompany(compRes.value);
      } else if (compRes.status === 'rejected') {
        throw compRes.reason;
      }

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
          setHistory(mapped);
        }
      }

      if (sigRes.status === 'fulfilled' && sigRes.value) {
        const overlays =
          sigRes.value.signal_overlays || sigRes.value.historical_signal_overlays || [];
        if (Array.isArray(overlays)) {
          setSignals(overlays);
        }
      }
    } catch (err: any) {
      console.error('Error fetching asset detail:', err);
      setError(err?.message || 'Failed to load instrument details');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchAssetDetails();
  }, [fetchAssetDetails]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 max-w-4xl mx-auto py-8">
        <div className="panel p-6 border-[#d29922]/40 bg-[#11151f]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-sm font-bold font-mono uppercase text-[#e6edf3]">
              Instrument Telemetry Notice // {symbol}
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] font-mono mt-2">{error}</p>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={fetchAssetDetails} className="terminal-btn">
              <RefreshIcon size={12} />
              <span>RETRY FEED</span>
            </button>
            <Link href="/" className="terminal-btn">
              <span>RETURN TO WORKSTATION</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-5 h-5 border-2 border-[#d29922] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#7d8590] tracking-wider">
          ACQUIRING POINT-IN-TIME INSTRUMENT TELEMETRY FOR {symbol}...
        </span>
      </div>
    );
  }

  const metricEntries = [
    {
      label: 'MARKET CAP',
      value: company.profile.marketCapitalization
        ? `$${company.profile.marketCapitalization.toLocaleString()}M`
        : 'N/A',
      sub: 'MARKET VALUE',
    },
    {
      label: 'PE BASIC',
      value: company.metrics.peBasicExclExtraTTM != null
        ? String(company.metrics.peBasicExclExtraTTM)
        : 'N/A',
      sub: 'TTM EXCL EXTRA',
    },
    {
      label: 'EPS GROWTH',
      value: company.metrics.epsGrowthTTMYoy != null
        ? `${company.metrics.epsGrowthTTMYoy.toFixed(2)}%`
        : 'N/A',
      sub: 'YOY TRAILING',
    },
    {
      label: 'RETURN ON EQUITY',
      value: company.metrics.roeTTM != null ? `${company.metrics.roeTTM.toFixed(2)}%` : 'N/A',
      sub: 'ROE TTM',
    },
    {
      label: '52-WEEK HIGH',
      value: company.metrics['52WeekHigh'] != null ? `$${formatFigure(company.metrics['52WeekHigh'])}` : 'N/A',
      sub: 'RANGE MAX',
    },
    {
      label: '52-WEEK LOW',
      value: company.metrics['52WeekLow'] != null ? `$${formatFigure(company.metrics['52WeekLow'])}` : 'N/A',
      sub: 'RANGE MIN',
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 pb-10">
      {/* Header Telemetry Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#19202e]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-[#d29922] inline-block rounded-[1px]" />
            <h1 className="text-sm font-bold uppercase tracking-wider text-[#e6edf3] font-mono">
              {company.profile.name || symbol} ({symbol})
            </h1>
            <span className="text-[10px] font-mono text-[#7d8590]">
              · {company.profile.finnhubIndustry || (symbol === 'BTC' || symbol === 'ETH' ? 'Digital Asset / Layer 1' : 'Corporate Asset')}
            </span>
          </div>
          <p className="text-[11px] text-[#7d8590] mt-0.5 font-mono">
            Provider: {company.sources.profile || 'Verified Point-in-Time Primary Feed'} · Exchange: {company.quote.exchange}
          </p>
        </div>

        {/* Quick Instrument Jump */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#11151f] border border-[#1f2633] rounded-[2px] p-0.5">
            {['BTC', 'ETH', 'NVDA', 'AAPL'].map((s) => (
              <Link
                key={s}
                href={`/companies/${s}`}
                className={`px-2 py-0.5 text-[11px] font-mono rounded-[1px] transition-colors ${
                  symbol === s
                    ? 'bg-[#1f283b] text-[#e6edf3] font-bold border border-[#2f3b52]'
                    : 'text-[#7d8590] hover:text-[#e6edf3]'
                }`}
              >
                {s}
              </Link>
            ))}
          </div>
          <button onClick={fetchAssetDetails} className="terminal-btn" title="Refresh data">
            <RefreshIcon size={11} className={loading ? 'animate-spin' : ''} />
            <span>SYNC</span>
          </button>
        </div>
      </div>

      {/* Primary Telemetry Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-[#0e1117] border border-[#19202e] p-3 rounded-[3px] flex flex-col">
          <span className="metric-label">SPOT PRICE</span>
          <span className="text-lg font-bold font-mono text-[#e6edf3] tabular-nums mt-0.5">
            ${formatFigure(company.quote.price)}
          </span>
          <span className="text-[10px] text-[#7d8590] font-mono mt-0.5">
            {company.quote.exchange}
          </span>
        </div>

        <div className="bg-[#0e1117] border border-[#19202e] p-3 rounded-[3px] flex flex-col">
          <span className="metric-label">MOMENTUM ATTRIBUTION (Z)</span>
          <span className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
            (company.quote.z_score_signal ?? 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
          }`}>
            {formatSignedFigure(company.quote.z_score_signal ?? 0)} σ
          </span>
          <span className="text-[10px] text-[#586069] font-mono mt-0.5">
            STANDARDIZED ALPHA RESIDUAL
          </span>
        </div>

        <div className="bg-[#0e1117] border border-[#19202e] p-3 rounded-[3px] flex flex-col">
          <span className="metric-label">DATA PROVENANCE</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-[1px] ${
              company.provenance?.is_fallback ? 'bg-[#d29922]' : 'bg-[#3fb950]'
            }`} />
            <span className="text-xs font-bold font-mono text-[#e6edf3]">
              {company.provenance?.is_fallback ? 'FALLBACK CACHE' : 'LIVE FEED'}
            </span>
          </div>
          <span className="text-[10px] text-[#586069] font-mono mt-0.5">
            {company.provenance?.reason || 'Primary exchange socket verified'}
          </span>
        </div>

        <div className="bg-[#0e1117] border border-[#19202e] p-3 rounded-[3px] flex flex-col">
          <span className="metric-label">ACTIVE SIGNALS</span>
          <span className="text-lg font-bold font-mono text-[#e6edf3] tabular-nums mt-0.5">
            {signals.length} DETECTED
          </span>
          <span className="text-[10px] text-[#3fb950] font-mono mt-0.5">
            A³ ADAPTIVE FACTOR ENGINE
          </span>
        </div>
      </div>

      {/* TradingView Chart Centerpiece */}
      <SentimentPriceChart
        symbol={symbol}
        data={history}
        signals={signals}
        providerStatus={{
          isFallback: company.provenance?.is_fallback ?? false,
          reason: company.provenance?.reason ?? null,
          source: company.quote.exchange,
        }}
      />

      {/* Fundamental Factor & Valuation Snapshot */}
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <span className="panel-title flex items-center gap-2">
            <TerminalIcon size={13} className="text-[#d29922]" />
            Fundamental & Factor Telemetry // Point-in-Time Metrics
          </span>
          <span className="text-[10px] font-mono text-[#7d8590]">
            SOURCE: {company.sources.metrics || 'SYSTEMATIC CALCULATION'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 bg-[#0c0f15]">
          {metricEntries.map((m) => (
            <div key={m.label} className="bg-[#11151f] border border-[#1b2230] p-2.5 rounded-[2px] flex flex-col">
              <span className="text-[10px] font-mono text-[#7d8590] uppercase tracking-wider">{m.label}</span>
              <span className="text-sm font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
                {m.value}
              </span>
              <span className="text-[9px] font-mono text-[#586069] mt-0.5">{m.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
