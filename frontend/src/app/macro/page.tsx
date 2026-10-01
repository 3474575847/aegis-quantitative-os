'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import MacroRegimeQuadrant from '../components/visuals/MacroRegimeQuadrant';
import YieldCurveChart from '../components/visuals/YieldCurveChart';

type SeriesPoint = {
  observation_date: string;
  value: number | null;
  available_at: string;
};

type MacroSeries = {
  series_id: string;
  count: number;
  source: string;
  datapoints: SeriesPoint[];
};

type Indicator = {
  observation_date: string;
  value: number | null;
  available_at: string;
  provider: string;
  unit: string;
};

type YieldSnapshot = {
  dgs10: Indicator | null;
  dgs2: Indicator | null;
  fedfunds: Indicator | null;
  credit_spread: Indicator | null;
  slope_bps: number | null;
  is_inverted: boolean;
  retrieved_at: string;
};

type Regime = {
  regime: string;
  growth_direction: string;
  inflation_direction: string;
  growth_indicator: Indicator | null;
  inflation_indicator: Indicator | null;
  growth_change_3m: number | null;
  inflation_change_3m: number | null;
  confidence: string;
  methodology: string;
  classified_at: string;
};

const SERIES = [
  { id: 'DGS10', label: '10Y Treasury', color: 'var(--accent-cyan)' },
  { id: 'DGS2', label: '2Y Treasury', color: 'var(--accent-amber)' },
  { id: 'FEDFUNDS', label: 'Fed funds', color: 'var(--accent-green)' },
  { id: 'BAMLH0A0HYM2', label: 'High-yield spread', color: 'var(--accent-red)' },
];

function formatValue(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return 'UNAVAILABLE';
  return `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(value)}${suffix}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return 'UNAVAILABLE';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function regimeTone(regime: string): string {
  if (regime === 'GOLDILOCKS') return 'var(--accent-green)';
  if (regime === 'REFLATION') return 'var(--accent-cyan)';
  if (regime === 'STAGFLATION') return 'var(--accent-red)';
  if (regime === 'DEFLATION') return 'var(--accent-amber)';
  return 'var(--text-muted)';
}

function TrendPlot({ series, color }: { series: MacroSeries | undefined; color: string }) {
  const points = (series?.datapoints ?? []).filter((point) => point.value != null);
  if (points.length < 2) {
    return <div style={{ height: '72px', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>Awaiting observations</div>;
  }

  const values = points.map((point) => point.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 66 - ((value - min) / range) * 56;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 72" preserveAspectRatio="none" style={{ width: '100%', height: '72px', overflow: 'visible' }} role="img" aria-label={`${series?.series_id ?? 'Macro'} trend`}>
      <path d="M 0 66 L 100 66" stroke="var(--border-color)" strokeWidth="0.6" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function IndicatorCard({ indicator, label, unit }: { indicator: Indicator | null; label: string; unit: string }) {
  return (
    <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
      <span className="metric-label">{label}</span>
      <span className={`text-xl font-bold font-mono tabular-nums mt-1 ${indicator ? 'text-[#e6edf3]' : 'text-[#586069]'}`}>
        {indicator ? formatValue(indicator.value, unit) : 'N/A'}
      </span>
      <span className="text-[11px] text-[#8b949e] font-mono mt-1">Obs: {formatDate(indicator?.observation_date)}</span>
      <span className="text-[10px] text-[#586069] font-mono">PIT: {formatDate(indicator?.available_at)}</span>
    </div>
  );
}

export default function MacroObservatoryPage() {
  const [yields, setYields] = useState<YieldSnapshot | null>(null);
  const [regime, setRegime] = useState<Regime | null>(null);
  const [series, setSeries] = useState<Record<string, MacroSeries>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadObservatory() {
    setLoading(true);
    setError(null);
    try {
      const [yieldResponse, regimeResponse, ...seriesResponses] = await Promise.all([
        fetch(apiUrl('/api/macro/yields')).catch(() => fetch(apiUrl('/api/macro/yield-curve'))),
        fetch(apiUrl('/api/macro/regime')),
        ...SERIES.map((item) => fetch(apiUrl(`/api/macro/series/${item.id}?limit=60`))),
      ]);

      if (yieldResponse.ok) {
        const yieldData = (await yieldResponse.json()) as YieldSnapshot;
        setYields(yieldData);
      }

      if (regimeResponse.ok) {
        const regimeData = (await regimeResponse.json()) as Regime;
        setRegime(regimeData);
      }

      const seriesMap: Record<string, MacroSeries> = {};
      for (let i = 0; i < seriesResponses.length; i++) {
        const resp = seriesResponses[i];
        const item = SERIES[i];
        if (resp && resp.ok) {
          try {
            const data = (await resp.json()) as MacroSeries;
            seriesMap[data.series_id || item.id] = data;
          } catch (e) {
            console.warn(`Failed to parse macro series ${item.id}`, e);
          }
        }
      }
      setSeries(seriesMap);

      if (!yieldResponse.ok && !regimeResponse.ok) {
        throw new Error('Macro API returned an error');
      }
    } catch (loadError) {
      console.error('Macro observatory load error', loadError);
      setError('Cannot reach macro services. Confirm the API is running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadObservatory();
  }, []);

  const regimeColor = regimeTone(regime?.regime ?? 'UNKNOWN');

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Macro Observatory
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Point-in-time FRED observations for interest rates, inflation, labor & directional regime classification
          </p>
        </div>
        <button className="terminal-btn text-xs" onClick={() => void loadObservatory()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh Telemetry'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#28161a] border border-[#482025] text-[#f85149] text-xs font-mono rounded-[2px]">
          {error}
        </div>
      )}

      {/* Regime Classification Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Macro Regime</span>
          <span className="text-xl font-bold font-mono mt-1" style={{ color: regimeColor }}>
            {regime?.regime ?? 'UNKNOWN'}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono mt-1">Confidence: {regime?.confidence ?? 'UNAVAILABLE'}</span>
          <span className="text-[10px] text-[#586069] font-mono">Classified: {formatDate(regime?.classified_at)}</span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">10Y − 2Y Yield Slope</span>
          <span className={`text-xl font-bold font-mono tabular-nums mt-1 ${yields?.is_inverted ? 'text-[#f85149]' : 'text-[#3fb950]'}`}>
            {formatValue(yields?.slope_bps, ' bps')}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono mt-1">{yields?.is_inverted ? 'Inverted Curve (Recession Warning)' : 'Normal Slope'}</span>
          <span className="text-[10px] text-[#586069] font-mono">Retrieved: {formatDate(yields?.retrieved_at)}</span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Growth Direction</span>
          <span className={`text-xl font-bold font-mono mt-1 ${regime?.growth_direction === 'DOWN' ? 'text-[#f85149]' : 'text-[#58a6ff]'}`}>
            {regime?.growth_direction ?? 'UNKNOWN'}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono mt-1">UNRATE 3M Δ: {formatValue(regime?.growth_change_3m)}</span>
          <span className="text-[10px] text-[#586069] font-mono">Labor momentum</span>
        </div>

        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Inflation Direction</span>
          <span className={`text-xl font-bold font-mono mt-1 ${regime?.inflation_direction === 'UP' ? 'text-[#f85149]' : 'text-[#58a6ff]'}`}>
            {regime?.inflation_direction ?? 'UNKNOWN'}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono mt-1">CPI 3M Δ: {formatValue(regime?.inflation_change_3m)}</span>
          <span className="text-[10px] text-[#586069] font-mono">Price trend</span>
        </div>
      </div>

      {/* Rates & Credit Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndicatorCard indicator={yields?.dgs10 ?? null} label="10Y Treasury" unit="%" />
        <IndicatorCard indicator={yields?.dgs2 ?? null} label="2Y Treasury" unit="%" />
        <IndicatorCard indicator={yields?.fedfunds ?? null} label="Fed Funds Target" unit="%" />
        <IndicatorCard indicator={yields?.credit_spread ?? null} label="High-Yield Spread" unit="%" />
      </div>

      {/* Visual Cockpit: Regime Quadrant & Yield Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <MacroRegimeQuadrant
          currentRegime={regime?.regime ?? 'GOLDILOCKS'}
          growthChange={regime?.growth_change_3m}
          inflationChange={regime?.inflation_change_3m}
          confidence={regime?.confidence}
        />
        <YieldCurveChart
          dgs10={yields?.dgs10?.value}
          dgs2={yields?.dgs2?.value}
          fedfunds={yields?.fedfunds?.value}
          slopeBps={yields?.slope_bps}
          isInverted={yields?.is_inverted ?? false}
        />
      </div>

      {/* History & Methodology Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        <div className="lg:col-span-8 panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">Stored Macro Time-Series History</span>
            <span className="text-xs font-mono text-[#8b949e]">FRED / PIT Snapshots</span>
          </div>
          <div className="flex flex-col divide-y divide-[#1b2230]">
            {SERIES.map((item) => (
              <div key={item.id} className="grid grid-cols-12 gap-4 items-center p-3.5">
                <div className="col-span-4">
                  <div className="font-mono text-xs font-bold" style={{ color: item.color }}>{item.id}</div>
                  <div className="text-xs text-[#8b949e] mt-0.5">{item.label}</div>
                </div>
                <div className="col-span-5">
                  <TrendPlot series={series[item.id]} color={item.color} />
                </div>
                <div className="col-span-3 text-right">
                  <div className="font-mono text-sm font-bold text-[#e6edf3] tabular-nums">
                    {formatValue(series[item.id]?.datapoints.at(-1)?.value)}
                  </div>
                  <div className="text-[10px] text-[#586069] font-mono mt-0.5">
                    {series[item.id]?.count ?? 0} points
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 panel p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center pb-2 border-b border-[#1b2230]">
            <span className="metric-label">Regime Methodology</span>
            <span className="text-xs font-mono text-[#58a6ff]">{regime?.confidence ?? 'N/A'}</span>
          </div>
          <p className="text-xs text-[#8b949e] leading-relaxed">
            {regime?.methodology ?? 'Awaiting stored UNRATE and CPIAUCSL observations.'}
          </p>
          <div className="border-t border-[#1b2230] pt-3 flex flex-col gap-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-[#586069]">Growth Indicator</span>
              <span className="text-[#e6edf3]">{formatValue(regime?.growth_indicator?.value, '%')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#586069]">Inflation Indicator</span>
              <span className="text-[#e6edf3]">{formatValue(regime?.inflation_indicator?.value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#586069]">Provenance</span>
              <span className="text-[#58a6ff]">FRED / Aegis PIT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
