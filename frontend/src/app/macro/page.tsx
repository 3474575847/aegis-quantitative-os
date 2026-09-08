'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';

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
    <div className="card" style={{ gap: '8px' }}>
      <span className="card-title">{label}</span>
      <span className="card-value" style={{ fontSize: '22px', color: indicator ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {indicator ? formatValue(indicator.value, unit) : 'N/A'}
      </span>
      <span className="card-subtitle">Observation: {formatDate(indicator?.observation_date)}</span>
      <span className="card-subtitle font-mono" style={{ fontSize: '10px' }}>PIT available: {formatDate(indicator?.available_at)}</span>
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
        fetch(apiUrl('/api/macro/yields')),
        fetch(apiUrl('/api/macro/regime')),
        ...SERIES.map((item) => fetch(apiUrl(`/api/macro/series/${item.id}?limit=60`))),
      ]);
      if (![yieldResponse, regimeResponse, ...seriesResponses].every((response) => response.ok)) {
        throw new Error('Macro API returned an error');
      }
      const [yieldData, regimeData, ...seriesData] = await Promise.all([
        yieldResponse.json() as Promise<YieldSnapshot>,
        regimeResponse.json() as Promise<Regime>,
        ...seriesResponses.map((response) => response.json() as Promise<MacroSeries>),
      ]);
      setYields(yieldData);
      setRegime(regimeData);
      setSeries(Object.fromEntries(seriesData.map((data) => [data.series_id, data])));
    } catch (loadError) {
      console.error('Macro observatory load error', loadError);
      setError('Cannot reach macro services. Confirm the API and worker are running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadObservatory();
  }, []);

  const regimeColor = regimeTone(regime?.regime ?? 'UNKNOWN');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Macro Observatory</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px', maxWidth: '720px' }}>
            Point-in-time FRED observations for rates, inflation, labor, and credit conditions. Directional regime labels are deterministic views over stored history.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => void loadObservatory()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', border: '1px solid var(--accent-red)', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', borderRadius: '6px', fontSize: '12px' }}>{error}</div>}

      <div className="grid-4">
        <div className="card" style={{ borderColor: regimeColor }}>
          <span className="card-title">Current regime</span>
          <span className="card-value" style={{ color: regimeColor, fontSize: '22px' }}>{regime?.regime ?? 'UNKNOWN'}</span>
          <span className="card-subtitle">Confidence: {regime?.confidence ?? 'UNAVAILABLE'}</span>
          <span className="card-subtitle font-mono" style={{ fontSize: '10px' }}>Classified: {formatDate(regime?.classified_at)}</span>
        </div>
        <div className="card">
          <span className="card-title">10Y − 2Y slope</span>
          <span className="card-value" style={{ color: yields?.is_inverted ? 'var(--accent-red)' : 'var(--accent-green)', fontSize: '22px' }}>{formatValue(yields?.slope_bps, ' bps')}</span>
          <span className="card-subtitle">{yields?.is_inverted ? 'Inverted curve' : 'Normal curve'}</span>
          <span className="card-subtitle font-mono" style={{ fontSize: '10px' }}>Retrieved: {formatDate(yields?.retrieved_at)}</span>
        </div>
        <div className="card">
          <span className="card-title">Growth direction</span>
          <span className="card-value" style={{ color: regime?.growth_direction === 'DOWN' ? 'var(--accent-red)' : 'var(--accent-cyan)', fontSize: '22px' }}>{regime?.growth_direction ?? 'UNKNOWN'}</span>
          <span className="card-subtitle">UNRATE 3M change: {formatValue(regime?.growth_change_3m)}</span>
        </div>
        <div className="card">
          <span className="card-title">Inflation direction</span>
          <span className="card-value" style={{ color: regime?.inflation_direction === 'UP' ? 'var(--accent-red)' : 'var(--accent-cyan)', fontSize: '22px' }}>{regime?.inflation_direction ?? 'UNKNOWN'}</span>
          <span className="card-subtitle">CPI 3M change: {formatValue(regime?.inflation_change_3m)}</span>
        </div>
      </div>

      <div className="grid-4">
        <IndicatorCard indicator={yields?.dgs10 ?? null} label="10Y Treasury" unit="%" />
        <IndicatorCard indicator={yields?.dgs2 ?? null} label="2Y Treasury" unit="%" />
        <IndicatorCard indicator={yields?.fedfunds ?? null} label="Fed funds" unit="%" />
        <IndicatorCard indicator={yields?.credit_spread ?? null} label="High-yield spread" unit="%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', alignItems: 'start' }}>
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Stored macro history</span>
            <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>FRED / PIT snapshots</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SERIES.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 110px', gap: '16px', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div className="font-mono" style={{ fontSize: '12px', color: item.color }}>{item.id}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{item.label}</div>
                </div>
                <TrendPlot series={series[item.id]} color={item.color} />
                <div style={{ textAlign: 'right' }}>
                  <div className="font-mono" style={{ fontSize: '12px' }}>{formatValue(series[item.id]?.datapoints.at(-1)?.value)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{series[item.id]?.count ?? 0} points</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Regime methodology</span>
            <span className="badge badge-cyan">{regime?.confidence ?? 'N/A'}</span>
          </div>
          <p style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{regime?.methodology ?? 'Awaiting stored UNRATE and CPIAUCSL observations.'}</p>
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Growth indicator</span><span className="font-mono">{formatValue(regime?.growth_indicator?.value, '%')}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>Inflation indicator</span><span className="font-mono">{formatValue(regime?.inflation_indicator?.value)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>PIT source</span><span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>FRED / Aegis</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
