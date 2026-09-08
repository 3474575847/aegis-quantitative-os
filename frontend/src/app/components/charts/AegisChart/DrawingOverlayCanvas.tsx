'use client';

import React from 'react';
import { formatFigure, formatPercent, formatSignedFigure } from '../../../../lib/api';
import { calculateMeasurement } from './drawings/calculations';
import {
  AegisEventOverlay,
  AegisSignalOverlay,
  BacktestTradeOverlay,
  ChartPoint,
  Drawing,
  DrawingType,
  MeasurementResult,
} from './types';

interface Props {
  width: number;
  height: number;
  activeDrawingTool: DrawingType;
  drawings: Drawing[];
  measurements: MeasurementResult[];
  signals: AegisSignalOverlay[];
  events: AegisEventOverlay[];
  backtests: BacktestTradeOverlay[];
  showSignals: boolean;
  showEvents: boolean;
  showBacktests: boolean;
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  xToTime: (x: number) => number | null;
  yToPrice: (y: number) => number | null;
  onAddDrawing: (drawing: Drawing) => void;
  onAddMeasurement: (measurement: MeasurementResult) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveMeasurement: (id: string) => void;
}

export default function DrawingOverlayCanvas({
  width,
  height,
  activeDrawingTool,
  drawings,
  measurements,
  signals,
  events,
  backtests,
  showSignals,
  showEvents,
  showBacktests,
  timeToX,
  priceToY,
  xToTime,
  yToPrice,
  onAddDrawing,
  onAddMeasurement,
  onRemoveDrawing,
  onRemoveMeasurement,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // In-progress drawing state
  const [startPoint, setStartPoint] = React.useState<ChartPoint | null>(null);
  const [currentMousePoint, setCurrentMousePoint] = React.useState<ChartPoint | null>(null);

  // Dragging existing drawing/measurement endpoint
  const [dragTarget, setDragTarget] = React.useState<{
    type: 'drawing' | 'measurement';
    id: string;
    pointIndex: number;
  } | null>(null);

  // Hover card state for signals/events/backtests
  const [hoverCard, setHoverCard] = React.useState<{
    x: number;
    y: number;
    title: string;
    items: Array<{ label: string; value: string }>;
  } | null>(null);

  // Keyboard shortcut listener (Escape to cancel tool, Delete to clear selected)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStartPoint(null);
        setCurrentMousePoint(null);
        setDragTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Redraw canvas on dependencies
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 1. Render persistent drawings
    drawings.forEach((drawing) => {
      renderDrawingItem(ctx, drawing, timeToX, priceToY);
    });

    // 2. Render measurements
    measurements.forEach((m) => {
      renderMeasurementItem(ctx, m, timeToX, priceToY);
    });

    // 3. Render in-progress drawing preview
    if (startPoint && currentMousePoint) {
      renderInProgressPreview(ctx, activeDrawingTool, startPoint, currentMousePoint, timeToX, priceToY);
    }

    // 4. Render intelligence overlays
    if (showSignals) {
      signals.forEach((sig) => renderSignalMarker(ctx, sig, timeToX, priceToY));
    }
    if (showEvents) {
      events.forEach((evt) => renderEventMarker(ctx, evt, timeToX, priceToY));
    }
    if (showBacktests) {
      backtests.forEach((bt) => renderBacktestMarker(ctx, bt, timeToX, priceToY));
    }
  }, [
    width,
    height,
    activeDrawingTool,
    drawings,
    measurements,
    startPoint,
    currentMousePoint,
    signals,
    events,
    backtests,
    showSignals,
    showEvents,
    showBacktests,
    timeToX,
    priceToY,
  ]);

  // Click handler to create drawings / measurements
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeDrawingTool === 'cursor') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = xToTime(x);
    const price = yToPrice(y);

    if (time === null || price === null) return;
    const clickedPoint: ChartPoint = { time, price };

    // Single-click tools (Horizontal / Vertical line / Text)
    if (activeDrawingTool === 'horizontalLine' || activeDrawingTool === 'verticalLine' || activeDrawingTool === 'text') {
      const textPrompt = activeDrawingTool === 'text' ? prompt('Enter annotation text:', 'Aegis Note') : undefined;
      const newDrawing: Drawing = {
        id: `draw-${Date.now()}`,
        type: activeDrawingTool,
        points: [clickedPoint],
        text: textPrompt ?? undefined,
        style: { color: '#00e5ff', lineWidth: 1.5, lineStyle: 'solid' },
      };
      onAddDrawing(newDrawing);
      setStartPoint(null);
      setCurrentMousePoint(null);
      return;
    }

    // Two-point tools (Ruler, Trendline, Ray, Rectangle, Arrow, Fibonacci)
    if (!startPoint) {
      setStartPoint(clickedPoint);
    } else {
      if (activeDrawingTool === 'ruler') {
        const m = calculateMeasurement(startPoint, clickedPoint);
        onAddMeasurement(m);
      } else {
        const newDrawing: Drawing = {
          id: `draw-${Date.now()}`,
          type: activeDrawingTool,
          points: [startPoint, clickedPoint],
          style: {
            color: activeDrawingTool === 'fibonacci' ? '#8b5cf6' : '#00e5ff',
            lineWidth: 1.5,
            lineStyle: 'solid',
            fillColor: 'rgba(0, 229, 255, 0.08)',
          },
        };
        onAddDrawing(newDrawing);
      }
      setStartPoint(null);
      setCurrentMousePoint(null);
    }
  };

  // Mouse move handler for hover cards and drawing preview
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = xToTime(x);
    const price = yToPrice(y);

    if (time !== null && price !== null) {
      setCurrentMousePoint({ time, price });
    }

    // Check hit test for signals / events / backtests hover cards
    if (showSignals || showEvents || showBacktests) {
      let hitCard: { x: number; y: number; title: string; items: Array<{ label: string; value: string }> } | null = null;

      if (showSignals) {
        for (const sig of signals) {
          const t = Math.floor(Date.parse(sig.market_timestamp) / 1000);
          const sx = timeToX(t);
          if (sx !== null && Math.abs(sx - x) < 14) {
            hitCard = {
              x: sx,
              y: y - 10,
              title: `AEGIS SIGNAL: ${sig.action}`,
              items: [
                { label: 'Score', value: sig.score != null ? formatSignedFigure(sig.score) : 'N/A' },
                { label: 'Confidence', value: `${Math.round((sig.confidence ?? 0) * 100)}%` },
                { label: 'Headline', value: sig.headline ?? sig.rationale },
                { label: 'Timestamp', value: sig.market_timestamp },
              ],
            };
            break;
          }
        }
      }

      if (!hitCard && showEvents) {
        for (const evt of events) {
          const t = typeof evt.timestamp === 'number' ? evt.timestamp : Math.floor(Date.parse(evt.timestamp) / 1000);
          const ex = timeToX(t);
          if (ex !== null && Math.abs(ex - x) < 14) {
            hitCard = {
              x: ex,
              y: y - 10,
              title: `EVENT: ${evt.type.toUpperCase()}`,
              items: [
                { label: 'Title', value: evt.title },
                { label: 'Sentiment', value: evt.sentiment?.toUpperCase() ?? 'NEUTRAL' },
                { label: 'Sources', value: evt.sourcesCount ? `${evt.sourcesCount} corroborated` : '1 source' },
              ],
            };
            break;
          }
        }
      }

      if (!hitCard && showBacktests) {
        for (const bt of backtests) {
          const t1 = typeof bt.entryTimestamp === 'number' ? bt.entryTimestamp : Math.floor(Date.parse(bt.entryTimestamp) / 1000);
          const bx = timeToX(t1);
          if (bx !== null && Math.abs(bx - x) < 14) {
            hitCard = {
              x: bx,
              y: y - 10,
              title: `BACKTEST TRADE: ${bt.direction}`,
              items: [
                { label: 'Entry Price', value: `$${formatFigure(bt.entryPrice)}` },
                { label: 'Exit Price', value: bt.exitPrice != null ? `$${formatFigure(bt.exitPrice)}` : 'Open' },
                { label: 'Return', value: bt.returnPct != null ? formatPercent(bt.returnPct) : 'N/A' },
                { label: 'Holding', value: bt.holdingPeriodDays ? `${bt.holdingPeriodDays} days` : 'N/A' },
              ],
            };
            break;
          }
        }
      }

      setHoverCard(hitCard);
    }
  };

  const isCursorMode = activeDrawingTool === 'cursor';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: isCursorMode ? 'none' : 'auto',
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        style={{
          cursor: activeDrawingTool !== 'cursor' ? 'crosshair' : 'default',
        }}
      />

      {/* Hover tooltip card */}
      {hoverCard && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(hoverCard.x + 12, width - 240),
            top: Math.max(hoverCard.y - 80, 10),
            background: '#121824',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            borderRadius: 6,
            padding: 10,
            zIndex: 200,
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#f8fafc',
            pointerEvents: 'none',
            maxWidth: 240,
            boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ color: '#00e5ff', fontWeight: 700, marginBottom: 4 }}>{hoverCard.title}</div>
          {hoverCard.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, margin: '2px 0' }}>
              <span style={{ color: '#64748b' }}>{item.label}:</span>
              <span style={{ color: '#f8fafc', wordBreak: 'break-word', textAlign: 'right' }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Renderers
// ---------------------------------------------------------------------------

function renderDrawingItem(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  if (drawing.points.length === 0) return;
  ctx.strokeStyle = drawing.style?.color ?? '#00e5ff';
  ctx.lineWidth = drawing.style?.lineWidth ?? 1.5;
  ctx.fillStyle = drawing.style?.fillColor ?? 'rgba(0, 229, 255, 0.1)';

  const p1 = drawing.points[0];
  const x1 = timeToX(p1.time);
  const y1 = priceToY(p1.price);
  if (x1 === null || y1 === null) return;

  if (drawing.type === 'horizontalLine') {
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(ctx.canvas.width, y1);
    ctx.stroke();
    return;
  }

  if (drawing.type === 'verticalLine') {
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, ctx.canvas.height);
    ctx.stroke();
    return;
  }

  if (drawing.type === 'text') {
    ctx.fillStyle = drawing.style?.color ?? '#00e5ff';
    ctx.font = '12px var(--font-mono, monospace)';
    ctx.fillText(drawing.text ?? 'Note', x1 + 4, y1 - 4);
    return;
  }

  if (drawing.points.length < 2) return;
  const p2 = drawing.points[1];
  const x2 = timeToX(p2.time);
  const y2 = priceToY(p2.price);
  if (x2 === null || y2 === null) return;

  if (drawing.type === 'trendline') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (drawing.type === 'rectangle') {
    const rw = x2 - x1;
    const rh = y2 - y1;
    ctx.fillRect(x1, y1, rw, rh);
    ctx.strokeRect(x1, y1, rw, rh);
  } else if (drawing.type === 'fibonacci') {
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const diff = p2.price - p1.price;

    levels.forEach((lvl) => {
      const fibPrice = p1.price + diff * lvl;
      const fy = priceToY(fibPrice);
      if (fy !== null) {
        ctx.strokeStyle = lvl === 0.5 || lvl === 0.618 ? '#00e5ff' : '#8b5cf6';
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), fy);
        ctx.lineTo(Math.max(x1, x2), fy);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px var(--font-mono, monospace)';
        ctx.fillText(`${(lvl * 100).toFixed(1)}% ($${formatFigure(fibPrice)})`, Math.max(x1, x2) + 4, fy + 3);
      }
    });
  }
}

function renderMeasurementItem(
  ctx: CanvasRenderingContext2D,
  m: MeasurementResult,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  const x1 = timeToX(m.start.time);
  const y1 = priceToY(m.start.price);
  const x2 = timeToX(m.end.time);
  const y2 = priceToY(m.end.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  // Dotted box and diagonal
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Endpoint handles
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(x1, y1, 4, 0, Math.PI * 2);
  ctx.arc(x2, y2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Badge callout
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = 'rgba(18, 24, 36, 0.9)';
  ctx.strokeStyle = '#f59e0b';
  ctx.fillRect(midX - 60, midY - 20, 120, 40);
  ctx.strokeRect(midX - 60, midY - 20, 120, 40);

  ctx.fillStyle = m.priceChange >= 0 ? '#10b981' : '#f43f5e';
  ctx.font = 'bold 11px var(--font-mono, monospace)';
  ctx.textAlign = 'center';
  ctx.fillText(`${formatSignedFigure(m.priceChange)} (${formatPercent(m.returnPct)})`, midX, midY - 4);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px var(--font-mono, monospace)';
  ctx.fillText(`${m.calendarDays}d (${m.tradingDays} session)`, midX, midY + 12);
  ctx.textAlign = 'left';
}

function renderInProgressPreview(
  ctx: CanvasRenderingContext2D,
  tool: DrawingType,
  start: ChartPoint,
  curr: ChartPoint,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  const x1 = timeToX(start.time);
  const y1 = priceToY(start.price);
  const x2 = timeToX(curr.time);
  const y2 = priceToY(curr.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  if (tool === 'ruler') {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function renderSignalMarker(
  ctx: CanvasRenderingContext2D,
  sig: AegisSignalOverlay,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  const t = Math.floor(Date.parse(sig.market_timestamp) / 1000);
  const x = timeToX(t);
  if (x === null) return;

  const y = 30; // Render signal tags near top pane
  const color = sig.action === 'BUY' ? '#10b981' : '#f43f5e';

  ctx.fillStyle = color;
  ctx.beginPath();
  if (sig.action === 'BUY') {
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 10);
    ctx.lineTo(x + 6, y + 10);
  } else {
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x - 6, y);
    ctx.lineTo(x + 6, y);
  }
  ctx.fill();
}

function renderEventMarker(
  ctx: CanvasRenderingContext2D,
  evt: AegisEventOverlay,
  timeToX: (t: number) => number | null,
  _priceToY: (p: number) => number | null
) {
  const t = typeof evt.timestamp === 'number' ? evt.timestamp : Math.floor(Date.parse(evt.timestamp) / 1000);
  const x = timeToX(t);
  if (x === null) return;

  ctx.fillStyle = '#8b5cf6';
  ctx.beginPath();
  ctx.arc(x, 15, 4, 0, Math.PI * 2);
  ctx.fill();
}

function renderBacktestMarker(
  ctx: CanvasRenderingContext2D,
  bt: BacktestTradeOverlay,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  const t1 = typeof bt.entryTimestamp === 'number' ? bt.entryTimestamp : Math.floor(Date.parse(bt.entryTimestamp) / 1000);
  const x1 = timeToX(t1);
  const y1 = priceToY(bt.entryPrice);
  if (x1 === null || y1 === null) return;

  ctx.fillStyle = '#10b981';
  ctx.fillRect(x1 - 4, y1 - 4, 8, 8);
}
