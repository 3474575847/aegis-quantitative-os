'use client';

import { useState } from 'react';
import { apiUrl, formatFigure, formatPercent } from '@/lib/api';

interface HoldingRow {
  symbol: string;
  weight: string; // string for controlled input, validated on submit
  shock: string; // percent string, e.g. "-10" means -10%
}

interface HoldingResult {
  symbol: string;
  weight: number;
  price: number;
  provider: string;
  is_fallback: boolean;
  fallback_reason?: string | null;
  scenario_shock: number;
}

interface ScenarioResult {
  portfolio_value: number;
  weighted_shock: number;
  holdings: HoldingResult[];
  methodology: string;
}

const DEFAULT_HOLDINGS: HoldingRow[] = [
  { symbol: 'AAPL', weight: '0.40', shock: '-10' },
  { symbol: 'NVDA', weight: '0.35', shock: '-15' },
  { symbol: 'BTC', weight: '0.25', shock: '20' },
];

function weightSum(rows: HoldingRow[]): number {
  return rows.reduce((acc, row) => acc + (parseFloat(row.weight) || 0), 0);
}

function validateHoldings(rows: HoldingRow[]): string | null {
  if (rows.length === 0) return 'Add at least one holding.';
  for (const row of rows) {
    if (!row.symbol.trim()) return 'All holdings must have a symbol.';
    const w = parseFloat(row.weight);
    if (isNaN(w) || w < 0) return `Weight for ${row.symbol} must be a non-negative number.`;
  }
  const total = weightSum(rows);
  if (Math.abs(total - 1.0) > 0.001) {
    return `Weights must sum to 1.000 (currently ${formatFigure(total)}).`;
  }
  return null;
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<HoldingRow[]>(DEFAULT_HOLDINGS);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function updateHolding(index: number, field: keyof HoldingRow, value: string) {
    setHoldings((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value.toUpperCase ? (field === 'symbol' ? value.toUpperCase() : value) : value,
      };
      return next;
    });
  }

  function addHolding() {
    setHoldings((prev) => [...prev, { symbol: '', weight: '0.00', shock: '0' }]);
  }

  function removeHolding(index: number) {
    setHoldings((prev) => prev.filter((_, i) => i !== index));
  }

  function normalizeWeights() {
    const total = weightSum(holdings);
    if (total <= 0) return;
    setHoldings((prev) =>
      prev.map((row) => ({
        ...row,
        weight: (Math.round(((parseFloat(row.weight) || 0) / total) * 10000) / 10000).toFixed(4),
      })),
    );
  }

  async function runScenario() {
    setError(null);
    setResult(null);
    const validationError = validateHoldings(holdings);
    if (validationError) {
      setError(validationError);
      return;
    }

    setRunning(true);
    setMessage('Fetching provider-backed quotes and calculating scenario exposure...');

    const holdingsPayload: Record<string, number> = {};
    const shocksPayload: Record<string, number> = {};
    for (const row of holdings) {
      const sym = row.symbol.trim().toUpperCase();
      holdingsPayload[sym] = parseFloat(row.weight);
      const shockPct = parseFloat(row.shock) || 0;
      if (shockPct !== 0) shocksPayload[sym] = shockPct / 100;
    }

    try {
      const response = await fetch(apiUrl('/api/portfolio/scenario'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: holdingsPayload, shocks: shocksPayload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Scenario unavailable');
      setResult(data);
      setMessage(data.methodology);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario unavailable.');
      setMessage(null);
    } finally {
      setRunning(false);
    }
  }

  const weightTotal = weightSum(holdings);
  const weightOk = Math.abs(weightTotal - 1.0) <= 0.001;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <p className="card-title">Portfolio Lab / Scenario Analysis</p>
        <h1 style={{ fontSize: '26px', marginTop: '6px' }}>Stress test a research portfolio</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '6px', maxWidth: '760px' }}>
          Enter holdings and percentage shocks. Prices are fetched live from market providers.
          Weighted impact is the sum of (weight × shock) across all holdings. This is a research
          tool — not an execution engine.
        </p>
      </header>

      {/* Holdings Editor */}
      <section className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <span className="card-title">Holdings</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: weightOk ? 'var(--accent-green)' : 'var(--accent-amber)',
              }}
            >
              Σ weights = {formatFigure(weightTotal)}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={normalizeWeights}
              title="Rescale all weights to sum to 1.0"
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              Normalize
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addHolding}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              + Add
            </button>
          </div>
        </div>

        <div className="table-container" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Weight (0–1)</th>
                <th>Scenario shock (%)</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={row.symbol}
                      onChange={(e) => updateHolding(i, 'symbol', e.target.value.toUpperCase())}
                      placeholder="e.g. AAPL"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        padding: '4px 8px',
                        width: '90px',
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={row.weight}
                      onChange={(e) => updateHolding(i, 'weight', e.target.value)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        padding: '4px 8px',
                        width: '90px',
                      }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        step="1"
                        value={row.shock}
                        onChange={(e) => updateHolding(i, 'shock', e.target.value)}
                        placeholder="0"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          color:
                            parseFloat(row.shock) > 0
                              ? 'var(--accent-green)'
                              : parseFloat(row.shock) < 0
                                ? 'var(--accent-red)'
                                : 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                          padding: '4px 8px',
                          width: '80px',
                        }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>%</span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeHolding(i)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '4px',
                      }}
                      title="Remove holding"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && (
          <p style={{ color: 'var(--accent-amber)', fontSize: '12px', marginTop: '12px' }}>
            ⚠ {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={runScenario}
            disabled={running}
          >
            {running ? 'Calculating...' : 'Run scenario'}
          </button>
          {message && !error && (
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{message}</p>
          )}
        </div>
      </section>

      {/* Results */}
      {result && (
        <>
          <div className="grid-4">
            <div className="card">
              <span className="card-title">Weighted impact</span>
              <strong
                className="card-value"
                style={{
                  color:
                    result.weighted_shock > 0
                      ? 'var(--accent-green)'
                      : result.weighted_shock < 0
                        ? 'var(--accent-red)'
                        : 'var(--text-primary)',
                }}
              >
                {result.weighted_shock >= 0 ? '+' : ''}
                {formatPercent(result.weighted_shock)}
              </strong>
              <span className="card-subtitle">Σ(weight × shock)</span>
            </div>
            <div className="card">
              <span className="card-title">Holdings</span>
              <strong className="card-value">{result.holdings.length}</strong>
              <span className="card-subtitle">
                {result.holdings.filter((h) => h.is_fallback).length} fallback
                {' · '}
                {result.holdings.filter((h) => !h.is_fallback).length} live
              </span>
            </div>
            <div className="card">
              <span className="card-title">Portfolio basis</span>
              <strong className="card-value">1.0000</strong>
              <span className="card-subtitle">Unit starting value</span>
            </div>
            <div className="card">
              <span className="card-title">Data quality</span>
              <strong
                className="card-value"
                style={{
                  color: result.holdings.every((h) => !h.is_fallback)
                    ? 'var(--accent-green)'
                    : 'var(--accent-amber)',
                }}
              >
                {result.holdings.every((h) => !h.is_fallback) ? 'ALL LIVE' : 'PARTIAL FALLBACK'}
              </strong>
              <span className="card-subtitle">Quote provenance</span>
            </div>
          </div>

          {/* Per-holding breakdown */}
          <section className="table-container">
            <div className="table-header">
              <span>Holding provenance and scenario impact</span>
              <span className="badge badge-cyan">PROVIDER-BACKED</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Weight</th>
                  <th>Live price</th>
                  <th>Scenario shock</th>
                  <th>P&amp;L contribution</th>
                  <th>Provider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.holdings.map((holding) => {
                  const contribution = holding.weight * holding.scenario_shock;
                  return (
                    <tr key={holding.symbol}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {holding.symbol}
                      </td>
                      <td className="font-mono">{formatPercent(holding.weight)}</td>
                      <td className="font-mono">
                        ${formatFigure(holding.price)}
                      </td>
                      <td
                        className="font-mono"
                        style={{
                          color:
                            holding.scenario_shock > 0
                              ? 'var(--accent-green)'
                              : holding.scenario_shock < 0
                                ? 'var(--accent-red)'
                                : 'var(--text-secondary)',
                        }}
                      >
                        {holding.scenario_shock >= 0 ? '+' : ''}
                        {formatPercent(holding.scenario_shock)}
                      </td>
                      <td
                        className="font-mono"
                        style={{
                          color:
                            contribution > 0
                              ? 'var(--accent-green)'
                              : contribution < 0
                                ? 'var(--accent-red)'
                                : 'var(--text-secondary)',
                        }}
                      >
                        {contribution >= 0 ? '+' : ''}
                        {formatPercent(contribution)}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {holding.provider}
                      </td>
                      <td>
                        <span
                          className={`badge ${holding.is_fallback ? 'badge-amber' : 'badge-green'}`}
                        >
                          {holding.is_fallback ? 'FALLBACK' : 'LIVE'}
                        </span>
                        {holding.is_fallback && holding.fallback_reason && (
                          <div
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: '10px',
                              marginTop: '2px',
                              maxWidth: '220px',
                            }}
                          >
                            {holding.fallback_reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Methodology disclosure */}
          <section className="card">
            <span className="card-title">Methodology and assumptions</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
              {result.methodology}
            </p>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '11px',
                marginTop: '8px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Weighted impact = Σ(weight_i × shock_i). Shocks are user-supplied hypothetical
              percentage changes — not predictions or model outputs. Expected returns, volatility,
              and beta are not calculated without historical price data.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
