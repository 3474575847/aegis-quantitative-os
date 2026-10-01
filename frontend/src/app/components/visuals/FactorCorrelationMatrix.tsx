'use client';

import React, { useState } from 'react';
import { formatFigure } from '@/lib/api';

const FACTORS = ['Value', 'Momentum', 'Volatility', 'Sentiment', 'Quality'];

// Realistic baseline empirical cross-factor correlation matrix
const CORRELATIONS: Record<string, Record<string, number>> = {
  Value: { Value: 1.0, Momentum: -0.28, Volatility: -0.15, Sentiment: 0.12, Quality: 0.35 },
  Momentum: { Value: -0.28, Momentum: 1.0, Volatility: 0.22, Sentiment: 0.48, Quality: 0.18 },
  Volatility: { Value: -0.15, Momentum: 0.22, Volatility: 1.0, Sentiment: -0.32, Quality: -0.42 },
  Sentiment: { Value: 0.12, Momentum: 0.48, Volatility: -0.32, Sentiment: 1.0, Quality: 0.25 },
  Quality: { Value: 0.35, Momentum: 0.18, Volatility: -0.42, Sentiment: 0.25, Quality: 1.0 },
};

export default function FactorCorrelationMatrix() {
  const [hoveredCell, setHoveredCell] = useState<{ r: string; c: string; val: number } | null>(null);

  const getColor = (val: number) => {
    if (val === 1.0) return 'rgba(88, 166, 255, 0.4)'; // Self correlation
    if (val > 0) {
      const alpha = Math.min(0.7, Math.max(0.1, val * 0.8));
      return `rgba(63, 185, 80, ${alpha})`;
    }
    const alpha = Math.min(0.7, Math.max(0.1, Math.abs(val) * 0.8));
    return `rgba(248, 81, 73, ${alpha})`;
  };

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#1b2230]">
        <div>
          <span className="panel-title">Factor Cross-Correlation Matrix</span>
          <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
            Empirical orthogonality heatmap & pairwise collinearity diagnostic
          </p>
        </div>
        <div className="text-xs font-mono text-[#58a6ff]">
          {hoveredCell
            ? `${hoveredCell.r} × ${hoveredCell.c}: ${hoveredCell.val > 0 ? '+' : ''}${formatFigure(hoveredCell.val)}`
            : 'Hover cell to inspect'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left text-[11px] text-[#586069] border-b border-[#1b2230]"></th>
              {FACTORS.map((f) => (
                <th key={f} className="p-2 text-center text-[11px] text-[#8b949e] border-b border-[#1b2230]">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FACTORS.map((row) => (
              <tr key={row}>
                <td className="p-2 text-[11px] font-semibold text-[#8b949e] border-r border-[#1b2230] whitespace-nowrap">
                  {row}
                </td>
                {FACTORS.map((col) => {
                  const val = CORRELATIONS[row]?.[col] ?? 0;
                  const isHovered = hoveredCell?.r === row && hoveredCell?.c === col;

                  return (
                    <td
                      key={col}
                      className={`p-2 text-center cursor-pointer transition-transform duration-100 ${
                        isHovered ? 'scale-105 shadow-md z-10' : ''
                      }`}
                      style={{
                        backgroundColor: getColor(val),
                        border: isHovered ? '1px solid #e6edf3' : '1px solid #141b26',
                      }}
                      onMouseEnter={() => setHoveredCell({ r: row, c: col, val })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <span className={`text-[11px] font-bold ${val === 1.0 ? 'text-[#e6edf3]' : val > 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {val === 1.0 ? '1.00' : `${val > 0 ? '+' : ''}${formatFigure(val)}`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-[10px] text-[#586069] font-mono pt-2 border-t border-[#1b2230]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] bg-[#f85149]/40 border border-[#f85149]" /> Negative Correlation (&lt; 0)
        </span>
        <span className="text-[#8b949e]">Orthogonal Target: |ρ| &lt; 0.35</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[1px] bg-[#3fb950]/40 border border-[#3fb950]" /> Positive Correlation (&gt; 0)
        </span>
      </div>
    </div>
  );
}
