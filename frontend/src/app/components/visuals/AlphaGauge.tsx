'use client';

import React from 'react';
import { formatFigure, formatPercent } from '@/lib/api';

interface AlphaGaugeProps {
  score: number; // e.g. -1.0 to +1.0
  conviction: number; // e.g. 0 to 1.0
  action: 'BUY' | 'SELL' | 'HOLD';
  hurdleRate?: number; // e.g. 0.15
  expectedReturn?: number; // e.g. 0.042
}

export default function AlphaGauge({
  score,
  conviction,
  action,
  hurdleRate = 0.15,
  expectedReturn,
}: AlphaGaugeProps) {
  // Clamp score between -1 and 1
  const clampedScore = Math.max(-1, Math.min(1, score));

  // Gauge geometry: semi-circle from 180 deg to 360 deg (left to right)
  const radius = 64;
  const strokeWidth = 8;
  const cx = 80;
  const cy = 76;

  // Normalized value 0 (at -1) to 1 (at +1)
  const normalized = (clampedScore + 1) / 2;
  // Angle in degrees: 180 to 360
  const angleDeg = 180 + normalized * 180;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Needle tip
  const needleLen = radius - 10;
  const needleX = cx + needleLen * Math.cos(angleRad);
  const needleY = cy + needleLen * Math.sin(angleRad);

  // Conviction ring: 2 * PI * r
  const convRadius = 28;
  const convCircumference = 2 * Math.PI * convRadius;
  const convClamped = Math.max(0, Math.min(1, conviction));
  const convOffset = convCircumference * (1 - convClamped);

  const isLong = clampedScore > hurdleRate;
  const isShort = clampedScore < -hurdleRate;
  const scoreColor = isLong ? '#3fb950' : isShort ? '#f85149' : '#d29922';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
      {/* Gauge Visualizer */}
      <div className="md:col-span-7 flex flex-col items-center justify-center p-3 bg-[#0d1117] border border-[#1b2230] rounded-[2px]">
        <div className="flex justify-between w-full items-center mb-1">
          <span className="text-[10px] uppercase font-mono text-[#8b949e] tracking-wider">
            Calibrated Alpha Dial
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px]"
            style={{
              backgroundColor: isLong ? 'rgba(63, 185, 80, 0.15)' : isShort ? 'rgba(248, 81, 73, 0.15)' : 'rgba(210, 153, 34, 0.15)',
              color: scoreColor,
              border: `1px solid ${scoreColor}40`,
            }}
          >
            {isLong ? 'LONG ALPHA' : isShort ? 'SHORT ALPHA' : 'HURDLE NEUTRAL'}
          </span>
        </div>

        <svg width="160" height="96" viewBox="0 0 160 96" className="overflow-visible select-none">
          <defs>
            <linearGradient id="gaugeArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f85149" />
              <stop offset="40%" stopColor="#d29922" />
              <stop offset="60%" stopColor="#d29922" />
              <stop offset="100%" stopColor="#3fb950" />
            </linearGradient>
            <filter id="glowNeedle" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={scoreColor} floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Background Arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="#1b2230"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Colored Active Arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="url(#gaugeArcGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Deadband Marker Lines [-hurdleRate, +hurdleRate] */}
          {(() => {
            const leftHurdleNorm = (-hurdleRate + 1) / 2;
            const leftAngle = (180 + leftHurdleNorm * 180) * (Math.PI / 180);
            const lx1 = cx + (radius - 7) * Math.cos(leftAngle);
            const ly1 = cy + (radius - 7) * Math.sin(leftAngle);
            const lx2 = cx + (radius + 7) * Math.cos(leftAngle);
            const ly2 = cy + (radius + 7) * Math.sin(leftAngle);

            const rightHurdleNorm = (hurdleRate + 1) / 2;
            const rightAngle = (180 + rightHurdleNorm * 180) * (Math.PI / 180);
            const rx1 = cx + (radius - 7) * Math.cos(rightAngle);
            const ry1 = cy + (radius - 7) * Math.sin(rightAngle);
            const rx2 = cx + (radius + 7) * Math.cos(rightAngle);
            const ry2 = cy + (radius + 7) * Math.sin(rightAngle);

            return (
              <>
                <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#8b949e" strokeWidth="1.5" />
                <line x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke="#8b949e" strokeWidth="1.5" />
              </>
            );
          })()}

          {/* Center Pivot */}
          <circle cx={cx} cy={cy} r="4.5" fill="#e6edf3" />
          <circle cx={cx} cy={cy} r="2" fill="#0d1117" />

          {/* Needle Pointer */}
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke={scoreColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#glowNeedle)"
          />

          {/* Range Labels */}
          <text x={cx - radius - 2} y={cy + 14} fill="#8b949e" fontSize="9" fontFamily="monospace" textAnchor="middle">
            -1.0
          </text>
          <text x={cx} y={cy - radius - 4} fill="#d29922" fontSize="9" fontFamily="monospace" textAnchor="middle">
            0.0
          </text>
          <text x={cx + radius + 2} y={cy + 14} fill="#8b949e" fontSize="9" fontFamily="monospace" textAnchor="middle">
            +1.0
          </text>
        </svg>

        {/* Numeric Display below Gauge */}
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold font-mono tabular-nums" style={{ color: scoreColor }}>
            {score > 0 ? `+${formatFigure(score)}` : formatFigure(score)}
          </span>
          <span className="text-[11px] text-[#8b949e] font-mono">
            / 1.00 ({action})
          </span>
        </div>
        <div className="text-[10px] text-[#586069] font-mono mt-0.5">
          Deadband range: ±{formatFigure(hurdleRate)} hurdle
        </div>
      </div>

      {/* Conviction Radial & Forecast Summary */}
      <div className="md:col-span-5 flex flex-col justify-between h-full p-3 bg-[#0d1117] border border-[#1b2230] rounded-[2px] gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-mono text-[#8b949e] tracking-wider">
            Model Certainty
          </span>
          <span className="text-[10px] font-mono text-[#58a6ff]">
            A³ Invariant
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Radial Progress Ring */}
          <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
            <svg width="64" height="64" className="rotate-[-90deg]">
              <circle
                cx="32"
                cy="32"
                r={convRadius}
                fill="none"
                stroke="#1b2230"
                strokeWidth="5"
              />
              <circle
                cx="32"
                cy="32"
                r={convRadius}
                fill="none"
                stroke="#58a6ff"
                strokeWidth="5"
                strokeDasharray={convCircumference}
                strokeDashoffset={convOffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold font-mono text-[#e6edf3] tabular-nums">
                {formatFigure(conviction * 100)}%
              </span>
            </div>
          </div>

          {/* Forecast Details */}
          <div className="flex flex-col gap-1 text-xs font-mono">
            <div className="flex justify-between gap-2">
              <span className="text-[#586069]">Forecast:</span>
              <span className={`font-bold tabular-nums ${expectedReturn && expectedReturn > 0 ? 'text-[#3fb950]' : expectedReturn && expectedReturn < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                {expectedReturn !== undefined ? `${expectedReturn > 0 ? '+' : ''}${formatPercent(expectedReturn)}` : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#586069]">Confidence:</span>
              <span className="text-[#58a6ff]">
                {conviction >= 0.75 ? 'HIGH' : conviction >= 0.45 ? 'MODERATE' : 'LOW'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#586069]">Action:</span>
              <span className="font-bold text-[#e6edf3]">
                {action}
              </span>
            </div>
          </div>
        </div>

        <div className="w-full bg-[#141b26] h-1.5 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#f85149] transition-all"
            style={{ width: `${Math.max(0, -clampedScore) * 50}%` }}
          />
          <div className="h-full bg-transparent flex-1" />
          <div
            className="h-full bg-[#3fb950] transition-all"
            style={{ width: `${Math.max(0, clampedScore) * 50}%` }}
          />
        </div>
      </div>
    </div>
  );
}
