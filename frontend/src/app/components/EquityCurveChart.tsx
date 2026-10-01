'use client';

import React, { useRef, useState } from 'react';
import { formatFigure, formatPercent } from '../../lib/api';

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown?: number;
}

interface Props {
  data: EquityPoint[];
  title?: string;
}

interface HoverInfo {
  x: number;
  index: number;
  timestamp: string;
  equity: number;
  drawdown: number;
}

export default function EquityCurveChart({
  data,
  title = 'Strategy Cumulative Equity & Drawdown',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="panel p-8 text-center text-xs font-mono text-[#586069]">
        No equity curve observations available for selected execution parameters.
      </div>
    );
  }

  const width = 800;
  const height = 280;
  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const equityBottom = 180;
  const drawdownTop = 200;
  const drawdownBottom = 260;

  const equities = data.map((d) => d.equity);
  const minEquity = Math.min(...equities, 0.98);
  const maxEquity = Math.max(...equities, 1.02);
  const equityRange = maxEquity - minEquity || 0.01;

  const drawdowns = data.map((d) => d.drawdown ?? 0);
  const minDrawdown = Math.min(...drawdowns, -0.05);

  const usableWidth = width - padLeft - padRight;
  const numPoints = data.length;

  const getX = (i: number) => padLeft + (i / Math.max(1, numPoints - 1)) * usableWidth;
  const getEquityY = (eq: number) =>
    padTop + (1 - (eq - minEquity) / equityRange) * (equityBottom - padTop);
  const getDrawdownY = (dd: number) =>
    drawdownTop + (Math.abs(dd) / Math.abs(minDrawdown || 0.01)) * (drawdownBottom - drawdownTop);

  const equityPath = data
    .map(
      (d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getEquityY(d.equity).toFixed(1)}`,
    )
    .join(' ');

  const equityArea = `${equityPath} L ${getX(numPoints - 1).toFixed(1)} ${equityBottom} L ${getX(0).toFixed(1)} ${equityBottom} Z`;

  const drawdownPath = data
    .map(
      (d, i) =>
        `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getDrawdownY(d.drawdown ?? 0).toFixed(1)}`,
    )
    .join(' ');

  const drawdownArea = `${drawdownPath} L ${getX(numPoints - 1).toFixed(1)} ${drawdownTop} L ${getX(0).toFixed(1)} ${drawdownTop} Z`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const relX = clientX / rect.width;
    const clampedRelX = Math.max(0, Math.min(1, (relX * width - padLeft) / usableWidth));
    const index = Math.min(numPoints - 1, Math.max(0, Math.round(clampedRelX * (numPoints - 1))));
    const point = data[index];
    if (point) {
      setHover({
        x: getX(index),
        index,
        timestamp: point.timestamp,
        equity: point.equity,
        drawdown: point.drawdown ?? 0,
      });
    }
  };

  const handleMouseLeave = () => setHover(null);

  const initialEq = data[0]?.equity || 1.0;
  const finalEq = data[data.length - 1]?.equity || 1.0;
  const isPositive = finalEq >= initialEq;

  const formatDate = (ts: string) => {
    if (!ts) return '';
    if (ts.length >= 16) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    return ts.slice(0, 10);
  };

  return (
    <div className="panel overflow-hidden" ref={containerRef}>
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <span className="panel-title">{title}</span>
          <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-[#8b949e]">
            <span>
              START: <strong className="text-[#e6edf3]">{formatFigure(initialEq)}</strong>
            </span>
            <span>
              FINAL:{' '}
              <strong className={isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                {formatFigure(finalEq)} ({formatPercent((finalEq - initialEq) / initialEq)})
              </strong>
            </span>
            <span>
              MAX DD: <strong className="text-[#f85149]">{formatPercent(minDrawdown)}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-[#7d8590]">
          <span>NEXT-BAR</span>
          <span>·</span>
          <span>POINT-IN-TIME</span>
        </div>
      </div>

      <div className="p-3 bg-[#0d1017]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isPositive ? '#3fb950' : '#f85149'}
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor={isPositive ? '#3fb950' : '#f85149'}
                stopOpacity="0.0"
              />
            </linearGradient>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f85149" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#f85149" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            stroke="#1b2230"
            strokeDasharray="2 2"
          />
          <line
            x1={padLeft}
            y1={equityBottom}
            x2={width - padRight}
            y2={equityBottom}
            stroke="#1b2230"
          />
          <line
            x1={padLeft}
            y1={drawdownTop}
            x2={width - padRight}
            y2={drawdownTop}
            stroke="#1b2230"
          />
          <line
            x1={padLeft}
            y1={drawdownBottom}
            x2={width - padRight}
            y2={drawdownBottom}
            stroke="#1b2230"
            strokeDasharray="2 2"
          />

          {/* Y Axis ticks */}
          <text
            x={padLeft - 8}
            y={padTop + 4}
            fill="#586069"
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {formatFigure(maxEquity)}
          </text>
          <text
            x={padLeft - 8}
            y={equityBottom}
            fill="#586069"
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {formatFigure(minEquity)}
          </text>
          <text
            x={padLeft - 8}
            y={drawdownTop + 4}
            fill="#586069"
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            0%
          </text>
          <text
            x={padLeft - 8}
            y={drawdownBottom}
            fill="#f85149"
            fontSize="10"
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {formatPercent(minDrawdown)}
          </text>

          {/* Area Fills */}
          <path d={equityArea} fill="url(#equityGradient)" />
          <path d={drawdownArea} fill="url(#drawdownGradient)" />

          {/* Strokes */}
          <path
            d={equityPath}
            fill="none"
            stroke={isPositive ? '#3fb950' : '#f85149'}
            strokeWidth="1.5"
          />
          <path d={drawdownPath} fill="none" stroke="#f85149" strokeWidth="1" />

          {/* Hover Crosshair */}
          {hover && (
            <g>
              <line
                x1={hover.x}
                y1={padTop}
                x2={hover.x}
                y2={drawdownBottom}
                stroke="#d29922"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={hover.x}
                cy={getEquityY(hover.equity)}
                r="3"
                fill="#d29922"
              />
            </g>
          )}
        </svg>

        {/* Hover Readout Bar */}
        {hover && (
          <div className="mt-2 pt-2 border-t border-[#19202e] flex items-center justify-between text-[11px] font-mono text-[#8b949e]">
            <div>
              <span className="text-[#586069]">BAR #{hover.index + 1} · </span>
              <span>{formatDate(hover.timestamp)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span>
                EQUITY: <strong className="text-[#e6edf3]">{formatFigure(hover.equity)}</strong>
              </span>
              <span>
                DRAWDOWN:{' '}
                <strong className="text-[#f85149]">{formatPercent(hover.drawdown)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
