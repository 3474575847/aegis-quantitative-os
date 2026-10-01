'use client';

import React from 'react';
import { formatPercent } from '@/lib/api';

interface HoldingItem {
  symbol: string;
  weight: number;
}

interface ScenarioItem {
  scenario: string;
  name: string;
  portfolio_return: number;
  benchmark_return?: number;
}

interface PortfolioVisualizerProps {
  holdings: HoldingItem[];
  scenarios?: ScenarioItem[];
  selectedScenario?: ScenarioItem | null;
}

const PALETTE = [
  '#58a6ff',
  '#3fb950',
  '#d29922',
  '#a371f7',
  '#f0883e',
  '#79c0ff',
  '#56d364',
  '#e3b341',
  '#bc8cff',
];

export default function PortfolioVisualizer({
  holdings,
  scenarios = [],
  selectedScenario,
}: PortfolioVisualizerProps) {
  const totalWeight = holdings.reduce((acc, h) => acc + (h.weight || 0), 0) || 1;

  // Default macro scenarios if none supplied
  const displayScenarios: ScenarioItem[] = scenarios.length > 0 ? scenarios : [
    { scenario: '2008_GFC', name: '2008 Global Financial Crisis', portfolio_return: -0.264, benchmark_return: -0.385 },
    { scenario: '2020_COVID', name: '2020 COVID Liquidity Shock', portfolio_return: -0.168, benchmark_return: -0.339 },
    { scenario: '2022_RATES', name: '2022 Fed Rate Hiking Cycle', portfolio_return: -0.135, benchmark_return: -0.194 },
    { scenario: 'TECH_ROUT', name: 'Tech Sector Deleveraging', portfolio_return: -0.212, benchmark_return: -0.298 },
    { scenario: 'BASELINE', name: 'Active Invariant Baseline Forecast', portfolio_return: 0.142, benchmark_return: 0.085 },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
      {/* Asset Allocation Stacked Distribution Bar */}
      <div className="lg:col-span-6 panel p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center pb-2 border-b border-[#1b2230]">
          <div>
            <span className="panel-title">Asset Allocation Distribution</span>
            <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
              Portfolio capital allocation &amp; position sizing weights
            </p>
          </div>
          <span className="text-xs font-mono text-[#58a6ff]">
            {holdings.length} Assets · {(totalWeight * 100).toFixed(0)}% Allocated
          </span>
        </div>

        {/* Stacked Horizontal Bar */}
        <div className="w-full h-7 rounded-[2px] overflow-hidden flex bg-[#0a0d13] border border-[#1b2230] p-0.5 gap-0.5">
          {holdings.map((h, i) => {
            const pct = Math.max(2, (h.weight / totalWeight) * 100);
            const color = PALETTE[i % PALETTE.length];

            return (
              <div
                key={h.symbol}
                className="h-full transition-all duration-300 relative group flex items-center justify-center overflow-hidden"
                style={{ width: `${pct}%`, backgroundColor: color }}
                title={`${h.symbol}: ${(h.weight * 100).toFixed(1)}%`}
              >
                {pct > 8 && (
                  <span className="text-[10px] font-mono font-bold text-[#090c10] truncate px-1 select-none">
                    {h.symbol}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
          {holdings.map((h, i) => {
            const color = PALETTE[i % PALETTE.length];
            const pct = (h.weight / totalWeight) * 100;

            return (
              <div key={h.symbol} className="flex items-center justify-between p-1.5 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[1px]" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-[#e6edf3]">{h.symbol}</span>
                </div>
                <span className="text-[#8b949e] tabular-nums">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stress-Test Scenario Drawdown Chart */}
      <div className="lg:col-span-6 panel p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center pb-2 border-b border-[#1b2230]">
          <div>
            <span className="panel-title">Stress-Test Scenario Shock Matrix</span>
            <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
              Comparative simulated portfolio return vs SPY benchmark under acute shocks
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#8b949e]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-[#58a6ff]" /> Portfolio
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-[1px] bg-[#3a4454]" /> Benchmark
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          {displayScenarios.map((sc) => {
            const pRet = sc.portfolio_return;
            const bRet = sc.benchmark_return ?? 0;
            const isPos = pRet >= 0;
            const isSelected = selectedScenario?.scenario === sc.scenario;

            return (
              <div
                key={sc.scenario}
                className={`p-2 rounded-[2px] transition-colors ${
                  isSelected ? 'bg-[#14233a] border border-[#1f3a60]' : 'bg-[#0d1117] border border-[#1b2230]'
                }`}
              >
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <span className="font-bold text-[#e6edf3] truncate">{sc.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#586069]">BM: {formatPercent(bRet)}</span>
                    <span className={`font-bold tabular-nums ${isPos ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {isPos ? '+' : ''}{formatPercent(pRet)}
                    </span>
                  </div>
                </div>

                {/* Horizontal Comparison Bar */}
                <div className="w-full h-3 bg-[#090c10] rounded-[1px] overflow-hidden flex relative">
                  <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#2d3748] z-10" />

                  {/* Left (negative) */}
                  <div className="w-1/2 flex justify-end pr-0.5">
                    {!isPos && (
                      <div
                        className="h-full rounded-l-[1px] bg-gradient-to-l from-[#f85149] to-[#f85149]/50"
                        style={{ width: `${Math.min(100, Math.abs(pRet) * 200)}%` }}
                      />
                    )}
                  </div>

                  {/* Right (positive) */}
                  <div className="w-1/2 flex justify-start pl-0.5">
                    {isPos && (
                      <div
                        className="h-full rounded-r-[1px] bg-gradient-to-r from-[#3fb950] to-[#3fb950]/50"
                        style={{ width: `${Math.min(100, pRet * 200)}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
