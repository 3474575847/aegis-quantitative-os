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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px' }}>
            Research Experiment Registry & Comparison
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Version-controlled hypothesis repository, deterministic run history, and institutional
            multi-factor comparison.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedForCompare.length >= 2 && (
            <button
              className="btn btn-secondary"
              onClick={handleOpenCompare}
              style={{
                fontSize: '12px',
                borderColor: 'var(--accent-cyan)',
                color: 'var(--accent-cyan)',
              }}
            >
              Compare Selected ({selectedForCompare.length}) →
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ fontSize: '12px' }}
          >
            + New Experiment
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid-4">
        <div className="card">
          <span className="card-title">Total Experiments</span>
          <span className="card-value">{experiments.length}</span>
          <span className="card-subtitle">Versioned configurations</span>
        </div>
        <div className="card">
          <span className="card-title">Executed Runs</span>
          <span className="card-value">
            {experiments.reduce((acc, curr) => acc + curr.run_count, 0)}
          </span>
          <span className="card-subtitle">Point-in-time audit ledger</span>
        </div>
        <div className="card">
          <span className="card-title">Best Strategy Sharpe</span>
          <span className="card-value" style={{ color: 'var(--accent-green)', fontSize: '24px' }}>
            {formatFigure(Math.max(...experiments.map((e) => e.best_sharpe || 0), 0))}
          </span>
          <span className="card-subtitle">Highest risk-adjusted alpha</span>
        </div>
        <div className="card">
          <span className="card-title">Execution Mode</span>
          <span className="card-value" style={{ color: 'var(--accent-cyan)', fontSize: '20px' }}>
            NEXT-BAR CLOSE
          </span>
          <span className="card-subtitle">Zero lookahead bias</span>
        </div>
      </div>

      {/* Main Explorer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '24px' }}>
        {/* Experiment List Table */}
        <div className="table-container">
          <div className="table-header">
            <span style={{ fontWeight: '600', fontSize: '13px' }}>Experiment Definitions</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {selectedForCompare.length} selected for comparison
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}>Comp</th>
                <th>Experiment</th>
                <th>Symbol</th>
                <th>Runs</th>
                <th>Best Sharpe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
                    Loading experiments...
                  </td>
                </tr>
              ) : experiments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
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
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--bg-card-hover)' : undefined,
                      }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          onClick={(e) => toggleCompareSelect(exp.experiment_id, e)}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          {exp.name}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {exp.description || 'No description'}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-cyan font-mono" style={{ fontSize: '10px' }}>
                          {exp.symbol}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono">{exp.run_count}</span>
                      </td>
                      <td>
                        <span
                          className="font-mono"
                          style={{
                            fontWeight: '600',
                            color:
                              exp.best_sharpe != null && exp.best_sharpe >= 1.0
                                ? 'var(--accent-green)'
                                : exp.best_sharpe != null && exp.best_sharpe >= 0
                                  ? 'var(--accent-cyan)'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {exp.best_sharpe != null ? formatFigure(exp.best_sharpe) : '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            exp.latest_status === 'COMPLETED'
                              ? 'badge-green'
                              : exp.latest_status === 'RUNNING'
                                ? 'badge-cyan'
                                : 'badge-amber'
                          } font-mono`}
                          style={{ fontSize: '10px' }}
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

        {/* Experiment Detail, Action Controls & Run History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedExp ? (
            <>
              {/* Definition Overview & Action Toolbar */}
              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: '700' }}>{selectedExp.name}</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {selectedExp.description || 'No description provided.'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setCloneName(`${selectedExp.name} (Clone)`);
                        setCloneSymbol(selectedExp.symbol);
                        setCloneCosts(String(selectedExp.transaction_cost_bps));
                        setCloneSlippage(String(selectedExp.slippage_bps));
                        setShowCloneModal(true);
                      }}
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      Clone
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRunExperiment(selectedExp.experiment_id)}
                      disabled={actionLoading}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {actionLoading ? 'Executing...' : '▶ Run Backtest'}
                    </button>
                  </div>
                </div>

                {actionMessage && (
                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--accent-cyan)' }}>
                    {actionMessage}
                  </div>
                )}

                {/* Hyperparameters Lineage Card */}
                <div
                  className="font-mono"
                  style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Symbol: </span>
                    <strong>{selectedExp.symbol}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Costs: </span>
                    <strong>{selectedExp.transaction_cost_bps} bps</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Slippage: </span>
                    <strong>{selectedExp.slippage_bps} bps</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Signal ID: </span>
                    <strong style={{ color: 'var(--accent-cyan)' }}>
                      {selectedExp.signal_id ? selectedExp.signal_id.slice(0, 8) + '...' : 'None'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Selected Run Inspection & Equity Curve */}
              {selectedRun && selectedRun.result && (
                <>
                  <div className="grid-4">
                    <div className="card">
                      <span className="card-title">Run Sharpe</span>
                      <strong
                        className="card-value"
                        style={{ color: 'var(--accent-green)', fontSize: '18px' }}
                      >
                        {selectedRun.result.sharpe != null ? formatFigure(selectedRun.result.sharpe) : '—'}
                      </strong>
                    </div>
                    <div className="card">
                      <span className="card-title">Total Return</span>
                      <strong className="card-value" style={{ fontSize: '18px' }}>
                        {selectedRun.result.total_return !== undefined
                          ? formatPercent(selectedRun.result.total_return)
                          : '—'}
                      </strong>
                    </div>
                    <div className="card">
                      <span className="card-title">Max Drawdown</span>
                      <strong
                        className="card-value"
                        style={{ color: 'var(--accent-red)', fontSize: '18px' }}
                      >
                        {selectedRun.result.max_drawdown !== undefined
                          ? formatPercent(selectedRun.result.max_drawdown)
                          : '—'}
                      </strong>
                    </div>
                    <div className="card">
                      <span className="card-title">Win Rate</span>
                      <strong className="card-value" style={{ fontSize: '18px' }}>
                        {selectedRun.result.win_rate !== undefined
                          ? formatPercent(selectedRun.result.win_rate)
                          : '—'}
                      </strong>
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
              <div className="table-container">
                <div className="table-header">
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>
                    Execution Audit History
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {runs.length} runs
                  </span>
                </div>
                <table className="data-table">
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
                        <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                          No runs recorded. Click &quot;Run Backtest&quot; above to execute.
                        </td>
                      </tr>
                    ) : (
                      runs.map((r) => {
                        const isCurrentRun = selectedRun?.run_id === r.run_id;
                        return (
                          <tr
                            key={r.run_id}
                            onClick={() => setSelectedRun(r)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isCurrentRun ? 'var(--bg-card-hover)' : undefined,
                            }}
                          >
                            <td>
                              <span className="font-mono" style={{ fontSize: '11px' }}>
                                {r.run_id.slice(0, 8)}...
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  r.status === 'COMPLETED' ? 'badge-green' : 'badge-amber'
                                } font-mono`}
                                style={{ fontSize: '10px' }}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ fontSize: '11px' }}>
                              {new Date(r.started_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>
                              <span className="font-mono" style={{ fontSize: '11px' }}>
                                {r.result?.sharpe !== undefined ? formatFigure(r.result.sharpe) : '—'}
                              </span>
                            </td>
                            <td>
                              <span className="font-mono" style={{ fontSize: '11px' }}>
                                {r.result?.cagr !== undefined
                                  ? formatPercent(r.result.cagr)
                                  : '—'}
                              </span>
                            </td>
                            <td>
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '11px',
                                  color: r.result?.max_drawdown ? 'var(--accent-red)' : 'inherit',
                                }}
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
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Select an experiment definition from the left panel to inspect runs and equity
                metrics.
              </span>
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
