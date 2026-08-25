"use client";

import React, { useCallback, useRef, useState } from "react";

export interface ChartDatapoint {
  timestamp: string;
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  price: number;
  sentimentZ: number;
  eventTitle?: string | null;
}

interface Props {
  data?: ChartDatapoint[];
  assetName?: string;
}

interface HoverState {
  x: number;
  price: number;
  sentimentZ: number;
  timestamp: string;
  eventTitle?: string | null;
  isInterpolated: boolean;
}

// Linear interpolation between two numbers
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Interpolate a timestamp string like "07:30" between two strings
function lerpTimestamp(a: string, b: string, t: number) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const totalA = ah * 60 + am;
  const totalB = bh * 60 + bm;
  const total = Math.round(lerp(totalA, totalB, t));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function SentimentPriceChart({ data = [], assetName = "BTC/USD" }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [rangeHours, setRangeHours] = useState(24);
  const [showIndicators, setShowIndicators] = useState(false);

  const sourceData = data;
  const rangeStart = sourceData.length > 0 && sourceData[0].time
    ? sourceData[sourceData.length - 1].time! - rangeHours * 60 * 60
    : 0;
  const rangedData = sourceData.filter((point) => !point.time || point.time >= rangeStart);
  const maxDisplayPoints = 72;
  const sampleStep = Math.max(1, Math.ceil(rangedData.length / maxDisplayPoints));
  const chartData: ChartDatapoint[] = rangedData.filter(
    (_, index) => index % sampleStep === 0 || index === rangedData.length - 1
  );

  // ── Layout constants ────────────────────────────────────────────────────────
  const PAD = { top: 32, right: 52, bottom: 48, left: 62 };

  // Scales (computed lazily inside handlers using current SVG dimensions)
  const prices = chartData.length > 0 ? chartData.map((d) => d.price) : [0];
  const minPrice = Math.min(...prices) * 0.998;
  const maxPrice = Math.max(...prices) * 1.002;
  const minZ = -3.0;
  const maxZ = 3.0;

  const getX = useCallback(
    (index: number, innerW: number) => {
      if (chartData.length <= 1) return PAD.left + innerW / 2;
      return PAD.left + (index / (chartData.length - 1)) * innerW;
    },
    [chartData.length, PAD.left]
  );

  const getPriceY = useCallback(
    (price: number, innerH: number) => {
      if (maxPrice === minPrice) return PAD.top + innerH / 2;
      return PAD.top + innerH - ((price - minPrice) / (maxPrice - minPrice)) * innerH;
    },
    [maxPrice, minPrice, PAD.top]
  );

  const getZY = useCallback(
    (z: number, innerH: number) =>
      PAD.top + innerH - ((z - minZ) / (maxZ - minZ)) * innerH,
    [PAD.top]
  );

  // ── Mouse interaction ───────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgW = rect.width;
      const svgH = rect.height;
      if (chartData.length === 0) return;
      const innerW = svgW - PAD.left - PAD.right;
      const innerH = svgH - PAD.top - PAD.bottom;

      const mouseX = e.clientX - rect.left;

      // Clamp to chart area
      const clampedX = Math.max(PAD.left, Math.min(mouseX, PAD.left + innerW));

      // Map x → fractional index
      const fracIndex = ((clampedX - PAD.left) / innerW) * (chartData.length - 1);
      const i0 = Math.max(0, Math.floor(fracIndex));
      const i1 = Math.min(chartData.length - 1, i0 + 1);
      const t = fracIndex - i0;

      const d0 = chartData[i0];
      const d1 = chartData[i1];

      const isExact = t < 0.02 || i0 === i1;
      const price = isExact ? d0.price : lerp(d0.price, d1.price, t);
      const sentimentZ = isExact ? d0.sentimentZ : lerp(d0.sentimentZ, d1.sentimentZ, t);
      const timestamp = isExact ? d0.timestamp : lerpTimestamp(d0.timestamp, d1.timestamp, t);
      const eventTitle = isExact ? d0.eventTitle : (d0.eventTitle ?? d1.eventTitle ?? null);

      setHover({
        x: clampedX,
        price,
        sentimentZ: Math.max(-3, Math.min(3, sentimentZ)),
        timestamp,
        eventTitle,
        isInterpolated: !isExact,
      });
    },
    [chartData, PAD]
  );

  // ── Build SVG paths using viewBox (we'll set viewBox="0 0 W H" and let the
  //    SVG scale via CSS width:100%). Internally we work at a logical 760×280.
  const VW = 760;
  const VH = 280;
  const innerW = VW - PAD.left - PAD.right;
  const innerH = VH - PAD.top - PAD.bottom;
  const priceInnerH = innerH - 42;
  const maxVolume = Math.max(...chartData.map((d) => d.volume || 0), 1);

  const getXv = (i: number) => getX(i, innerW);
  const getPriceYv = (p: number) => getPriceY(p, priceInnerH);
  const getZYv = (z: number) => getZY(z, innerH);
  const hasCandles = chartData.some((d) => d.open !== undefined && d.high !== undefined && d.low !== undefined && d.close !== undefined);
  const movingAverage = chartData.map((point, index) => {
    const window = chartData.slice(Math.max(0, index - 19), index + 1);
    return window.reduce((sum, item) => sum + item.price, 0) / window.length;
  });
  const movingDeviation = chartData.map((point, index) => {
    const window = chartData.slice(Math.max(0, index - 19), index + 1);
    const mean = movingAverage[index];
    return Math.sqrt(window.reduce((sum, item) => sum + (item.price - mean) ** 2, 0) / window.length);
  });

  const linePoints = chartData.map((d, i) => `${getXv(i)},${getPriceYv(d.price)}`).join(" ");
  const areaPoints = `${PAD.left},${VH - PAD.bottom} ${linePoints} ${VW - PAD.right},${VH - PAD.bottom}`;

  // Hover crosshair X, mapped from screen → viewBox
  const hoverVX = hover
    ? (() => {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const svgW = rect.width;
        const fracX = (hover.x - PAD.left) / (svgW - PAD.left - PAD.right);
        return PAD.left + fracX * innerW;
      })()
    : null;

  return (
    <div
      ref={containerRef}
      className="card"
      style={{
        border: "1px solid rgba(0, 210, 255, 0.2)",
        backgroundColor: "rgba(18, 23, 34, 0.75)",
        backdropFilter: "blur(12px)",
        borderRadius: "10px",
        padding: "20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-primary)" }}>
              📊 Dual-Axis Price & Sentiment Overlay
            </span>
            <span className="badge badge-cyan font-mono" style={{ fontSize: "11px", fontWeight: 700 }}>
              {assetName}
            </span>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
            Inspect real market candles and attached sentiment observations.
          </p>
        </div>
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent-cyan)", fontWeight: 600 }}>
            <span style={{ display: "inline-block", width: 22, height: 3, borderRadius: 2, background: "var(--accent-cyan)" }} />
            Spot Price ($)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent-purple)", fontWeight: 600 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "rgba(139,92,246,0.55)" }} />
            Sentiment Z-Score
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", alignItems: "center" }} aria-label="Chart time range">
        {[1, 6, 24].map((hours) => (
          <button
            key={hours}
            type="button"
            className={`btn ${rangeHours === hours ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setRangeHours(hours);
              setHover(null);
            }}
            style={{ padding: "5px 10px", fontSize: "11px", minWidth: "42px" }}
          >
            {hours === 24 ? "1D" : `${hours}H`}
          </button>
        ))}
        <span className="font-mono" style={{ marginLeft: "6px", color: "var(--text-muted)", fontSize: "10px" }}>
          {chartData.length} candles shown
        </span>
        <button type="button" className={`btn ${showIndicators ? "btn-primary" : "btn-secondary"}`} onClick={() => setShowIndicators((current) => !current)} style={{ marginLeft: "auto", padding: "5px 10px", fontSize: "11px" }}>
          SMA / BOLL
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => { setRangeHours(24); setHover(null); }} style={{ padding: "5px 10px", fontSize: "11px" }}>
          RESET
        </button>
      </div>

      {/* ── SVG Canvas — fills full container width, maintains aspect ratio ── */}
      <div style={{ width: "100%", position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair", overflow: "visible" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onWheel={(event) => {
            event.preventDefault();
            setRangeHours((current) => Math.max(1, Math.min(24, current + (event.deltaY > 0 ? 1 : -1))));
            setHover(null);
          }}
        >
          <defs>
            <linearGradient id={`priceGrad-${assetName}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => (
            <line key={idx}
              x1={PAD.left} y1={PAD.top + innerH * r}
              x2={VW - PAD.right} y2={PAD.top + innerH * r}
              stroke="var(--border-color)" strokeDasharray="3 3" opacity={0.45}
            />
          ))}

          {chartData.length === 0 && (
            <text x={VW / 2} y={VH / 2} textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontFamily="var(--font-mono)">
              Market history unavailable from the configured provider
            </text>
          )}

          {/* Z=0 baseline */}
          <line
            x1={PAD.left} y1={getZYv(0)}
            x2={VW - PAD.right} y2={getZYv(0)}
            stroke="var(--accent-purple)" strokeDasharray="4 4" opacity={0.45}
          />

          {/* Sentiment bars */}
          {chartData.map((d, i) => {
            const x = getXv(i);
            const y0 = getZYv(0);
            const yVal = getZYv(d.sentimentZ);
            const barW = Math.max(8, innerW / (chartData.length * 2.2));
            const barY = Math.min(y0, yVal);
            const barH = Math.max(3, Math.abs(y0 - yVal));
            const isPos = d.sentimentZ >= 0;
            return (
              <rect key={`bar-${i}`}
                x={x - barW / 2} y={barY} width={barW} height={barH}
                fill={isPos ? "var(--accent-purple)" : "var(--accent-red)"}
                opacity={hover ? 0.28 : 0.42} rx={2}
              />
            );
          })}

          {/* Volume strip */}
          {chartData.map((d, i) => {
            if (!d.volume) return null;
            const x = getXv(i);
            const barW = Math.max(2, innerW / chartData.length * 0.65);
            const height = (d.volume / maxVolume) * 34;
            const y = VH - PAD.bottom - height;
            return (
              <rect
                key={`volume-${i}`}
                x={x - barW / 2}
                y={y}
                width={barW}
                height={height}
                fill={d.close !== undefined && d.open !== undefined && d.close >= d.open ? "var(--accent-green)" : "var(--accent-red)"}
                opacity={0.28}
              />
            );
          })}

          {/* Price area fill for non-candle fallback data */}
          {!hasCandles && <polygon points={areaPoints} fill={`url(#priceGrad-${assetName})`} />}

          {/* Real OHLC candles */}
          {hasCandles && chartData.map((d, i) => {
            if (d.open === undefined || d.high === undefined || d.low === undefined || d.close === undefined) return null;
            const x = getXv(i);
            const candleWidth = Math.max(3, innerW / chartData.length * 0.62);
            const isUp = d.close >= d.open;
            const bodyTop = getPriceYv(Math.max(d.open, d.close));
            const bodyBottom = getPriceYv(Math.min(d.open, d.close));
            return (
              <g key={`candle-${i}`}>
                <line x1={x} y1={getPriceYv(d.high)} x2={x} y2={getPriceYv(d.low)} stroke={isUp ? "var(--accent-green)" : "var(--accent-red)"} strokeWidth="1" />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={Math.max(1.5, bodyBottom - bodyTop)}
                  fill={isUp ? "var(--accent-green)" : "var(--accent-red)"}
                  stroke={isUp ? "var(--accent-green)" : "var(--accent-red)"}
                  rx="1"
                />
              </g>
            );
          })}

          {showIndicators && hasCandles && (
            <>
              <polyline fill="none" stroke="var(--accent-amber)" strokeWidth="1.5" points={movingAverage.map((value, index) => `${getXv(index)},${getPriceYv(value)}`).join(" ")} />
              <polyline fill="none" stroke="var(--accent-amber)" strokeWidth="1" strokeDasharray="4 3" opacity="0.65" points={movingAverage.map((value, index) => `${getXv(index)},${getPriceYv(value + movingDeviation[index] * 2)}`).join(" ")} />
              <polyline fill="none" stroke="var(--accent-amber)" strokeWidth="1" strokeDasharray="4 3" opacity="0.65" points={movingAverage.map((value, index) => `${getXv(index)},${getPriceYv(value - movingDeviation[index] * 2)}`).join(" ")} />
            </>
          )}

          {/* Price line for fallback/non-OHLC data */}
          {!hasCandles && <polyline
            fill="none"
            stroke="var(--accent-cyan)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints}
          />}

          {/* Event markers */}
          {chartData.map((d, i) => {
            const x = getXv(i);
            const y = getPriceYv(d.price);
            return (
              <g key={`pt-${i}`}>
                {d.eventTitle && (
                  <circle cx={x} cy={y} r={7} fill="rgba(0,210,255,0.18)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                )}
              </g>
            );
          })}

          {/* Hover crosshair + interpolated dot */}
          {hoverVX !== null && hover && (
            <>
              {/* vertical line */}
              <line
                x1={hoverVX} y1={PAD.top}
                x2={hoverVX} y2={VH - PAD.bottom}
                stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3 3"
              />
              {/* interpolated price dot */}
              <circle
                cx={hoverVX}
                cy={getPriceYv(hover.price)}
                r={5}
                fill="white"
                stroke="var(--accent-cyan)"
                strokeWidth="2"
              />
              {/* interpolated Z dot on baseline level */}
              <circle
                cx={hoverVX}
                cy={getZYv(hover.sentimentZ)}
                r={4}
                fill="var(--accent-purple)"
                opacity={0.85}
              />
            </>
          )}

          {/* Y-Axis labels — left (price) */}
          {[maxPrice, (maxPrice + minPrice) / 2, minPrice].map((p, i) => (
            <text key={`lp-${i}`}
              x={PAD.left - 8}
              y={getPriceYv(p) + 4}
              textAnchor="end"
              fill={i === 1 ? "var(--text-muted)" : "var(--accent-cyan)"}
              fontSize="9.5"
              fontFamily="var(--font-mono)"
            >
              ${p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(2)}
            </text>
          ))}

          {/* Y-Axis labels — right (Z-score) */}
          {([3, 0, -3] as number[]).map((z, i) => (
            <text key={`lz-${i}`}
              x={VW - PAD.right + 8}
              y={getZYv(z) + 4}
              textAnchor="start"
              fill={i === 1 ? "var(--text-muted)" : "var(--accent-purple)"}
              fontSize="9.5"
              fontFamily="var(--font-mono)"
            >
              {z > 0 ? `+${z}` : z}.0 Z
            </text>
          ))}

          {/* X-Axis timestamps */}
          {chartData.map((d, i) => {
            const labelStep = Math.max(1, Math.ceil(chartData.length / 8));
            if (i % labelStep !== 0 && i !== chartData.length - 1) return null;
            return (
              <text key={`xt-${i}`}
                x={getXv(i)}
                y={VH - PAD.bottom + 16}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {d.timestamp}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ── Hover / Status Bar ───────────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 14px",
          backgroundColor: "var(--bg-secondary)",
          borderRadius: "6px",
          border: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          minHeight: "44px",
        }}
      >
        {hover ? (
          <>
            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                ⏱ {hover.timestamp}{hover.isInterpolated ? " ~" : ""}
              </span>
              <span>
                Price:{" "}
                <strong className="font-mono" style={{ color: "var(--accent-green)", fontSize: "13px" }}>
                  ${hover.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
                {hover.isInterpolated && (
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "4px" }}>(interpolated)</span>
                )}
              </span>
              <span>
                Sentiment Z-Score:{" "}
                <strong
                  className="font-mono"
                  style={{ color: hover.sentimentZ >= 0 ? "var(--accent-purple)" : "var(--accent-red)", fontSize: "13px" }}
                >
                  {hover.sentimentZ >= 0 ? `+${hover.sentimentZ.toFixed(4)}` : hover.sentimentZ.toFixed(4)}
                </strong>
              </span>
            </div>
            {hover.eventTitle && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="badge badge-cyan font-mono" style={{ fontSize: "10px" }}>EVENT</span>
                <span style={{ color: "var(--text-primary)", fontStyle: "italic", fontSize: "11px" }}>
                  &quot;{hover.eventTitle}&quot;
                </span>
              </div>
            )}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Hover anywhere on the chart to inspect price & sentiment values — interpolated between ticks.
          </span>
        )}
      </div>
    </div>
  );
}
