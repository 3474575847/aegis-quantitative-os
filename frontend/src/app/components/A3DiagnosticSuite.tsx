'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl, formatFigure, formatPercent, formatSignedFigure } from '@/lib/api';
import { ActivityIcon, RefreshIcon, LayersIcon, SignalIcon } from './icons';

interface DiagnosticReport {
  symbol: string;
  generated_at: string;
  baseline_reference: {
    model: string;
    period_bars: number;
    recorded_net_return_pct: number;
    recorded_sharpe: number;
    recorded_sortino: number;
    recorded_max_drawdown_pct: number;
    recorded_win_rate_pct: number;
    recorded_turnover: number;
    recorded_cash_pct: number;
  };
  section_1_waterfall_attribution: {
    waterfall: {
      total_bars: number;
      potential_signals: number;
      regime_accepted: number;
      confidence_accepted: number;
      risk_accepted: number;
      executed: number;
      percentages: {
        potential_pct: number;
        regime_pass_pct: number;
        confidence_pass_pct: number;
        risk_pass_pct: number;
        executed_pct: number;
        cash_unexposed_pct: number;
      };
      elimination_causes: {
        regime_filtered_count: number;
        confidence_filtered_count: number;
        risk_filtered_count: number;
        no_signal_threshold_count: number;
      };
    };
  };
  section_2_expert_decomposition: {
    experts: Array<{
      expert_id: string;
      name: string;
      dimension: string;
      long_short_return_pct: number;
      cost_adjusted_return_pct: number;
      win_rate_pct: number;
      sharpe_ratio: number;
      pearson_ic: number;
      rank_ic: number;
      newey_west_tstat: number;
      p_value: number;
      ic_ci_95: [number, number];
      trade_count: number;
      turnover: number;
      has_statistical_edge: boolean;
    }>;
  };
  section_3_horizon_prediction_matrix: Array<{
    factor_id: string;
    factor_name: string;
    ic_1b: number;
    ic_3b: number;
    ic_6b: number;
    ic_12b: number;
    ic_24b: number;
    ic_48b: number;
    optimal_horizon: string;
  }>;
  section_4_crypto_native_applicability: {
    banned_equity_factors: string[];
    promoted_crypto_factors: string[];
    justification: string;
  };
  section_5_incremental_factor_tests: Array<{
    factor_id: string;
    name: string;
    dimension: string;
    baseline_mom_ic: number;
    combined_ic: number;
    incremental_ic: number;
    incremental_r2_pct: number;
    incremental_tstat: number;
    p_value: number;
    verdict: 'INFORMATIVE' | 'REDUNDANT' | 'DESTRUCTIVE';
    verdict_rationale: string;
  }>;
  section_6_cash_unexposed_root_cause: {
    primary_bottleneck: string;
    waterfall_summary: string;
    allocator_behavior: string;
  };
  section_7_ablation_and_baselines: {
    benchmarks: Array<{
      strategy_id: string;
      name: string;
      category: string;
      total_return_pct: number;
      sharpe_ratio: number;
      sortino_ratio: number;
      max_drawdown_pct: number;
      win_rate_pct: number;
      trade_count: number;
      cash_unexposed_pct: number;
    }>;
    ablation_matrix: Array<{
      variant_id: string;
      description: string;
      return_diff_pct: number;
      sharpe_diff: number;
      trade_count_diff: number;
      component_impact: string;
    }>;
  };
  section_8_walk_forward_oos_stability: {
    total_bars: number;
    num_folds: number;
    overall_oos_return_pct: number;
    overall_oos_sharpe: number;
    overall_oos_win_rate_pct: number;
    is_walk_forward_verified: boolean;
    folds: Array<{
      fold_index: number;
      train_ic: number;
      test_ic: number;
      train_sharpe: number;
      test_sharpe: number;
      train_return_pct: number;
      test_return_pct: number;
      is_oos_stable: boolean;
    }>;
  };
  section_10_recommended_architecture_overhaul: {
    removed_components: string[];
    promoted_components: string[];
    allocator_changes: string[];
    regime_changes: string[];
    risk_control_changes: string[];
    summary: string;
  };
}

export default function A3DiagnosticSuite({ activeSymbol = 'BTC' }: { activeSymbol?: string }) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'WATERFALL' | 'EXPERTS' | 'HORIZONS' | 'INCREMENTAL' | 'ABLATION' | 'OOS'>('WATERFALL');

  const fetchDiagnosticReport = async (sym: string) => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl(`/api/signals/a3/research-diagnostic?symbol=${sym}`));
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to load A3 diagnostic report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnosticReport(activeSymbol);
  }, [activeSymbol]);

  if (loading) {
    return (
      <div className="panel p-6 border-[#1f2633] bg-[#0d1117] flex items-center justify-center gap-3">
        <RefreshIcon size={16} className="animate-spin text-[#d29922]" />
        <span className="text-xs font-mono text-[#8b949e]">
          Executing Empirical Signal Attribution & Diagnostic Pipeline...
        </span>
      </div>
    );
  }

  if (!report) return null;

  const baseRef = report.baseline_reference;
  const waterfall = report.section_1_waterfall_attribution.waterfall;

  return (
    <div className="panel border-[#1f2633] bg-[#0d1117] p-5 flex flex-col gap-5">
      {/* Header Banner */}
      <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[#1f2633] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h2 className="text-sm font-bold font-mono text-[#e6edf3] uppercase tracking-wider">
              A³ Quantitative Architecture Diagnostic & Research Suite // {report.symbol}
            </h2>
          </div>
          <p className="text-xs text-[#7d8590] font-mono mt-1">
            Empirical factor attribution, expert decomposition, horizon IC matrix & walk-forward out-of-sample validation
          </p>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-1 bg-[#161b22] border border-[#21262d] rounded-[2px] p-0.5">
          {(
            [
              { id: 'WATERFALL', label: 'Waterfall (98% Cash)' },
              { id: 'EXPERTS', label: 'Experts IC' },
              { id: 'HORIZONS', label: 'Horizons Matrix' },
              { id: 'INCREMENTAL', label: 'Incremental Alpha' },
              { id: 'ABLATION', label: 'Ablation & Baselines' },
              { id: 'OOS', label: 'Walk-Forward OOS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 text-[11px] font-mono transition-colors rounded-[2px] ${
                activeTab === tab.id
                  ? 'bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]'
                  : 'text-[#7d8590] hover:text-[#c9d1d9]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Baseline Reference Comparison Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 bg-[#11151f] border border-[#1f2633] rounded-[2px] p-3 text-xs font-mono">
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Recorded Baseline Net Return</span>
          <span className="text-[#f85149] font-bold tabular-nums">{baseRef.recorded_net_return_pct}%</span>
        </div>
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Recorded Sharpe</span>
          <span className="text-[#f85149] font-bold tabular-nums">{baseRef.recorded_sharpe}</span>
        </div>
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Recorded Win Rate</span>
          <span className="text-[#c9d1d9] font-semibold tabular-nums">{baseRef.recorded_win_rate_pct}%</span>
        </div>
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Recorded Cash %</span>
          <span className="text-[#d29922] font-bold tabular-nums">{baseRef.recorded_cash_pct}%</span>
        </div>
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Recorded Max DD</span>
          <span className="text-[#f85149] font-semibold tabular-nums">{baseRef.recorded_max_drawdown_pct}%</span>
        </div>
        <div>
          <span className="text-[#586069] block text-[10px] uppercase">Evaluated Bars</span>
          <span className="text-[#c9d1d9] font-semibold tabular-nums">{baseRef.period_bars} bars</span>
        </div>
      </div>

      {/* TAB 1: WATERFALL ATTRIBUTION (98% CASH) */}
      {activeTab === 'WATERFALL' && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-[#11151f] border border-[#1f2633] rounded-[2px]">
            <h3 className="text-xs font-bold font-mono uppercase text-[#e6edf3] mb-2">
              Waterfall Elimination Diagnostic (98% Cash Bottleneck)
            </h3>
            <p className="text-xs text-[#8b949e] font-mono leading-relaxed mb-4">
              {report.section_6_cash_unexposed_root_cause.primary_bottleneck}
            </p>

            {/* Stage Breakdown Bars */}
            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between text-[#c9d1d9] mb-1">
                  <span>Total Period Bars</span>
                  <span className="tabular-nums">{waterfall.total_bars} bars (100%)</span>
                </div>
                <div className="w-full bg-[#1b2230] h-2 rounded-[1px] overflow-hidden">
                  <div className="bg-[#586069] h-full" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#c9d1d9] mb-1">
                  <span>1. Potential Signals (Alpha Score ≥ 0.35)</span>
                  <span className="tabular-nums">
                    {waterfall.potential_signals} bars ({waterfall.percentages.potential_pct}%)
                  </span>
                </div>
                <div className="w-full bg-[#1b2230] h-2 rounded-[1px] overflow-hidden">
                  <div className="bg-[#388bfd] h-full" style={{ width: `${waterfall.percentages.potential_pct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#c9d1d9] mb-1">
                  <span>2. Regime Filter Approved</span>
                  <span className="tabular-nums">
                    {waterfall.regime_accepted} bars ({waterfall.percentages.regime_pass_pct}% of potential)
                  </span>
                </div>
                <div className="w-full bg-[#1b2230] h-2 rounded-[1px] overflow-hidden">
                  <div className="bg-[#a371f7] h-full" style={{ width: `${waterfall.percentages.regime_pass_pct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#c9d1d9] mb-1">
                  <span>3. Confidence Filter Approved</span>
                  <span className="tabular-nums">
                    {waterfall.confidence_accepted} bars ({waterfall.percentages.confidence_pass_pct}% of regime)
                  </span>
                </div>
                <div className="w-full bg-[#1b2230] h-2 rounded-[1px] overflow-hidden">
                  <div className="bg-[#d29922] h-full" style={{ width: `${waterfall.percentages.confidence_pass_pct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#3fb950] font-bold mb-1">
                  <span>4. Executed Trades (Active Position Fills)</span>
                  <span className="tabular-nums">
                    {waterfall.executed} trades ({waterfall.percentages.executed_pct}% of total bars)
                  </span>
                </div>
                <div className="w-full bg-[#1b2230] h-2 rounded-[1px] overflow-hidden">
                  <div className="bg-[#3fb950] h-full" style={{ width: `${waterfall.percentages.executed_pct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXPERTS DECOMPOSITION & IC LEADERBOARD */}
      {activeTab === 'EXPERTS' && (
        <div className="overflow-x-auto">
          <table className="terminal-table w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1f2633] text-[#7d8590] text-[11px] uppercase">
                <th className="p-2 text-left">Factor Expert</th>
                <th className="p-2 text-left">Dimension</th>
                <th className="p-2 text-right">Pearson IC</th>
                <th className="p-2 text-right">Rank IC</th>
                <th className="p-2 text-right">Newey-West t-stat</th>
                <th className="p-2 text-right">p-value</th>
                <th className="p-2 text-right">95% IC CI</th>
                <th className="p-2 text-center">Stat Edge</th>
              </tr>
            </thead>
            <tbody>
              {report.section_2_expert_decomposition.experts.map((exp) => (
                <tr key={exp.expert_id} className="border-b border-[#19202e] hover:bg-[#11151f]">
                  <td className="p-2 font-bold text-[#e6edf3]">{exp.name}</td>
                  <td className="p-2 text-[#8b949e]">{exp.dimension}</td>
                  <td className={`p-2 text-right tabular-nums font-semibold ${exp.pearson_ic >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {exp.pearson_ic}
                  </td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{exp.rank_ic}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-[#e6edf3]">{exp.newey_west_tstat}</td>
                  <td className="p-2 text-right tabular-nums text-[#8b949e]">{exp.p_value}</td>
                  <td className="p-2 text-right tabular-nums text-[#7d8590]">
                    [{exp.ic_ci_95[0]}, {exp.ic_ci_95[1]}]
                  </td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded-[1px] text-[10px] font-bold ${
                        exp.has_statistical_edge ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40' : 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40'
                      }`}
                    >
                      {exp.has_statistical_edge ? 'SIGNIFICANT' : 'NO EDGE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: HORIZONS MATRIX */}
      {activeTab === 'HORIZONS' && (
        <div className="overflow-x-auto">
          <table className="terminal-table w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1f2633] text-[#7d8590] text-[11px] uppercase">
                <th className="p-2 text-left">Factor Name</th>
                <th className="p-2 text-right">1B (5m)</th>
                <th className="p-2 text-right">3B (15m)</th>
                <th className="p-2 text-right">6B (30m)</th>
                <th className="p-2 text-right">12B (1h)</th>
                <th className="p-2 text-right">24B (2h)</th>
                <th className="p-2 text-right">48B (4h)</th>
                <th className="p-2 text-center">Optimal Horizon</th>
              </tr>
            </thead>
            <tbody>
              {report.section_3_horizon_prediction_matrix.map((h) => (
                <tr key={h.factor_id} className="border-b border-[#19202e] hover:bg-[#11151f]">
                  <td className="p-2 font-bold text-[#e6edf3]">{h.factor_name}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{h.ic_1b}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{h.ic_3b}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{h.ic_6b}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-[#3fb950]">{h.ic_12b}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{h.ic_24b}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{h.ic_48b}</td>
                  <td className="p-2 text-center font-bold text-[#d29922]">{h.optimal_horizon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: INCREMENTAL ALPHA TESTS */}
      {activeTab === 'INCREMENTAL' && (
        <div className="overflow-x-auto">
          <table className="terminal-table w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1f2633] text-[#7d8590] text-[11px] uppercase">
                <th className="p-2 text-left">Candidate Factor</th>
                <th className="p-2 text-right">Baseline Mom IC</th>
                <th className="p-2 text-right">Combined IC</th>
                <th className="p-2 text-right">Incremental IC</th>
                <th className="p-2 text-right">Inc t-stat</th>
                <th className="p-2 text-center">Verdict</th>
                <th className="p-2 text-left">Verdict Rationale</th>
              </tr>
            </thead>
            <tbody>
              {report.section_5_incremental_factor_tests.map((test) => (
                <tr key={test.factor_id} className="border-b border-[#19202e] hover:bg-[#11151f]">
                  <td className="p-2 font-bold text-[#e6edf3]">{test.name}</td>
                  <td className="p-2 text-right tabular-nums text-[#8b949e]">{test.baseline_mom_ic}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{test.combined_ic}</td>
                  <td className="p-2 text-right tabular-nums font-bold text-[#3fb950]">+{test.incremental_ic}</td>
                  <td className="p-2 text-right tabular-nums text-[#e6edf3]">{test.incremental_tstat}</td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded-[1px] text-[10px] font-bold ${
                        test.verdict === 'INFORMATIVE'
                          ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40'
                          : 'bg-[#8b949e]/20 text-[#8b949e] border border-[#8b949e]/40'
                      }`}
                    >
                      {test.verdict}
                    </span>
                  </td>
                  <td className="p-2 text-[#8b949e] max-w-xs truncate">{test.verdict_rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: ABLATION & BASELINES */}
      {activeTab === 'ABLATION' && (
        <div className="overflow-x-auto">
          <table className="terminal-table w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1f2633] text-[#7d8590] text-[11px] uppercase">
                <th className="p-2 text-left">Strategy / Variant</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-right">Return %</th>
                <th className="p-2 text-right">Sharpe</th>
                <th className="p-2 text-right">Sortino</th>
                <th className="p-2 text-right">Max DD %</th>
                <th className="p-2 text-right">Win Rate %</th>
                <th className="p-2 text-right">Trade Count</th>
                <th className="p-2 text-right">Cash %</th>
              </tr>
            </thead>
            <tbody>
              {report.section_7_ablation_and_baselines.benchmarks.map((bm) => (
                <tr key={bm.strategy_id} className="border-b border-[#19202e] hover:bg-[#11151f]">
                  <td className="p-2 font-bold text-[#e6edf3]">{bm.name}</td>
                  <td className="p-2 text-[#8b949e]">{bm.category}</td>
                  <td className={`p-2 text-right tabular-nums font-bold ${bm.total_return_pct >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {bm.total_return_pct}%
                  </td>
                  <td className="p-2 text-right tabular-nums text-[#e6edf3]">{bm.sharpe_ratio}</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{bm.sortino_ratio}</td>
                  <td className="p-2 text-right tabular-nums text-[#f85149]">{bm.max_drawdown_pct}%</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{bm.win_rate_pct}%</td>
                  <td className="p-2 text-right tabular-nums text-[#c9d1d9]">{bm.trade_count}</td>
                  <td className="p-2 text-right tabular-nums text-[#d29922]">{bm.cash_unexposed_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: WALK-FORWARD OUT-OF-SAMPLE */}
      {activeTab === 'OOS' && (
        <div className="flex flex-col gap-4 font-mono text-xs">
          <div className="p-3 bg-[#11151f] border border-[#1f2633] rounded-[2px] flex items-center justify-between">
            <div>
              <span className="text-[#8b949e]">3-Fold Walk-Forward OOS Status: </span>
              <span className={`font-bold ${report.section_8_walk_forward_oos_stability.is_walk_forward_verified ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {report.section_8_walk_forward_oos_stability.is_walk_forward_verified ? 'VERIFIED STABLE' : 'UNSTABLE'}
              </span>
            </div>
            <div>
              <span className="text-[#8b949e]">Overall OOS Sharpe: </span>
              <span className="text-[#e6edf3] font-bold tabular-nums">
                {report.section_8_walk_forward_oos_stability.overall_oos_sharpe}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="terminal-table w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1f2633] text-[#7d8590] text-[11px] uppercase">
                  <th className="p-2 text-left">Fold #</th>
                  <th className="p-2 text-right">Train IC</th>
                  <th className="p-2 text-right">Test IC (OOS)</th>
                  <th className="p-2 text-right">Train Sharpe</th>
                  <th className="p-2 text-right">Test Sharpe (OOS)</th>
                  <th className="p-2 text-center">OOS Stability</th>
                </tr>
              </thead>
              <tbody>
                {report.section_8_walk_forward_oos_stability.folds.map((f) => (
                  <tr key={f.fold_index} className="border-b border-[#19202e] hover:bg-[#11151f]">
                    <td className="p-2 font-bold text-[#e6edf3]">Fold {f.fold_index}</td>
                    <td className="p-2 text-right tabular-nums text-[#8b949e]">{f.train_ic}</td>
                    <td className="p-2 text-right tabular-nums font-bold text-[#3fb950]">{f.test_ic}</td>
                    <td className="p-2 text-right tabular-nums text-[#8b949e]">{f.train_sharpe}</td>
                    <td className="p-2 text-right tabular-nums text-[#e6edf3]">{f.test_sharpe}</td>
                    <td className="p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded-[1px] text-[10px] font-bold ${f.is_oos_stable ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#da3633]/20 text-[#f85149]'}`}>
                        {f.is_oos_stable ? 'STABLE' : 'DEGRADED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
