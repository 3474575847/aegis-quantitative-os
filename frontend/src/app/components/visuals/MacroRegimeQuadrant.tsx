'use client';

import React from 'react';

interface MacroRegimeQuadrantProps {
  currentRegime: string; // 'GOLDILOCKS' | 'REFLATION' | 'STAGFLATION' | 'DEFLATION' | 'UNKNOWN'
  growthChange?: number | null; // e.g. -0.1 to +0.5
  inflationChange?: number | null; // e.g. -0.2 to +0.8
  confidence?: string;
}

export default function MacroRegimeQuadrant({
  currentRegime,
  growthChange = 0.15,
  inflationChange = -0.10,
  confidence = 'HIGH',
}: MacroRegimeQuadrantProps) {
  // Normalize coordinates into viewBox 0 to 200 (center at 100, 100)
  // X: Inflation: -1.0 -> 20, +1.0 -> 180 (center 100)
  // Y: Growth: +1.0 -> 20 (up), -1.0 -> 180 (down) (center 100)
  const infl = inflationChange != null ? Math.max(-0.8, Math.min(0.8, inflationChange)) : 0;
  const growth = growthChange != null ? Math.max(-0.8, Math.min(0.8, growthChange)) : 0;

  const posX = 100 + (infl / 0.8) * 70;
  const posY = 100 - (growth / 0.8) * 70;

  const isGoldilocks = currentRegime === 'GOLDILOCKS';
  const isReflation = currentRegime === 'REFLATION';
  const isStagflation = currentRegime === 'STAGFLATION';
  const isDeflation = currentRegime === 'DEFLATION';

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#1b2230]">
        <div>
          <span className="panel-title">Macro Regime 2x2 Matrix</span>
          <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
            Growth vs Inflation momentum space with active FRED positioning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-ping bg-[#3fb950]" />
          <span className="text-xs font-mono font-bold text-[#e6edf3]">
            {currentRegime} ({confidence})
          </span>
        </div>
      </div>

      <div className="relative w-full aspect-[16/10] max-h-[320px] bg-[#090c10] border border-[#1b2230] rounded-[2px] p-2 overflow-hidden">
        {/* SVG Coordinate Grid */}
        <svg viewBox="0 0 200 200" className="w-full h-full select-none">
          <defs>
            <radialGradient id="beaconGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3fb950" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#3fb950" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3fb950" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Quadrant Background Zones */}
          {/* Top-Left: GOLDILOCKS (Growth Up, Inflation Down) */}
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill={isGoldilocks ? 'rgba(63, 185, 80, 0.12)' : 'rgba(255, 255, 255, 0.01)'}
            stroke="#1b2230"
            strokeWidth="0.5"
          />
          {/* Top-Right: REFLATION (Growth Up, Inflation Up) */}
          <rect
            x="100"
            y="0"
            width="100"
            height="100"
            fill={isReflation ? 'rgba(88, 166, 255, 0.12)' : 'rgba(255, 255, 255, 0.01)'}
            stroke="#1b2230"
            strokeWidth="0.5"
          />
          {/* Bottom-Left: DEFLATION (Growth Down, Inflation Down) */}
          <rect
            x="0"
            y="100"
            width="100"
            height="100"
            fill={isDeflation ? 'rgba(210, 153, 34, 0.12)' : 'rgba(255, 255, 255, 0.01)'}
            stroke="#1b2230"
            strokeWidth="0.5"
          />
          {/* Bottom-Right: STAGFLATION (Growth Down, Inflation Up) */}
          <rect
            x="100"
            y="100"
            width="100"
            height="100"
            fill={isStagflation ? 'rgba(248, 81, 73, 0.12)' : 'rgba(255, 255, 255, 0.01)'}
            stroke="#1b2230"
            strokeWidth="0.5"
          />

          {/* Major Axes */}
          <line x1="100" y1="0" x2="100" y2="200" stroke="#2d3748" strokeWidth="1.2" strokeDasharray="3,3" />
          <line x1="0" y1="100" x2="200" y2="100" stroke="#2d3748" strokeWidth="1.2" strokeDasharray="3,3" />

          {/* Quadrant Labels */}
          {/* Top-Left */}
          <text x="12" y="24" fill={isGoldilocks ? '#3fb950' : '#8b949e'} fontSize="7" fontWeight="bold" fontFamily="monospace">
            GOLDILOCKS
          </text>
          <text x="12" y="32" fill="#586069" fontSize="5.5" fontFamily="monospace">
            Equities +++ / High Yield
          </text>

          {/* Top-Right */}
          <text x="188" y="24" textAnchor="end" fill={isReflation ? '#58a6ff' : '#8b949e'} fontSize="7" fontWeight="bold" fontFamily="monospace">
            REFLATION
          </text>
          <text x="188" y="32" textAnchor="end" fill="#586069" fontSize="5.5" fontFamily="monospace">
            Commodities ++ / Value
          </text>

          {/* Bottom-Left */}
          <text x="12" y="176" fill={isDeflation ? '#d29922' : '#8b949e'} fontSize="7" fontWeight="bold" fontFamily="monospace">
            DEFLATION
          </text>
          <text x="12" y="184" fill="#586069" fontSize="5.5" fontFamily="monospace">
            Treasuries +++ / Cash
          </text>

          {/* Bottom-Right */}
          <text x="188" y="176" textAnchor="end" fill={isStagflation ? '#f85149' : '#8b949e'} fontSize="7" fontWeight="bold" fontFamily="monospace">
            STAGFLATION
          </text>
          <text x="188" y="184" textAnchor="end" fill="#586069" fontSize="5.5" fontFamily="monospace">
            Gold ++ / Real Assets
          </text>

          {/* Axis Labels */}
          <text x="100" y="8" textAnchor="middle" fill="#58a6ff" fontSize="6" fontFamily="monospace">
            ▲ ACCELERATING GROWTH
          </text>
          <text x="100" y="196" textAnchor="middle" fill="#8b949e" fontSize="6" fontFamily="monospace">
            ▼ SLOWING GROWTH
          </text>
          <text x="6" y="103" fill="#8b949e" fontSize="5.5" fontFamily="monospace">
            ◀ FALLING INFLATION
          </text>
          <text x="194" y="103" textAnchor="end" fill="#8b949e" fontSize="5.5" fontFamily="monospace">
            RISING INFLATION ▶
          </text>

          {/* Active Position Beacon */}
          <circle cx={posX} cy={posY} r="14" fill="url(#beaconGlow)" />
          <circle cx={posX} cy={posY} r="4" fill="#3fb950" stroke="#e6edf3" strokeWidth="1.5" />
          {/* Target Crosshairs */}
          <line x1={posX - 7} y1={posY} x2={posX + 7} y2={posY} stroke="#ffffff" strokeWidth="0.8" />
          <line x1={posX} y1={posY - 7} x2={posX} y2={posY + 7} stroke="#ffffff" strokeWidth="0.8" />
        </svg>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono pt-1">
        <div className="p-2 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
          <span className="text-[10px] text-[#586069] uppercase block">Current Regime</span>
          <span className="text-[#3fb950] font-bold mt-0.5 block">{currentRegime}</span>
        </div>
        <div className="p-2 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
          <span className="text-[10px] text-[#586069] uppercase block">Optimal Asset</span>
          <span className="text-[#e6edf3] font-bold mt-0.5 block">
            {isGoldilocks ? 'Equities & Tech' : isReflation ? 'Commodities' : isStagflation ? 'Cash & Gold' : 'Duration (Treasuries)'}
          </span>
        </div>
        <div className="p-2 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
          <span className="text-[10px] text-[#586069] uppercase block">A³ Regime Weight</span>
          <span className="text-[#58a6ff] font-bold mt-0.5 block">
            {isGoldilocks ? '1.20x Aggressive' : isStagflation ? '0.40x Defensive' : '0.85x Balanced'}
          </span>
        </div>
        <div className="p-2 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
          <span className="text-[10px] text-[#586069] uppercase block">Audit Source</span>
          <span className="text-[#8b949e] mt-0.5 block">FRED / Point-in-time</span>
        </div>
      </div>
    </div>
  );
}
