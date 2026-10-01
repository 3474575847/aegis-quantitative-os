'use client';

import React from 'react';
import { formatFigure } from '@/lib/api';

export interface FactorItem {
  factor_name: string;
  weight: number;
  z_score: number;
  contribution_bps: number;
}

interface FactorAttributionChartProps {
  factors: FactorItem[];
  title?: string;
}

export default function FactorAttributionChart({
  factors,
  title = 'Factor Attribution Waterfall (Divergence Chart)',
}: FactorAttributionChartProps) {
  if (!factors || factors.length === 0) {
    return (
      <div className="panel p-6 text-center text-xs font-mono text-[#586069]">
        No factor attribution points available.
      </div>
    );
  }

  // Find max absolute bps to normalize bar lengths
  const maxAbsBps = Math.max(...factors.map((f) => Math.abs(f.contribution_bps || 0)), 15);

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#1b2230]">
        <div>
          <span className="panel-title">{title}</span>
          <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
            Divergence from benchmark: Positive alpha contributors (Right) vs Negative drags (Left)
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#8b949e]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-[#f85149]" /> Drag (&lt;0 bps)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-[#3fb950]" /> Boost (&gt;0 bps)
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        {factors.map((factor) => {
          const bps = factor.contribution_bps;
          const isPos = bps >= 0;
          const pctWidth = Math.min(100, (Math.abs(bps) / maxAbsBps) * 100);

          return (
            <div key={factor.factor_name} className="grid grid-cols-12 gap-2 items-center text-xs font-mono">
              {/* Factor Name & Weight */}
              <div className="col-span-3 flex flex-col">
                <span className="font-semibold text-[#e6edf3] truncate">{factor.factor_name}</span>
                <span className="text-[10px] text-[#586069]">
                  w: {formatFigure(factor.weight * 100)}% · z: {formatFigure(factor.z_score)}
                </span>
              </div>

              {/* Bilateral Divergence Bar */}
              <div className="col-span-7 flex items-center relative h-6 bg-[#0a0d13] border border-[#1b2230] rounded-[2px] overflow-hidden px-1">
                {/* Center Zero Axis Guide */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#2d3748] z-10" />

                {/* Left side (negative) */}
                <div className="w-1/2 flex justify-end pr-0.5">
                  {!isPos && (
                    <div
                      className="h-3.5 rounded-l-[1px] bg-gradient-to-l from-[#f85149] to-[#f85149]/40 transition-all duration-300"
                      style={{ width: `${pctWidth}%` }}
                    />
                  )}
                </div>

                {/* Right side (positive) */}
                <div className="w-1/2 flex justify-start pl-0.5">
                  {isPos && (
                    <div
                      className="h-3.5 rounded-r-[1px] bg-gradient-to-r from-[#3fb950] to-[#3fb950]/40 transition-all duration-300"
                      style={{ width: `${pctWidth}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Contribution Metric Display */}
              <div className="col-span-2 text-right">
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${
                    isPos ? 'text-[#3fb950]' : 'text-[#f85149]'
                  }`}
                >
                  {isPos ? `+${formatFigure(bps)}` : formatFigure(bps)} bps
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-[10px] text-[#586069] font-mono pt-2 border-t border-[#1b2230]">
        <span>- {formatFigure(maxAbsBps)} bps</span>
        <span className="text-[#8b949e]">0 bps (Center Invariant)</span>
        <span>+ {formatFigure(maxAbsBps)} bps</span>
      </div>
    </div>
  );
}
