'use client';

import React from 'react';
import { formatFigure, formatPercent, formatSignedFigure } from '../../../../lib/api';
import { calculateMeasurement, isDrawingHit, isMeasurementHit } from './drawings/calculations';
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
  drawingColor?: string;
  drawingLineWidth?: number;
  drawings: Drawing[];
  measurements: MeasurementResult[];
  selectedDrawingId: string | null;
  signals: AegisSignalOverlay[];
  events: AegisEventOverlay[];
  backtests: BacktestTradeOverlay[];
  showSignals: boolean;
  showEvents: boolean;
  showBacktests: boolean;
  redrawKey?: number;
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  xToTime: (x: number) => number | null;
  yToPrice: (y: number) => number | null;
  onAddDrawing: (drawing: Drawing) => void;
  onUpdateDrawing: (drawing: Drawing) => void;
  onAddMeasurement: (measurement: MeasurementResult) => void;
  onUpdateMeasurement: (measurement: MeasurementResult) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveMeasurement: (id: string) => void;
  onSelectDrawing: (id: string | null) => void;
  onReturnToCursor: () => void;
}

export default function DrawingOverlayCanvas({
  width,
  height,
  activeDrawingTool,
  drawingColor = '#00e5ff',
  drawingLineWidth = 2,
  drawings,
  measurements,
  selectedDrawingId,
  signals,
  events,
  backtests,
  showSignals,
  showEvents,
  showBacktests,
  redrawKey,
  timeToX,
  priceToY,
  xToTime,
  yToPrice,
  onAddDrawing,
  onUpdateDrawing,
  onAddMeasurement,
  onUpdateMeasurement,
  onRemoveDrawing,
  onRemoveMeasurement,
  onSelectDrawing,
  onReturnToCursor,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // In-progress drag-to-create state
  const [isMouseCreating, setIsMouseCreating] = React.useState(false);
  const [startPoint, setStartPoint] = React.useState<ChartPoint | null>(null);
  const [currentMousePoint, setCurrentMousePoint] = React.useState<ChartPoint | null>(null);

  // Dragging existing handle endpoint
  const [activeHandle, setActiveHandle] = React.useState<{
    type: 'drawing' | 'measurement';
    id: string;
    pointIndex: number;
  } | null>(null);

  // Dragging entire existing drawing or measurement (translation)
  const [activeMove, setActiveMove] = React.useState<{
    type: 'drawing' | 'measurement';
    id: string;
    startPoint: ChartPoint;
    initialDrawingPoints?: ChartPoint[];
    initialMeasStart?: ChartPoint;
    initialMeasEnd?: ChartPoint;
  } | null>(null);

  // Hover card state for signals/events/backtests
  const [hoverCard, setHoverCard] = React.useState<{
    x: number;
    y: number;
    title: string;
    items: Array<{ label: string; value: string }>;
  } | null>(null);

  // Hovering interactive element state for dynamic pointerEvents in cursor mode
  const [isHoveringInteractive, setIsHoveringInteractive] = React.useState(false);

  // Keyboard shortcut listener (Escape to cancel/deselect, Delete/Backspace to delete selected)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'Escape') {
        setIsMouseCreating(false);
        setStartPoint(null);
        setCurrentMousePoint(null);
        setActiveHandle(null);
        setActiveMove(null);
        onSelectDrawing(null);
        onReturnToCursor();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDrawingId) {
          onRemoveDrawing(selectedDrawingId);
          onRemoveMeasurement(selectedDrawingId);
          onSelectDrawing(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrawingId, onRemoveDrawing, onRemoveMeasurement, onSelectDrawing, onReturnToCursor]);

  // Redraw canvas on dependencies (including redrawKey for pan/zoom synchronization)
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 1. Render persistent drawings
    drawings.forEach((drawing) => {
      renderDrawingItem(ctx, drawing, selectedDrawingId === drawing.id, timeToX, priceToY);
    });

    // 2. Render measurements
    measurements.forEach((m) => {
      renderMeasurementItem(ctx, m, selectedDrawingId === m.id, timeToX, priceToY);
    });

    // 3. Render in-progress drawing preview
    if (isMouseCreating && startPoint && currentMousePoint) {
      renderInProgressPreview(
        ctx,
        activeDrawingTool,
        startPoint,
        currentMousePoint,
        timeToX,
        priceToY,
        drawingColor,
        drawingLineWidth
      );
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
    drawingColor,
    drawingLineWidth,
    drawings,
    measurements,
    selectedDrawingId,
    isMouseCreating,
    startPoint,
    currentMousePoint,
    signals,
    events,
    backtests,
    showSignals,
    showEvents,
    showBacktests,
    redrawKey,
    timeToX,
    priceToY,
  ]);

  // Pointer Down: Start creating, dragging handle, or dragging whole drawing
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = xToTime(x);
    const price = yToPrice(y);
    if (time === null || price === null) return;
    const point: ChartPoint = { time, price };

    // 1. Check hit test for existing endpoint handles first (editing handles)
    for (const m of measurements) {
      const sx1 = timeToX(m.start.time);
      const sy1 = priceToY(m.start.price);
      const sx2 = timeToX(m.end.time);
      const sy2 = priceToY(m.end.price);
      if (sx1 !== null && sy1 !== null && Math.hypot(sx1 - x, sy1 - y) < 14) {
        setActiveHandle({ type: 'measurement', id: m.id, pointIndex: 0 });
        onSelectDrawing(m.id);
        return;
      }
      if (sx2 !== null && sy2 !== null && Math.hypot(sx2 - x, sy2 - y) < 14) {
        setActiveHandle({ type: 'measurement', id: m.id, pointIndex: 1 });
        onSelectDrawing(m.id);
        return;
      }
    }

    for (const d of drawings) {
      for (let i = 0; i < d.points.length; i++) {
        const px = timeToX(d.points[i].time);
        const py = priceToY(d.points[i].price);
        if (px !== null && py !== null && Math.hypot(px - x, py - y) < 14) {
          setActiveHandle({ type: 'drawing', id: d.id, pointIndex: i });
          onSelectDrawing(d.id);
          return;
        }
      }
    }

    // 2. Check hit test for drawing bodies or measurement bodies (whole translation)
    if (activeDrawingTool === 'select' || activeDrawingTool === 'cursor' || selectedDrawingId) {
      for (const m of measurements) {
        if (isMeasurementHit(m, x, y, timeToX, priceToY)) {
          onSelectDrawing(m.id);
          setActiveMove({
            type: 'measurement',
            id: m.id,
            startPoint: point,
            initialMeasStart: { ...m.start },
            initialMeasEnd: { ...m.end },
          });
          return;
        }
      }

      for (const d of drawings) {
        if (isDrawingHit(d, x, y, timeToX, priceToY, width)) {
          onSelectDrawing(d.id);
          setActiveMove({
            type: 'drawing',
            id: d.id,
            startPoint: point,
            initialDrawingPoints: d.points.map((p) => ({ ...p })),
          });
          return;
        }
      }
    }

    if (activeDrawingTool === 'cursor' || activeDrawingTool === 'select') {
      onSelectDrawing(null);
      return;
    }

    // Single click tools
    if (activeDrawingTool === 'horizontalLine' || activeDrawingTool === 'verticalLine' || activeDrawingTool === 'text') {
      const textPrompt = activeDrawingTool === 'text' ? prompt('Enter annotation text:', 'Aegis Note') : undefined;
      const newDrawing: Drawing = {
        id: `draw-${Date.now()}`,
        type: activeDrawingTool,
        points: [point],
        text: textPrompt ?? undefined,
        style: {
          color: drawingColor,
          lineWidth: drawingLineWidth,
          lineStyle: 'solid',
          fillColor: `${drawingColor}22`,
        },
      };
      onAddDrawing(newDrawing);
      onReturnToCursor();
      return;
    }

    // Two-point drag-to-create tools (Trendline, Ray, Rectangle, Arrow, Fibonacci, Ruler)
    setIsMouseCreating(true);
    setStartPoint(point);
    setCurrentMousePoint(point);
  };

  // Pointer Move: Update creation preview, handle position, moving drawing, or hit detection
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeDrawingTool !== 'cursor' || isMouseCreating || activeHandle || activeMove) {
      e.preventDefault();
      e.stopPropagation();
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = xToTime(x);
    const price = yToPrice(y);

    if (time !== null && price !== null) {
      const point: ChartPoint = { time, price };
      setCurrentMousePoint(point);

      // Handle dragging existing endpoint handle
      if (activeHandle) {
        if (activeHandle.type === 'drawing') {
          const target = drawings.find((d) => d.id === activeHandle.id);
          if (target) {
            const newPoints = [...target.points];
            newPoints[activeHandle.pointIndex] = point;
            onUpdateDrawing({ ...target, points: newPoints });
          }
        } else if (activeHandle.type === 'measurement') {
          const target = measurements.find((m) => m.id === activeHandle.id);
          if (target) {
            const start = activeHandle.pointIndex === 0 ? point : target.start;
            const end = activeHandle.pointIndex === 1 ? point : target.end;
            const updated = calculateMeasurement(start, end);
            onUpdateMeasurement({ ...updated, id: target.id });
          }
        }
        return;
      }

      // Handle translating whole drawing or measurement
      if (activeMove) {
        const deltaT = point.time - activeMove.startPoint.time;
        const deltaP = point.price - activeMove.startPoint.price;

        if (activeMove.type === 'drawing' && activeMove.initialDrawingPoints) {
          const target = drawings.find((d) => d.id === activeMove.id);
          if (target) {
            const newPoints = activeMove.initialDrawingPoints.map((pt) => ({
              time: pt.time + deltaT,
              price: pt.price + deltaP,
            }));
            onUpdateDrawing({ ...target, points: newPoints });
          }
        } else if (
          activeMove.type === 'measurement' &&
          activeMove.initialMeasStart &&
          activeMove.initialMeasEnd
        ) {
          const target = measurements.find((m) => m.id === activeMove.id);
          if (target) {
            const newStart: ChartPoint = {
              time: activeMove.initialMeasStart.time + deltaT,
              price: activeMove.initialMeasStart.price + deltaP,
            };
            const newEnd: ChartPoint = {
              time: activeMove.initialMeasEnd.time + deltaT,
              price: activeMove.initialMeasEnd.price + deltaP,
            };
            const updated = calculateMeasurement(newStart, newEnd);
            onUpdateMeasurement({ ...updated, id: target.id });
          }
        }
        return;
      }
    }

    // Hit test check for active handles / drawings / overlays to maintain interactive hover
    let isHit = false;
    for (const m of measurements) {
      if (isMeasurementHit(m, x, y, timeToX, priceToY)) {
        isHit = true;
        break;
      }
    }
    if (!isHit) {
      for (const d of drawings) {
        if (isDrawingHit(d, x, y, timeToX, priceToY, width)) {
          isHit = true;
          break;
        }
      }
    }

    // Hover cards for Signals / Events / Backtests
    if (showSignals || showEvents || showBacktests) {
      let hitCard: { x: number; y: number; title: string; items: Array<{ label: string; value: string }> } | null = null;

      if (showSignals) {
        for (const sig of signals) {
          const t = Math.floor(Date.parse(sig.market_timestamp) / 1000);
          const sx = timeToX(t);
          if (sx !== null && Math.abs(sx - x) < 14) {
            isHit = true;
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
            isHit = true;
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
            isHit = true;
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

    setIsHoveringInteractive(isHit);
  };

  // Pointer Up: Finalize drawing creation or release handles / movements
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (activeHandle) {
      setActiveHandle(null);
      return;
    }

    if (activeMove) {
      setActiveMove(null);
      return;
    }

    if (isMouseCreating && startPoint && currentMousePoint) {
      let finalEndPoint = currentMousePoint;
      const x1 = timeToX(startPoint.time);
      const y1 = priceToY(startPoint.price);
      const x2 = timeToX(currentMousePoint.time);
      const y2 = priceToY(currentMousePoint.price);

      // If clicked without dragging (distance < 5px), create a clean visible span
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null && Math.hypot(x2 - x1, y2 - y1) < 5) {
        const offsetTime = xToTime(x1 + 100) ?? (startPoint.time + 86400 * 3);
        const offsetPrice = yToPrice(y1 - 25) ?? (startPoint.price * 1.015);
        finalEndPoint = { time: offsetTime, price: offsetPrice };
      }

      if (activeDrawingTool === 'ruler') {
        const m = calculateMeasurement(startPoint, finalEndPoint);
        onAddMeasurement(m);
      } else if (activeDrawingTool !== 'cursor' && activeDrawingTool !== 'select') {
        const newDrawing: Drawing = {
          id: `draw-${Date.now()}`,
          type: activeDrawingTool,
          points: [startPoint, finalEndPoint],
          style: {
            color: drawingColor,
            lineWidth: drawingLineWidth,
            lineStyle: 'solid',
            fillColor: `${drawingColor}22`,
          },
        };
        onAddDrawing(newDrawing);
      }

      setIsMouseCreating(false);
      setStartPoint(null);
      setCurrentMousePoint(null);
      onReturnToCursor();
    }
  };

  const isCursorMode = activeDrawingTool === 'cursor';
  const isInteracting = activeHandle !== null || activeMove !== null || isMouseCreating;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        zIndex: 20,
        touchAction: isCursorMode ? 'auto' : 'none',
        pointerEvents: isCursorMode && !isInteracting ? 'none' : 'auto',
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 21,
          touchAction: isCursorMode ? 'auto' : 'none',
          pointerEvents: isCursorMode && !isInteracting ? 'none' : 'auto',
          cursor:
            activeDrawingTool === 'cursor'
              ? 'default'
              : activeDrawingTool !== 'select'
              ? 'crosshair'
              : activeHandle !== null
              ? 'grab'
              : activeMove !== null
              ? 'grabbing'
              : isHoveringInteractive
              ? 'pointer'
              : 'default',
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
  isSelected: boolean,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  if (drawing.points.length === 0) return;
  const color = drawing.style?.color ?? '#00e5ff';
  const lineWidth = drawing.style?.lineWidth ?? 2;

  ctx.strokeStyle = isSelected ? '#f59e0b' : color;
  ctx.lineWidth = isSelected ? lineWidth + 1.5 : lineWidth;
  ctx.fillStyle = drawing.style?.fillColor ?? `${color}22`;

  const p1 = drawing.points[0];
  const x1 = timeToX(p1.time);
  const y1 = priceToY(p1.price);
  if (x1 === null || y1 === null) return;

  // Endpoint handle for p1
  if (isSelected) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x1, y1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = lineWidth + 1.5;
  }

  if (drawing.type === 'horizontalLine') {
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(ctx.canvas.width, y1);
    ctx.stroke();

    // Price tag pill on the right
    ctx.fillStyle = isSelected ? '#f59e0b' : color;
    const priceText = `$${formatFigure(p1.price)}`;
    ctx.font = 'bold 10px var(--font-mono, monospace)';
    const textWidth = ctx.measureText(priceText).width;
    const tagX = ctx.canvas.width - textWidth - 14;
    ctx.fillRect(tagX - 4, y1 - 9, textWidth + 8, 18);
    ctx.fillStyle = '#080a0f';
    ctx.fillText(priceText, tagX, y1 + 3);
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
    const text = drawing.text ?? 'Note';
    ctx.font = 'bold 12px var(--font-mono, monospace)';
    const tw = ctx.measureText(text).width;
    // Background card for text note
    ctx.fillStyle = 'rgba(18, 24, 36, 0.9)';
    ctx.fillRect(x1 + 4, y1 - 18, tw + 12, 22);
    ctx.strokeStyle = isSelected ? '#f59e0b' : color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1 + 4, y1 - 18, tw + 12, 22);

    ctx.fillStyle = isSelected ? '#f59e0b' : color;
    ctx.fillText(text, x1 + 10, y1 - 3);
    return;
  }

  if (drawing.points.length < 2) return;
  const p2 = drawing.points[1];
  const x2 = timeToX(p2.time);
  const y2 = priceToY(p2.price);
  if (x2 === null || y2 === null) return;

  // Endpoint handle for p2
  if (isSelected) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x2, y2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = lineWidth + 1.5;
  }

  if (drawing.type === 'trendline') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (drawing.type === 'ray') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + Math.cos(angle) * 3000, y1 + Math.sin(angle) * 3000);
    ctx.stroke();
  } else if (drawing.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = isSelected ? '#f59e0b' : color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12 * Math.cos(angle - Math.PI / 6), y2 - 12 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - 12 * Math.cos(angle + Math.PI / 6), y2 - 12 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (drawing.type === 'rectangle') {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.fillStyle = drawing.style?.fillColor ?? `${color}22`;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  } else if (drawing.type === 'fibonacci') {
    const levels = [
      { lvl: 0, label: '0.0%', c: '#94a3b8' },
      { lvl: 0.236, label: '23.6%', c: '#a855f7' },
      { lvl: 0.382, label: '38.2%', c: '#38bdf8' },
      { lvl: 0.5, label: '50.0%', c: '#00e5ff' },
      { lvl: 0.618, label: '61.8%', c: '#10b981' },
      { lvl: 0.786, label: '78.6%', c: '#f59e0b' },
      { lvl: 1.0, label: '100.0%', c: '#f43f5e' },
    ];
    const diff = p2.price - p1.price;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    levels.forEach(({ lvl, label, c }) => {
      const fibPrice = p1.price + diff * lvl;
      const fy = priceToY(fibPrice);
      if (fy !== null) {
        ctx.strokeStyle = isSelected ? '#f59e0b' : (drawing.style?.color || c);
        ctx.lineWidth = lvl === 0.5 || lvl === 0.618 ? 2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(minX, fy);
        ctx.lineTo(maxX, fy);
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#f59e0b' : c;
        ctx.font = 'bold 10px var(--font-mono, monospace)';
        ctx.fillText(`${label} ($${formatFigure(fibPrice)})`, maxX + 6, fy + 3);
      }
    });
  }
}

function renderMeasurementItem(
  ctx: CanvasRenderingContext2D,
  m: MeasurementResult,
  isSelected: boolean,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null
) {
  const x1 = timeToX(m.start.time);
  const y1 = priceToY(m.start.price);
  const x2 = timeToX(m.end.time);
  const y2 = priceToY(m.end.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  // Dotted box and diagonal
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);

  ctx.fillStyle = m.priceChange >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)';
  ctx.fillRect(rx, ry, rw, rh);

  ctx.strokeStyle = isSelected ? '#f59e0b' : '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Endpoint handles
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(x1, y1, 5, 0, Math.PI * 2);
  ctx.arc(x2, y2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Badge callout
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  ctx.fillStyle = 'rgba(18, 24, 36, 0.95)';
  ctx.strokeStyle = '#f59e0b';
  ctx.fillRect(midX - 65, midY - 22, 130, 44);
  ctx.strokeRect(midX - 65, midY - 22, 130, 44);

  ctx.fillStyle = m.priceChange >= 0 ? '#10b981' : '#f43f5e';
  ctx.font = 'bold 11px var(--font-mono, monospace)';
  ctx.textAlign = 'center';
  ctx.fillText(`${formatSignedFigure(m.priceChange)} (${formatPercent(m.returnPct)})`, midX, midY - 4);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px var(--font-mono, monospace)';
  ctx.fillText(m.formattedTimeSpan || `${m.calendarDays}d (${m.tradingDays} session)`, midX, midY + 12);
  ctx.textAlign = 'left';
}

function renderInProgressPreview(
  ctx: CanvasRenderingContext2D,
  tool: DrawingType,
  start: ChartPoint,
  curr: ChartPoint,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  drawingColor: string,
  drawingLineWidth: number
) {
  const x1 = timeToX(start.time);
  const y1 = priceToY(start.price);
  const x2 = timeToX(curr.time);
  const y2 = priceToY(curr.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;

  ctx.strokeStyle = drawingColor || '#00e5ff';
  ctx.lineWidth = Math.max(2, drawingLineWidth);
  ctx.setLineDash([4, 4]);

  if (tool === 'ruler') {
    ctx.strokeStyle = '#f59e0b';
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (tool === 'rectangle') {
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.fillStyle = `${drawingColor}22`;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  } else if (tool === 'horizontalLine') {
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(ctx.canvas.width, y1);
    ctx.stroke();
  } else if (tool === 'verticalLine') {
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, ctx.canvas.height);
    ctx.stroke();
  } else if (tool === 'fibonacci') {
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const diff = curr.price - start.price;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    levels.forEach((lvl) => {
      const fibPrice = start.price + diff * lvl;
      const fy = priceToY(fibPrice);
      if (fy !== null) {
        ctx.beginPath();
        ctx.moveTo(minX, fy);
        ctx.lineTo(maxX, fy);
        ctx.stroke();
      }
    });
  } else {
    // trendline, ray, arrow
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
