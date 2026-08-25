"use client";

import React, { useRef, useState } from "react";

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

export default function EquityCurveChart({ data, title = "Strategy Cumulative Equity & Drawdown" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
        No equity curve data available.
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 25;
  const equityBottom = 200;
  const drawdownTop = 220;
  const drawdownBottom = 280;

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

  // Generate equity SVG path
  const equityPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getEquityY(d.equity).toFixed(1)}`)
    .join(" ");

  const equityArea = `${equityPath} L ${getX(numPoints - 1).toFixed(1)} ${equityBottom} L ${getX(0).toFixed(1)} ${equityBottom} Z`;

  // Generate drawdown SVG path
  const drawdownPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getDrawdownY(d.drawdown ?? 0).toFixed(1)}`)
    .join(" ");

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

  // Format date display
  const formatDate = (ts: string) => {
    if (!ts) return "";
    if (ts.length >= 16) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    }
    return ts.slice(0, 10);
  };

  return (
    <div className="card" ref={containerRef} style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div>
          <span className="card-title">{title}</span>
          <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Start: <strong className="font-mono" style={{ color: "var(--text-primary)" }}>{initialEq.toFixed(4)}</strong>
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Current:{" "}
              <strong className="font-mono" style={{ color: isPositive ? "var(--accent-green)" : "var(--accent-red)" }}>
                {finalEq.toFixed(4)} ({(((finalEq - initialEq) / initialEq) * 100).toFixed(2)}%)
              </strong>
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Peak Drawdown:{" "}
              <strong className="font-mono" style={{ color: "var(--accent-red)" }}>
                {(minDrawdown * 100).toFixed(2)}%
              </strong>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span className="badge badge-green font-mono" style={{ fontSize: "10px" }}>NEXT-BAR EXECUTION</span>
          <span className="badge badge-cyan font-mono" style={{ fontSize: "10px" }}>POINT-IN-TIME</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPositive ? "var(--accent-green, #10b981)" : "var(--accent-red, #ef4444)"} stopOpacity="0.25" />
            <stop offset="100%" stopColor={isPositive ? "var(--accent-green, #10b981)" : "var(--accent-red, #ef4444)"} stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Grid lines & Axis labels */}
        <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke="var(--border-color, #333)" strokeDasharray="3 3" />
        <line x1={padLeft} y1={equityBottom} x2={width - padRight} y2={equityBottom} stroke="var(--border-color, #333)" />
        <line x1={padLeft} y1={drawdownTop} x2={width - padRight} y2={drawdownTop} stroke="var(--border-color, #333)" />
        <line x1={padLeft} y1={drawdownBottom} x2={width - padRight} y2={drawdownBottom} stroke="var(--border-color, #333)" strokeDasharray="3 3" />

        {/* Y Axis ticks */}
        <text x={padLeft - 8} y={padTop + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end" className="font-mono">
          {maxEquity.toFixed(3)}
        </text>
        <text x={padLeft - 8} y={getEquityY(1.0) + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end" className="font-mono">
          1.000
        </text>
        <text x={padLeft - 8} y={equityBottom - 2} fill="var(--text-muted)" fontSize="10" textAnchor="end" className="font-mono">
          {minEquity.toFixed(3)}
        </text>
        <text x={padLeft - 8} y={drawdownTop + 10} fill="var(--text-muted)" fontSize="9" textAnchor="end" className="font-mono">
          0.0%
        </text>
        <text x={padLeft - 8} y={drawdownBottom} fill="var(--accent-red)" fontSize="9" textAnchor="end" className="font-mono">
          {(minDrawdown * 100).toFixed(1)}%
        </text>

        {/* Baseline 1.0 guideline */}
        <line
          x1={padLeft}
          y1={getEquityY(1.0)}
          x2={width - padRight}
          y2={getEquityY(1.0)}
          stroke="var(--text-muted)"
          strokeOpacity="0.4"
          strokeDasharray="2 2"
        />

        {/* Equity Fill and Line */}
        <path d={equityArea} fill="url(#equityGradient)" />
        <path d={equityPath} fill="none" stroke={isPositive ? "var(--accent-green, #10b981)" : "var(--accent-red, #ef4444)"} strokeWidth="2" />

        {/* Drawdown Fill and Line */}
        <path d={drawdownArea} fill="url(#drawdownGradient)" />
        <path d={drawdownPath} fill="none" stroke="var(--accent-red, #ef4444)" strokeWidth="1.5" strokeOpacity="0.8" />

        {/* Section labels */}
        <text x={width - padRight} y={padTop + 14} fill="var(--text-muted)" fontSize="10" textAnchor="end" opacity="0.6">
          Strategy Equity
        </text>
        <text x={width - padRight} y={drawdownTop + 14} fill="var(--accent-red)" fontSize="9" textAnchor="end" opacity="0.6">
          Underwater Drawdown
        </text>

        {/* X Axis Time Labels */}
        {data.length > 0 && (
          <>
            <text x={padLeft} y={height - 5} fill="var(--text-muted)" fontSize="9" className="font-mono">
              {formatDate(data[0].timestamp)}
            </text>
            <text x={width / 2} y={height - 5} fill="var(--text-muted)" fontSize="9" textAnchor="middle" className="font-mono">
              {formatDate(data[Math.floor(numPoints / 2)].timestamp)}
            </text>
            <text x={width - padRight} y={height - 5} fill="var(--text-muted)" fontSize="9" textAnchor="end" className="font-mono">
              {formatDate(data[numPoints - 1].timestamp)}
            </text>
          </>
        )}

        {/* Hover Crosshair & Tooltip Indicator */}
        {hover && (
          <g>
            <line x1={hover.x} y1={padTop} x2={hover.x} y2={drawdownBottom} stroke="var(--accent-cyan, #06b6d4)" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={hover.x} cy={getEquityY(hover.equity)} r="4" fill="var(--accent-cyan, #06b6d4)" stroke="var(--bg-primary, #000)" strokeWidth="2" />
            <circle cx={hover.x} cy={getDrawdownY(hover.drawdown)} r="3" fill="var(--accent-red, #ef4444)" stroke="var(--bg-primary, #000)" strokeWidth="1" />
          </g>
        )}
      </svg>

      {/* Interactive Tooltip Card */}
      {hover && (
        <div
          style={{
            position: "absolute",
            top: "50px",
            left: `${Math.min(Math.max(hover.x / width * 100, 15), 80)}%`,
            transform: "translateX(-50%)",
            backgroundColor: "rgba(18, 20, 29, 0.95)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--border-color)",
            padding: "8px 12px",
            borderRadius: "6px",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "160px",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }} className="font-mono">
            {hover.timestamp.replace("T", " ").replace("Z", "")}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: "var(--text-secondary)" }}>Equity:</span>
            <strong className="font-mono" style={{ color: "var(--accent-cyan)" }}>
              {hover.equity.toFixed(4)}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ color: "var(--text-secondary)" }}>Drawdown:</span>
            <strong className="font-mono" style={{ color: "var(--accent-red)" }}>
              {(hover.drawdown * 100).toFixed(2)}%
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}
