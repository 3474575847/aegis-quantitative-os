'use client';

import { useState } from 'react';
import { apiUrl, formatFigure, formatPercent } from '@/lib/api';
import PortfolioVisualizer from '../components/visuals/PortfolioVisualizer';

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
    <div className="flex flex-col gap-4 pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Portfolio Lab
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Deterministic portfolio stress testing, multi-asset shocks & provider-backed valuation telemetry
          </p>
        </div>
      </div>

      {/* Visual Allocation Distribution & Macro Stress Test Matrix */}
      <PortfolioVisualizer
        holdings={holdings.map((h) => ({
          symbol: h.symbol,
          weight: parseFloat(h.weight) || 0,
        }))}
      />

      {/* Holdings Editor */}
      <section className="panel overflow-hidden">
        <div className="panel-header">
          <span className="panel-title">Portfolio Allocation & Shocks</span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-xs ${
                weightOk ? 'text-[#3fb950]' : 'text-[#e3b341]'
              }`}
            >
              Σ weights = {formatFigure(weightTotal)}
            </span>
            <button
              type="button"
              className="terminal-btn text-xs"
              onClick={normalizeWeights}
              title="Rescale all weights to sum to 1.0"
            >
              Normalize
            </button>
            <button
              type="button"
              className="terminal-btn primary text-xs"
              onClick={addHolding}
            >
              + Add Asset
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Target Weight (0–1)</th>
                <th>Scenario Shock (%)</th>
                <th className="w-10"></th>
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
                      className="terminal-input w-24 text-xs font-bold"
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
                      className="terminal-input w-24 text-xs tabular-nums"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="1"
                        value={row.shock}
                        onChange={(e) => updateHolding(i, 'shock', e.target.value)}
                        placeholder="0"
                        className={`terminal-input w-20 text-xs tabular-nums font-semibold ${
                          parseFloat(row.shock) > 0
                            ? 'text-[#3fb950]'
                            : parseFloat(row.shock) < 0
                              ? 'text-[#f85149]'
                              : 'text-[#8b949e]'
                        }`}
                      />
                      <span className="text-[#586069] text-xs font-mono">%</span>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeHolding(i)}
                      className="text-[#7d8590] hover:text-[#f85149] text-sm font-mono px-2 transition-colors"
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
          <div className="p-3 bg-[#28161a] border-t border-[#482025] text-[#f85149] text-xs font-mono">
            {error}
          </div>
        )}

        <div className="p-3.5 border-t border-[#1b2230] flex items-center justify-between flex-wrap gap-3">
          <button
            type="button"
            className="terminal-btn primary text-xs py-1.5 px-4 font-semibold"
            onClick={runScenario}
            disabled={running}
          >
            {running ? 'Executing Scenario...' : 'Execute Stress Test'}
          </button>
          {message && !error && (
            <span className="text-xs text-[#8b949e] font-mono">{message}</span>
          )}
        </div>
      </section>

      {/* Results */}
      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
              <span className="metric-label">Weighted Portfolio Impact</span>
              <strong
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  result.weighted_shock > 0
                    ? 'text-[#3fb950]'
                    : result.weighted_shock < 0
                      ? 'text-[#f85149]'
                      : 'text-[#e6edf3]'
                }`}
              >
                {result.weighted_shock >= 0 ? '+' : ''}
                {formatPercent(result.weighted_shock)}
              </strong>
              <span className="text-[11px] text-[#586069] font-mono mt-1">Σ(weight × shock)</span>
            </div>

            <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
              <span className="metric-label">Holdings Count</span>
              <strong className="text-xl font-bold font-mono text-[#e6edf3] mt-1">{result.holdings.length}</strong>
              <span className="text-[11px] text-[#8b949e] font-mono mt-1">
                {result.holdings.filter((h) => !h.is_fallback).length} live · {result.holdings.filter((h) => h.is_fallback).length} cached
              </span>
            </div>

            <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
              <span className="metric-label">Portfolio Basis</span>
              <strong className="text-xl font-bold font-mono text-[#e6edf3] mt-1">1.0000</strong>
              <span className="text-[11px] text-[#586069] font-mono mt-1">Unit starting base</span>
            </div>

            <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
              <span className="metric-label">Feed Integrity</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${
                  result.holdings.every((h) => !h.is_fallback) ? 'bg-[#3fb950]' : 'bg-[#e3b341]'
                }`} />
                <span className={`text-xl font-bold font-mono ${
                  result.holdings.every((h) => !h.is_fallback) ? 'text-[#3fb950]' : 'text-[#e3b341]'
                }`}>
                  {result.holdings.every((h) => !h.is_fallback) ? 'All Live' : 'Cached Fallback'}
                </span>
              </div>
              <span className="text-[11px] text-[#586069] font-mono mt-1">Provider provenance</span>
            </div>
          </div>

          {/* Per-holding breakdown */}
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <span className="panel-title">Holding Provenance & Attribution</span>
              <span className="text-xs font-mono text-[#3fb950]">Live Evaluated</span>
            </div>
            <div className="overflow-x-auto">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Weight</th>
                    <th className="text-right">Live Price</th>
                    <th className="text-right">Scenario Shock</th>
                    <th className="text-right">P&amp;L Contribution</th>
                    <th>Provider</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdings.map((holding) => {
                    const contribution = holding.weight * holding.scenario_shock;
                    return (
                      <tr key={holding.symbol}>
                        <td className="font-mono font-bold text-[#e6edf3] text-xs">
                          {holding.symbol}
                        </td>
                        <td className="font-mono text-xs">{formatPercent(holding.weight)}</td>
                        <td className="font-mono text-right text-xs">
                          ${formatFigure(holding.price)}
                        </td>
                        <td
                          className={`font-mono text-right text-xs font-semibold ${
                            holding.scenario_shock > 0
                              ? 'text-[#3fb950]'
                              : holding.scenario_shock < 0
                                ? 'text-[#f85149]'
                                : 'text-[#8b949e]'
                          }`}
                        >
                          {holding.scenario_shock >= 0 ? '+' : ''}
                          {formatPercent(holding.scenario_shock)}
                        </td>
                        <td
                          className={`font-mono text-right text-xs font-semibold ${
                            contribution > 0
                              ? 'text-[#3fb950]'
                              : contribution < 0
                                ? 'text-[#f85149]'
                                : 'text-[#8b949e]'
                          }`}
                        >
                          {contribution >= 0 ? '+' : ''}
                          {formatPercent(contribution)}
                        </td>
                        <td className="text-[#8b949e] text-xs">
                          {holding.provider}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5 text-xs font-mono">
                            <span className={`w-1.5 h-1.5 rounded-full ${holding.is_fallback ? 'bg-[#d29922]' : 'bg-[#3fb950]'}`} />
                            <span className={holding.is_fallback ? 'text-[#d29922]' : 'text-[#3fb950]'}>
                              {holding.is_fallback ? 'Fallback' : 'Live'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Methodology disclosure */}
          <section className="panel p-4">
            <span className="metric-label block mb-1">Methodology & Assumptions</span>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {result.methodology}
            </p>
            <p className="text-[11px] text-[#586069] font-mono mt-2">
              Weighted impact = Σ(weight_i × shock_i). Shocks are user-supplied hypothetical percentage changes evaluated against deterministic spot market data.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
