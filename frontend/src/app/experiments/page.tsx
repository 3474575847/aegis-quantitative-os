'use client';

import React, { useCallback, useEffect, useState } from 'react';
import EquityCurveChart, { EquityPoint } from '../components/EquityCurveChart';
import { apiUrl, formatFigure, formatPercent } from '@/lib/api';

interface ExperimentSummary {
  experiment_id: string;
  name: string;
  description: string | null;
  signal_id: string | null;
  symbol: string;
  transaction_cost_bps: number;
  slippage_bps: number;
  tags: string[];
  created_at: string | null;
  run_count: number;
  success_rate: number;
  latest_status: string;
  latest_run_id: string | null;
  best_sharpe: number | null | undefined;
}

interface RunRecord {
  run_id: string;
  experiment_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  result: {
    observations?: number;
    initial_capital?: number;
    final_equity?: number;
    total_return?: number;
    annualized_volatility?: number;
    cagr?: number;
    sharpe?: number;
    sortino?: number;
    max_drawdown?: number;
    calmar?: number;
    win_rate?: number;
    turnover?: number;
    transaction_cost_bps?: number;
    slippage_bps?: number;
    execution?: string;
    equity_curve?: EquityPoint[];
  } | null;
  signal_id?: string | null;
  symbol?: string;
  methodology?: string | null;
  market_source?: string | null;
}

interface SignalItem {
  id: string;
  name: string;
  version: string;
}

interface ComparisonItem {
  experiment_id: string;
  name: string;
  description: string | null;
  signal_id: string | null;
  signal_name: string | null;
  symbol: string;
  transaction_cost_bps: number;
  slippage_bps: number;
  tags: string[];
  created_at: string | null;
  run_count: number;
  latest_status: string;
  metrics: Record<string, any> | null;
  methodology: string | null;
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [selectedExp, setSelectedExp] = useState<ExperimentSummary | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Multi-select for Compare
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonItem[] | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSignalId, setCreateSignalId] = useState('');
  const [createSymbol, setCreateSymbol] = useState('BTC');
  const [createCosts, setCreateCosts] = useState('5.0');
  const [createSlippage, setCreateSlippage] = useState('0.0');
  const [createTags, setCreateTags] = useState('quant, baseline');

  // Clone Modal State
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneSymbol, setCloneSymbol] = useState('');
  const [cloneCosts, setCloneCosts] = useState('');
  const [cloneSlippage, setCloneSlippage] = useState('');

  const fetchRunsForExperiment = useCallback(async (expId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/experiments/${expId}/runs`));
      if (res.ok) {
        const runData = await res.json();
        setRuns(runData);
        if (runData.length > 0) {
          setSelectedRun(runData[0]);
        } else {
          setSelectedRun(null);
        }
      }
    } catch (e) {
      console.error('Error fetching runs', e);
    }
  }, []);

  const selectExperiment = useCallback(
    (exp: ExperimentSummary) => {
      setSelectedExp(exp);
      fetchRunsForExperiment(exp.experiment_id);
    },
    [fetchRunsForExperiment],
  );

  const fetchExperiments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/experiments'));
      if (res.ok) {
        const data = await res.json();
        setExperiments(data);
        if (data.length > 0) {
          selectExperiment(data[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching experiments', e);
    } finally {
      setLoading(false);
    }
  }, [selectExperiment]);

  useEffect(() => {
    fetchExperiments();
    fetch(apiUrl('/api/signals'))
      .then((r) => r.json())
      .then((data) => {
        setSignals(data);
        if (data.length > 0) setCreateSignalId(data[0].id);
      })
      .catch(() => {});
  }, [fetchExperiments]);

  // Run Experiment Handler
  const handleRunExperiment = async (expId: string) => {
    setActionLoading(true);
    setActionMessage('Executing backtest run against real historical candles...');
    try {
      const res = await fetch(apiUrl(`/api/experiments/${expId}/run`), {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to execute experiment run');

      setActionMessage(`✓ Run completed! Sharpe: ${data.result?.sharpe != null ? formatFigure(data.result.sharpe) : 'N/A'}`);
      await fetchRunsForExperiment(expId);
      // Refresh experiment summaries to update run counts and Sharpe
      const expRes = await fetch(apiUrl('/api/experiments'));
      if (expRes.ok) {
        const expData: ExperimentSummary[] = await expRes.json();
        setExperiments(expData);
        const updated = expData.find((e) => e.experiment_id === expId);
        if (updated) setSelectedExp(updated);
      }
    } catch (err) {
      setActionMessage(`Run failed: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Create Experiment Handler
  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const tagsList = createTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(apiUrl('/api/experiments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || null,
          signal_id: createSignalId || null,
          symbol: createSymbol.toUpperCase().trim(),
          transaction_cost_bps: parseFloat(createCosts) || 0,
          slippage_bps: parseFloat(createSlippage) || 0,
          tags: tagsList,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create experiment');
      }
      setShowCreateModal(false);
      setCreateName('');
      setCreateDesc('');
      await fetchExperiments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Clone Experiment Handler
  const handleCloneExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExp) return;
    setActionLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('name', cloneName.trim());
      if (cloneSymbol.trim()) query.set('symbol', cloneSymbol.toUpperCase().trim());
      if (cloneCosts.trim()) query.set('transaction_cost_bps', cloneCosts.trim());
      if (cloneSlippage.trim()) query.set('slippage_bps', cloneSlippage.trim());

      const res = await fetch(
        apiUrl(`/api/experiments/${selectedExp.experiment_id}/clone?${query.toString()}`),
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to clone experiment');
      }
      setShowCloneModal(false);
      await fetchExperiments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Compare Modal
  const handleOpenCompare = async () => {
    if (selectedForCompare.length === 0) return;
    try {
      const res = await fetch(apiUrl('/api/experiments/compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_ids: selectedForCompare }),
      });
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data.experiments);
        setShowCompareModal(true);
      }
    } catch (e) {
      console.error('Comparison request failed', e);
    }
  };

  const toggleCompareSelect = (expId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForCompare((prev) =>
      prev.includes(expId) ? prev.filter((id) => id !== expId) : [...prev, expId],
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Experiment Registry
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Version-controlled hypothesis repository, deterministic run history & institutional factor comparison
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedForCompare.length >= 2 && (
            <button
              className="terminal-btn text-xs text-[#58a6ff] border-[#58a6ff]/40"
              onClick={handleOpenCompare}
            >
              Compare Selected ({selectedForCompare.length}) →
            </button>
          )}
          <button
            className="terminal-btn primary text-xs"
            onClick={() => setShowCreateModal(true)}
          >
            + New Experiment
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Total Experiments</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">{experiments.length}</span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Versioned configurations</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Executed Runs</span>
          <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
            {experiments.reduce((acc, curr) => acc + curr.run_count, 0)}
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Point-in-time audit ledger</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Best Strategy Sharpe</span>
          <span className="text-xl font-bold font-mono text-[#3fb950] tabular-nums mt-1">
            {formatFigure(Math.max(...experiments.map((e) => e.best_sharpe || 0), 0))}
          </span>
          <span className="text-[11px] text-[#586069] font-mono mt-1">Highest risk-adjusted alpha</span>
        </div>
        <div className="bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px] flex flex-col justify-between">
          <span className="metric-label">Execution Mode</span>
          <span className="text-xl font-bold font-mono text-[#58a6ff] mt-1">
            Next-Bar Close
          </span>
          <span className="text-[11px] text-[#3fb950] font-mono mt-1">Zero lookahead bias</span>
        </div>
      </div>

      {/* Main Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Experiment Definitions Table */}
        <div className="lg:col-span-5 panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">Experiment Definitions</span>
            <span className="text-xs font-mono text-[#8b949e]">
              {selectedForCompare.length} selected
            </span>
          </div>
          <div className="overflow-x-auto max-h-[660px]">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th style={{ width: '28px' }}></th>
                  <th>Experiment</th>
                  <th>Symbol</th>
                  <th>Runs</th>
                  <th>Sharpe</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-[#8b949e] text-xs font-mono">
                      Loading experiments…
                    </td>
                  </tr>
                ) : experiments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[#8b949e] text-xs font-mono">
                      No experiments found. Create one to begin.
                    </td>
                  </tr>
                ) : (
                  experiments.map((exp) => {
                    const isSelected = selectedExp?.experiment_id === exp.experiment_id;
                    const isChecked = selectedForCompare.includes(exp.experiment_id);
                    return (
                      <tr
                        key={exp.experiment_id}
                        onClick={() => selectExperiment(exp)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#192231]/80' : 'hover:bg-[#121722]'
                        }`}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            onClick={(e) => toggleCompareSelect(exp.experiment_id, e)}
                            className="rounded-[2px] accent-[#d29922]"
                          />
                        </td>
                        <td>
                          <div className={`font-mono text-xs font-semibold ${isSelected ? 'text-[#58a6ff]' : 'text-[#e6edf3]'}`}>
                            {exp.name}
                          </div>
                          <div className="text-[10px] text-[#586069] truncate max-w-[150px] mt-0.5">
                            {exp.description || 'No description'}
                          </div>
                        </td>
                        <td>
                          <span className="px-1.5 py-0.5 rounded-[2px] bg-[#14233a] border border-[#1f3a60] text-[10px] text-[#58a6ff] font-mono">
                            {exp.symbol}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-xs text-[#e6edf3]">{exp.run_count}</span>
                        </td>
                        <td>
                          <span
                            className="font-mono text-xs font-semibold tabular-nums"
                            style={{
                              color:
                                exp.best_sharpe != null && exp.best_sharpe >= 1.0
                                  ? '#3fb950'
                                  : exp.best_sharpe != null && exp.best_sharpe >= 0
                                    ? '#58a6ff'
                                    : '#8b949e',
                            }}
                          >
                            {exp.best_sharpe != null ? formatFigure(exp.best_sharpe) : '—'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10px] uppercase ${
                              exp.latest_status === 'COMPLETED'
                                ? 'bg-[#12281e] text-[#3fb950] border border-[#235537]'
                                : exp.latest_status === 'RUNNING'
                                  ? 'bg-[#14233a] text-[#58a6ff] border border-[#1f3a60]'
                                  : 'bg-[#2b2111] text-[#d29922] border border-[#594217]'
                            }`}
                          >
                            {exp.latest_status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Experiment Detail, Action Controls & Run History */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          {selectedExp ? (
            <>
              {/* Definition Overview & Action Toolbar */}
              <div className="panel p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-3 pb-2 border-b border-[#1b2230]">
                  <div>
                    <h2 className="text-sm font-bold text-[#e6edf3] font-mono">{selectedExp.name}</h2>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {selectedExp.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="terminal-btn text-xs"
                      onClick={() => {
                        setCloneName(`${selectedExp.name} (Clone)`);
                        setCloneSymbol(selectedExp.symbol);
                        setCloneCosts(String(selectedExp.transaction_cost_bps));
                        setCloneSlippage(String(selectedExp.slippage_bps));
                        setShowCloneModal(true);
                      }}
                    >
                      Clone
                    </button>
                    <button
                      className="terminal-btn primary text-xs"
                      onClick={() => handleRunExperiment(selectedExp.experiment_id)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Executing…' : '▶ Run Backtest'}
                    </button>
                  </div>
                </div>

                {actionMessage && (
                  <div className="p-2 bg-[#12281e] border border-[#235537] text-[#3fb950] text-xs font-mono rounded-[2px]">
                    {actionMessage}
                  </div>
                )}

                {/* Hyperparameters Lineage Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono bg-[#10141d] p-3 rounded-[2px] border border-[#1b2230]">
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Symbol</span>
                    <span className="text-[#58a6ff] font-bold mt-0.5 block">{selectedExp.symbol}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Cost Sensitivity</span>
                    <span className="text-[#e6edf3] mt-0.5 block">{selectedExp.transaction_cost_bps} bps</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Slippage Model</span>
                    <span className="text-[#e6edf3] mt-0.5 block">{selectedExp.slippage_bps} bps</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#586069] uppercase block">Signal ID</span>
                    <span className="text-[#d29922] mt-0.5 block truncate">
                      {selectedExp.signal_id ? selectedExp.signal_id.slice(0, 10) + '…' : 'Manual'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Selected Run Inspection & Equity Curve */}
              {selectedRun && selectedRun.result && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px] flex flex-col justify-between">
                      <span className="metric-label">Run Sharpe</span>
                      <span className="text-lg font-bold font-mono text-[#3fb950] tabular-nums mt-1">
                        {selectedRun.result.sharpe != null ? formatFigure(selectedRun.result.sharpe) : '—'}
                      </span>
                    </div>
                    <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px] flex flex-col justify-between">
                      <span className="metric-label">Total Return</span>
                      <span className="text-lg font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
                        {selectedRun.result.total_return !== undefined
                          ? formatPercent(selectedRun.result.total_return)
                          : '—'}
                      </span>
                    </div>
                    <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px] flex flex-col justify-between">
                      <span className="metric-label">Max Drawdown</span>
                      <span className="text-lg font-bold font-mono text-[#f85149] tabular-nums mt-1">
                        {selectedRun.result.max_drawdown !== undefined
                          ? formatPercent(selectedRun.result.max_drawdown)
                          : '—'}
                      </span>
                    </div>
                    <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px] flex flex-col justify-between">
                      <span className="metric-label">Win Rate</span>
                      <span className="text-lg font-bold font-mono text-[#58a6ff] tabular-nums mt-1">
                        {selectedRun.result.win_rate !== undefined
                          ? formatPercent(selectedRun.result.win_rate)
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Equity Curve Visualizer */}
                  {selectedRun.result.equity_curve && (
                    <EquityCurveChart
                      data={selectedRun.result.equity_curve}
                      title={`Run #${selectedRun.run_id.slice(0, 8)} Equity & Drawdown`}
                    />
                  )}
                </>
              )}

              {/* Execution Run History Table */}
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <span className="panel-title">Execution Audit History</span>
                  <span className="text-xs font-mono text-[#8b949e]">
                    {runs.length} runs
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="terminal-table">
                    <thead>
                      <tr>
                        <th>Run ID</th>
                        <th>Status</th>
                        <th>Executed At</th>
                        <th>Sharpe</th>
                        <th>CAGR</th>
                        <th>Drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-xs text-[#586069] font-mono">
                            No runs recorded. Click &quot;▶ Run Backtest&quot; above to execute.
                          </td>
                        </tr>
                      ) : (
                        runs.map((r) => {
                          const isCurrentRun = selectedRun?.run_id === r.run_id;
                          return (
                            <tr
                              key={r.run_id}
                              onClick={() => setSelectedRun(r)}
                              className={`cursor-pointer transition-colors ${
                                isCurrentRun ? 'bg-[#192231]/80' : 'hover:bg-[#121722]'
                              }`}
                            >
                              <td>
                                <span className="font-mono text-xs text-[#58a6ff]">
                                  {r.run_id.slice(0, 8)}…
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[10px] uppercase ${
                                    r.status === 'COMPLETED'
                                      ? 'bg-[#12281e] text-[#3fb950] border border-[#235537]'
                                      : 'bg-[#2b2111] text-[#d29922] border border-[#594217]'
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="text-xs text-[#8b949e] font-mono">
                                {new Date(r.started_at).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td>
                                <span className="font-mono text-xs text-[#3fb950] tabular-nums">
                                  {r.result?.sharpe !== undefined ? formatFigure(r.result.sharpe) : '—'}
                                </span>
                              </td>
                              <td>
                                <span className="font-mono text-xs text-[#e6edf3] tabular-nums">
                                  {r.result?.cagr !== undefined
                                    ? formatPercent(r.result.cagr)
                                    : '—'}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`font-mono text-xs tabular-nums ${
                                    r.result?.max_drawdown ? 'text-[#f85149]' : 'text-[#8b949e]'
                                  }`}
                                >
                                  {r.result?.max_drawdown !== undefined
                                    ? formatPercent(r.result.max_drawdown)
                                    : '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="panel p-16 text-center text-xs text-[#586069] font-mono">
              Select an experiment definition from the left panel to inspect runs and equity metrics.
            </div>
          )}
        </div>
      </div>

      {/* Comparison Modal */}
      {showCompareModal && comparisonData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: '95vw',
              maxWidth: '1100px',
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: 'var(--bg-card)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                  Side-by-Side Experiment Comparison
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Detailed methodology breakdown and quantitative performance evaluation across{' '}
                  {comparisonData.length} experiments.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setShowCompareModal(false)}
                style={{ fontSize: '12px' }}
              >
                Close ✕
              </button>
            </div>

            {/* Methodology & Performance Comparison Table */}
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    {comparisonData.map((c) => (
                      <th key={c.experiment_id} style={{ minWidth: '160px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {c.symbol}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td
                      colSpan={comparisonData.length + 1}
                      style={{
                        fontWeight: '700',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        color: 'var(--accent-cyan)',
                      }}
                    >
                      1. Quantitative Performance
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Sharpe Ratio</td>
                    {comparisonData.map((c) => (
                      <td
                        key={c.experiment_id}
                        className="font-mono"
                        style={{
                          fontWeight: '700',
                          color:
                            (c.metrics?.sharpe || 0) >= 1.0 ? 'var(--accent-green)' : 'inherit',
                        }}
                      >
                        {c.metrics?.sharpe !== undefined ? formatFigure(c.metrics.sharpe) : 'No Run'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Sortino Ratio</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono">
                        {c.metrics?.sortino !== undefined ? formatFigure(c.metrics.sortino) : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>CAGR</td>
                    {comparisonData.map((c) => (
                      <td
                        key={c.experiment_id}
                        className="font-mono"
                        style={{
                          color:
                            (c.metrics?.cagr || 0) >= 0
                              ? 'var(--accent-green)'
                              : 'var(--accent-red)',
                        }}
                      >
                        {c.metrics?.cagr !== undefined
                          ? formatPercent(c.metrics.cagr)
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Max Drawdown</td>
                    {comparisonData.map((c) => (
                      <td
                        key={c.experiment_id}
                        className="font-mono"
                        style={{ color: 'var(--accent-red)' }}
                      >
                        {c.metrics?.max_drawdown !== undefined
                          ? formatPercent(c.metrics.max_drawdown)
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Calmar Ratio</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono">
                        {c.metrics?.calmar !== undefined ? formatFigure(c.metrics.calmar) : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Win Rate</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono">
                        {c.metrics?.win_rate !== undefined
                          ? formatPercent(c.metrics.win_rate)
                          : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Total Turnover</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono">
                        {c.metrics?.turnover !== undefined
                          ? `${formatFigure(c.metrics.turnover)} units`
                          : '—'}
                      </td>
                    ))}
                  </tr>

                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td
                      colSpan={comparisonData.length + 1}
                      style={{
                        fontWeight: '700',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        color: 'var(--accent-cyan)',
                      }}
                    >
                      2. Methodology & Execution Assumptions
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Signal Model</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} style={{ fontSize: '12px' }}>
                        {c.signal_name || c.signal_id?.slice(0, 8) || 'None'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Asset</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono" style={{ fontSize: '12px' }}>
                        {c.symbol}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Transaction Cost</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono" style={{ fontSize: '12px' }}>
                        {c.transaction_cost_bps} bps
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Slippage Assumption</td>
                    {comparisonData.map((c) => (
                      <td key={c.experiment_id} className="font-mono" style={{ fontSize: '12px' }}>
                        {c.slippage_bps} bps
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600' }}>Execution Protocol</td>
                    {comparisonData.map((c) => (
                      <td
                        key={c.experiment_id}
                        style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                      >
                        {c.metrics?.execution || 'next_bar_close'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Experiment Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{ width: '500px', maxWidth: '90vw', backgroundColor: 'var(--bg-card)' }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>
              Define New Experiment
            </h2>
            <form
              onSubmit={handleCreateExperiment}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <label>
                Experiment Name *
                <input
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Mean Reversion 15bps Slippage"
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={2}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Hypothesis details..."
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              <div
                className="grid-2"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}
              >
                <label>
                  Signal Strategy
                  <select
                    value={createSignalId}
                    onChange={(e) => setCreateSignalId(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  >
                    {signals.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Symbol
                  <input
                    value={createSymbol}
                    onChange={(e) => setCreateSymbol(e.target.value.toUpperCase())}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </label>
              </div>
              <div
                className="grid-2"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}
              >
                <label>
                  Cost (bps)
                  <input
                    type="number"
                    step="0.5"
                    value={createCosts}
                    onChange={(e) => setCreateCosts(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </label>
                <label>
                  Slippage (bps)
                  <input
                    type="number"
                    step="0.5"
                    value={createSlippage}
                    onChange={(e) => setCreateSlippage(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </label>
              </div>
              <label>
                Tags (comma-separated)
                <input
                  value={createTags}
                  onChange={(e) => setCreateTags(e.target.value)}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  Create Experiment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clone Experiment Modal */}
      {showCloneModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{ width: '480px', maxWidth: '90vw', backgroundColor: 'var(--bg-card)' }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>
              Clone Experiment with Overrides
            </h2>
            <form
              onSubmit={handleCloneExperiment}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <label>
                Cloned Experiment Name *
                <input
                  required
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              <label>
                Override Symbol
                <input
                  value={cloneSymbol}
                  onChange={(e) => setCloneSymbol(e.target.value.toUpperCase())}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              <div
                className="grid-2"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}
              >
                <label>
                  Override Cost (bps)
                  <input
                    type="number"
                    step="0.5"
                    value={cloneCosts}
                    onChange={(e) => setCloneCosts(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </label>
                <label>
                  Override Slippage (bps)
                  <input
                    type="number"
                    step="0.5"
                    value={cloneSlippage}
                    onChange={(e) => setCloneSlippage(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </label>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCloneModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  Confirm Clone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
