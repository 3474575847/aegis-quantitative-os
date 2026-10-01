'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import EquityCurveChart, { EquityPoint } from '../components/EquityCurveChart';
import A3DiagnosticSuite from '../components/A3DiagnosticSuite';
import { apiUrl, formatFigure, formatPercent } from '@/lib/api';
import { ResearchIcon, RefreshIcon, PlayIcon, LayersIcon } from '../components/icons';

interface Signal {
  id: string;
  name: string;
  version: string;
  parameters?: Record<string, any>;
}

interface BacktestResult {
  observations: number;
  initial_capital: number;
  final_equity: number;
  total_return: number;
  annualized_volatility: number;
  cagr?: number;
  sharpe: number;
  sortino?: number;
  max_drawdown: number;
  calmar?: number;
  win_rate?: number;
  turnover: number;
  position_size?: number;
  holding_period?: number;
  entries?: number;
  exits?: number;
  trade_count?: number;
  transaction_cost_bps: number;
  slippage_bps: number;
  execution: string;
  annualization_factor?: number;
  bar_interval?: string;
  periods_per_year?: number;
  annualization_basis?: string;
  equity_curve: EquityPoint[];
}

interface SignalDistribution {
  BUY: number;
  SELL: number;
  WATCH: number;
  NO_TRADE: number;
  UNAVAILABLE: number;
}

interface StrategyDiagnostics {
  total_bars: number;
  eligible_bars: number;
  exposed_bars: number;
  long_exposure_pct: number;
  short_exposure_pct: number;
  cash_pct: number;
  model_version: string;
  factor_contributions: Array<{
    factor_id: string;
    name: string;
    raw_score: number;
    learned_beta: number;
    net_contribution: number;
    direction: string;
  }>;
  disagreement_vector?: any;
  quality_gates?: any;
}

interface FullBacktestPayload {
  signal_id?: string;
  signal_name?: string;
  strategy_version?: string;
  signal_source?: string;
  symbol: string;
  market_source: string;
  methodology: string;
  signal_distribution?: SignalDistribution;
  diagnostics?: StrategyDiagnostics;
  result: BacktestResult;
}

export default function ResearchPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalId, setSignalId] = useState('');
  const [symbol, setSymbol] = useState('BTC');
  const [costs, setCosts] = useState('5');
  const [slippage, setSlippage] = useState('0');
  const [payload, setPayload] = useState<FullBacktestPayload | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [message, setMessage] = useState('Select an alpha factor and run a point-in-time backtest.');
  const [running, setRunning] = useState(false);

  // Save as Experiment modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [expName, setExpName] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expTags, setExpTags] = useState('momentum, backtest');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedExpId, setSavedExpId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'BACKTEST' | 'DIAGNOSTICS'>('BACKTEST');

  useEffect(() => {
    fetch(apiUrl('/api/signals'))
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Signal[]) => {
        setSignals(data);
        if (data.length > 0) {
          setSignalId(data[0].id);
        }
      })
      .catch(() => setMessage('Signals unavailable. Verify engine connection.'));
  }, []);

  const selectedSignal = signals.find((s) => s.id === signalId);

  async function runBacktest() {
    if (!signalId) return;
    setRunning(true);
    setResult(null);
    setPayload(null);
    setSavedExpId(null);
    setMessage('Evaluating point-in-time signals dynamically across market candles...');
    try {
      const response = await fetch(
        apiUrl(`/api/backtests/${signalId}?symbol=${encodeURIComponent(symbol)}&transaction_cost_bps=${costs}&slippage_bps=${slippage}`),
        { method: 'POST' },
      );
      const payloadRes = await response.json();
      if (!response.ok) throw new Error(payloadRes.detail || 'Backtest unavailable');
      setPayload(payloadRes);
      setResult(payloadRes.result);
      setSource(payloadRes.market_source);
      setMessage(payloadRes.methodology);
      if (selectedSignal) {
        setExpName(`${selectedSignal.name} (${symbol}) - ${new Date().toISOString().slice(0, 10)}`);
        setExpDescription(
          `Point-in-time backtest of ${selectedSignal.name} on ${symbol} with ${costs}bps cost & ${slippage}bps slippage.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backtest unavailable.');
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveExperiment(e: React.FormEvent) {
    e.preventDefault();
    if (!result || !expName.trim()) return;
    setSaving(true);
    setSaveError(null);

    const tagsList = expTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch(apiUrl('/api/experiments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: expName.trim(),
          description: expDescription.trim() || null,
          signal_id: signalId,
          symbol: symbol.toUpperCase().trim(),
          transaction_cost_bps: parseFloat(costs) || 0,
          slippage_bps: parseFloat(slippage) || 0,
          tags: tagsList,
          initial_result: result,
          methodology: message,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to save experiment');

      setSavedExpId(data.experiment_id);
      setShowSaveModal(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Research Lab
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Deterministic next-bar execution, explicit transaction cost sensitivity & point-in-time invariant enforcement
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#090c10] border border-[#1b2230] rounded-[2px] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('BACKTEST')}
              className={`px-3 py-1 text-xs font-mono rounded-[1px] transition-colors ${
                viewMode === 'BACKTEST'
                  ? 'bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]'
                  : 'text-[#7d8590] hover:text-[#e6edf3] border border-transparent'
              }`}
            >
              Backtest Workstation
            </button>
            <button
              type="button"
              onClick={() => setViewMode('DIAGNOSTICS')}
              className={`px-3 py-1 text-xs font-mono rounded-[1px] transition-colors ${
                viewMode === 'DIAGNOSTICS'
                  ? 'bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]'
                  : 'text-[#7d8590] hover:text-[#e6edf3] border border-transparent'
              }`}
            >
              A³ Factor Diagnostics
            </button>
          </div>

          {result && viewMode === 'BACKTEST' && (
            <button
              type="button"
              onClick={() => setShowSaveModal(true)}
              className="terminal-btn primary text-xs"
            >
              <span>+ Save Experiment</span>
            </button>
          )}
        </div>
      </div>

      {savedExpId && (
        <div className="px-3.5 py-2 bg-[#102419] border border-[#235338] rounded-[2px] flex items-center justify-between text-xs font-mono">
          <span className="text-[#3fb950]">
            Experiment archived into version-controlled registry: ID {savedExpId.slice(0, 8)}
          </span>
          <Link href="/experiments" className="text-[#e6edf3] hover:underline">
            View in Registry →
          </Link>
        </div>
      )}

      {/* View Mode 1: A3 Empirical Diagnostic Suite */}
      {viewMode === 'DIAGNOSTICS' && (
        <A3DiagnosticSuite activeSymbol={symbol} />
      )}

      {/* View Mode 2: Backtest Workstation */}
      {viewMode === 'BACKTEST' && (
        <>
          {/* Configuration Form */}
          <div className="panel p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-mono">
              <div className="flex flex-col gap-1">
                <span className="metric-label">Factor Strategy</span>
                <select
                  value={signalId}
                  onChange={(e) => setSignalId(e.target.value)}
                  className="terminal-input w-full"
                >
                  {signals.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (v{s.version})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="metric-label">Instrument Symbol</span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. BTC, ETH"
                  className="terminal-input w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="metric-label">Execution Fee (bps)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={costs}
                  onChange={(e) => setCosts(e.target.value)}
                  className="terminal-input w-full tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="metric-label">Slippage (bps)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="terminal-input w-full tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-1 justify-end">
                <button
                  type="button"
                  onClick={runBacktest}
                  disabled={running || !signalId}
                  className="terminal-btn primary h-[29px] w-full"
                >
                  {running ? 'Evaluating...' : 'Execute Backtest'}
                </button>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-[#1b2230] flex items-center justify-between text-xs font-mono text-[#8b949e]">
              <span>Next-bar close execution (1-bar lag)</span>
              <span className="truncate max-w-[600px] text-[#8b949e]">{message}</span>
            </div>
          </div>

      {/* Results View */}
      {result && (
        <>
          {/* Equity Curve & Drawdown Chart */}
          <EquityCurveChart
            data={result.equity_curve || []}
            title={`${selectedSignal?.name || 'Factor'} on ${symbol} — Equity Curve`}
          />

          {/* Institutional Metrics Grid (Tabular Numerals) */}
          <div className="panel p-3">
            <div className="text-[10px] uppercase font-bold text-[#7d8590] tracking-wider mb-2 font-mono">
              Institutional Risk & Return Telemetry
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Sharpe Ratio</div>
                <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  result.sharpe >= 1.0 ? 'text-[#3fb950]' : result.sharpe >= 0 ? 'text-[#e6edf3]' : 'text-[#f85149]'
                }`}>
                  {formatFigure(result.sharpe)}
                </div>
                <div className="metric-context">RF = 0.0%</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Sortino Ratio</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#e6edf3] mt-0.5">
                  {result.sortino != null ? formatFigure(result.sortino) : '—'}
                </div>
                <div className="metric-context">DOWNSIDE VOL</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">CAGR</div>
                <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  (result.cagr ?? 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
                }`}>
                  {result.cagr != null ? formatPercent(result.cagr) : '—'}
                </div>
                <div className="metric-context">ANNUALIZED</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Max Drawdown</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#f85149] mt-0.5">
                  {formatPercent(result.max_drawdown)}
                </div>
                <div className="metric-context">PEAK-TO-TROUGH</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Calmar Ratio</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#e6edf3] mt-0.5">
                  {result.calmar != null ? formatFigure(result.calmar) : '—'}
                </div>
                <div className="metric-context">CAGR / |MAX DD|</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Win Rate</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#e6edf3] mt-0.5">
                  {result.win_rate != null ? formatPercent(result.win_rate) : '—'}
                </div>
                <div className="metric-context">ACTIVE BARS</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Ann. Volatility</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#e6edf3] mt-0.5">
                  {formatPercent(result.annualized_volatility)}
                </div>
                <div className="metric-context">OOS REALIZED</div>
              </div>

              <div className="bg-[#131722] border border-[#1b2230] p-2 rounded-[2px]">
                <div className="metric-label">Net Return</div>
                <div className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  result.total_return >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
                }`}>
                  {formatPercent(result.total_return)}
                </div>
                <div className="metric-context">NET OF COSTS</div>
              </div>
            </div>
          </div>

          {/* Strategy Signal Distribution & Diagnostics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {payload?.signal_distribution && (
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <span className="panel-title">Signal State Allocation</span>
                  <span className="text-[10px] font-mono text-[#7d8590]">
                    BARS: {result.observations}
                  </span>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-5 gap-2 text-center font-mono">
                    <div className="bg-[#131722] p-2 rounded-[2px] border border-[#1b2230]">
                      <div className="text-[10px] text-[#3fb950] font-bold">LONG</div>
                      <div className="text-base font-bold text-[#e6edf3] mt-0.5 tabular-nums">
                        {payload.signal_distribution.BUY}
                      </div>
                    </div>
                    <div className="bg-[#131722] p-2 rounded-[2px] border border-[#1b2230]">
                      <div className="text-[10px] text-[#f85149] font-bold">SHORT</div>
                      <div className="text-base font-bold text-[#e6edf3] mt-0.5 tabular-nums">
                        {payload.signal_distribution.SELL}
                      </div>
                    </div>
                    <div className="bg-[#131722] p-2 rounded-[2px] border border-[#1b2230]">
                      <div className="text-[10px] text-[#d29922] font-bold">WATCH</div>
                      <div className="text-base font-bold text-[#e6edf3] mt-0.5 tabular-nums">
                        {payload.signal_distribution.WATCH}
                      </div>
                    </div>
                    <div className="bg-[#131722] p-2 rounded-[2px] border border-[#1b2230]">
                      <div className="text-[10px] text-[#7d8590] font-bold">NEUTRAL</div>
                      <div className="text-base font-bold text-[#e6edf3] mt-0.5 tabular-nums">
                        {payload.signal_distribution.NO_TRADE}
                      </div>
                    </div>
                    <div className="bg-[#131722] p-2 rounded-[2px] border border-[#1b2230]">
                      <div className="text-[10px] text-[#586069] font-bold">N/A</div>
                      <div className="text-base font-bold text-[#e6edf3] mt-0.5 tabular-nums">
                        {payload.signal_distribution.UNAVAILABLE}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {payload?.diagnostics && (
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <span className="panel-title">Exposure Breakdown</span>
                  <span className="text-[10px] font-mono text-[#7d8590]">
                    TURNOVER: {formatFigure(result.turnover)}x
                  </span>
                </div>
                <div className="p-3 text-xs font-mono flex flex-col gap-2">
                  <div className="flex justify-between py-1 border-b border-[#19202e]">
                    <span className="text-[#7d8590]">Long Exposure:</span>
                    <span className="font-bold text-[#3fb950] tabular-nums">
                      {formatPercent(payload.diagnostics.long_exposure_pct)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#19202e]">
                    <span className="text-[#7d8590]">Short Exposure:</span>
                    <span className="font-bold text-[#f85149] tabular-nums">
                      {formatPercent(payload.diagnostics.short_exposure_pct)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#7d8590]">Cash / Unexposed:</span>
                    <span className="font-bold text-[#8b949e] tabular-nums">
                      {formatPercent(payload.diagnostics.cash_pct)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
        </>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1117] border border-[#222c3f] rounded-[3px] p-4 max-w-md w-full font-mono">
            <div className="text-xs font-bold uppercase tracking-wider text-[#e6edf3] mb-3 pb-2 border-b border-[#19202e]">
              Archive Backtest to Experiment Registry
            </div>
            {saveError && (
              <div className="mb-3 p-2 bg-[#28161a] border border-[#482025] text-[#f85149] text-xs">
                {saveError}
              </div>
            )}
            <form onSubmit={handleSaveExperiment} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[10px] text-[#7d8590] uppercase block mb-1">
                  Experiment Name
                </label>
                <input
                  type="text"
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  className="terminal-input w-full"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-[#7d8590] uppercase block mb-1">
                  Description
                </label>
                <textarea
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="terminal-input w-full h-16 resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#7d8590] uppercase block mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={expTags}
                  onChange={(e) => setExpTags(e.target.value)}
                  className="terminal-input w-full"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[#19202e]">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="terminal-btn"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="terminal-btn primary"
                >
                  {saving ? 'SAVING...' : 'ARCHIVE RUN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
