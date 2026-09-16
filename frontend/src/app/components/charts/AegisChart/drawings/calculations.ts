import { ChartPoint, Drawing, DrawingType, MeasurementResult } from '../types';

export function calculateMeasurement(start: ChartPoint, end: ChartPoint): MeasurementResult {
  const priceStart = start.price;
  const priceEnd = end.price;
  const priceChange = priceEnd - priceStart;
  const returnPct = priceStart !== 0 ? priceChange / priceStart : 0;

  const timeDiffSec = Math.abs(end.time - start.time);
  const calendarDays = Math.floor(timeDiffSec / 86400);

  // Approximate trading days (5/7th of calendar days, min 1 if non-zero time diff and >= 1d)
  const tradingDays = calendarDays > 0 ? Math.max(1, Math.round(calendarDays * (5 / 7))) : 0;

  let formattedTimeSpan = '';
  if (timeDiffSec < 86400) {
    const hours = Math.floor(timeDiffSec / 3600);
    const mins = Math.floor((timeDiffSec % 3600) / 60);
    if (hours > 0) {
      formattedTimeSpan = `${hours}h ${mins}m`;
    } else {
      formattedTimeSpan = `${mins}m`;
    }
  } else {
    formattedTimeSpan = `${calendarDays}d (${tradingDays} session)`;
  }

  // Annualized return (compound)
  let annualizedReturn: number | undefined;
  if (calendarDays > 0 && priceStart > 0 && priceEnd > 0) {
    const years = calendarDays / 365;
    annualizedReturn = Math.pow(priceEnd / priceStart, 1 / years) - 1;
  }

  return {
    id: `meas-${start.time}-${end.time}`,
    start,
    end,
    priceStart,
    priceEnd,
    priceChange,
    returnPct,
    calendarDays,
    tradingDays,
    formattedTimeSpan,
    annualizedReturn,
  };
}

export function serializeDrawings(drawings: Drawing[]): string {
  return JSON.stringify(drawings);
}

export function deserializeDrawings(jsonStr: string): Drawing[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.type === 'string' &&
        Array.isArray(item.points)
    );
  } catch {
    return [];
  }
}

export function createDrawing(
  type: DrawingType,
  start: ChartPoint,
  end?: ChartPoint,
  text?: string
): Drawing {
  const points: ChartPoint[] = [start];
  if (end) points.push(end);

  return {
    id: `draw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    points,
    text: text ?? (type === 'text' ? 'Annotation' : undefined),
    style: {
      color: type === 'fibonacci' ? '#8b5cf6' : type === 'ruler' ? '#f59e0b' : '#00e5ff',
      lineWidth: 1.5,
      lineStyle: 'solid',
      fillColor: 'rgba(0, 229, 255, 0.1)',
    },
  };
}

// ---------------------------------------------------------------------------
// Geometric Hit-Testing & Coordinate Projection
// ---------------------------------------------------------------------------

export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY);
}

export function pointToRayDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, ((px - x1) * dx + (py - y1) * dy) / l2);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function isPointInOrNearRect(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  threshold = 8
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  // Check if inside bounding box
  if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
    return true;
  }

  // Check proximity to borders
  const dLeft = pointToSegmentDistance(px, py, minX, minY, minX, maxY);
  const dRight = pointToSegmentDistance(px, py, maxX, minY, maxX, maxY);
  const dTop = pointToSegmentDistance(px, py, minX, minY, maxX, minY);
  const dBottom = pointToSegmentDistance(px, py, minX, maxY, maxX, maxY);
  return Math.min(dLeft, dRight, dTop, dBottom) <= threshold;
}

export function isDrawingHit(
  drawing: Drawing,
  x: number,
  y: number,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  canvasWidth: number,
  threshold = 8
): boolean {
  if (drawing.points.length === 0) return false;

  const p1 = drawing.points[0];
  const x1 = timeToX(p1.time);
  const y1 = priceToY(p1.price);
  if (x1 === null || y1 === null) return false;

  // Endpoint handles are always hits
  if (Math.hypot(x1 - x, y1 - y) <= 12) return true;

  if (drawing.type === 'horizontalLine') {
    return Math.abs(y - y1) <= threshold && x >= 0 && x <= canvasWidth;
  }

  if (drawing.type === 'verticalLine') {
    return Math.abs(x - x1) <= threshold;
  }

  if (drawing.type === 'text') {
    return (
      x >= x1 - 4 &&
      x <= x1 + 100 &&
      y >= y1 - 20 &&
      y <= y1 + 10
    );
  }

  if (drawing.points.length < 2) return false;
  const p2 = drawing.points[1];
  const x2 = timeToX(p2.time);
  const y2 = priceToY(p2.price);
  if (x2 === null || y2 === null) return false;

  // Second endpoint handle
  if (Math.hypot(x2 - x, y2 - y) <= 12) return true;

  if (drawing.type === 'trendline' || drawing.type === 'arrow') {
    return pointToSegmentDistance(x, y, x1, y1, x2, y2) <= threshold;
  }

  if (drawing.type === 'ray') {
    return pointToRayDistance(x, y, x1, y1, x2, y2) <= threshold;
  }

  if (drawing.type === 'rectangle') {
    return isPointInOrNearRect(x, y, x1, y1, x2, y2, threshold);
  }

  if (drawing.type === 'fibonacci') {
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const diff = p2.price - p1.price;
    const minX = Math.min(x1, x2) - 8;
    const maxX = Math.max(x1, x2) + 80;

    if (x >= minX && x <= maxX) {
      for (const lvl of levels) {
        const fibPrice = p1.price + diff * lvl;
        const fy = priceToY(fibPrice);
        if (fy !== null && Math.abs(y - fy) <= threshold) {
          return true;
        }
      }
    }
    return pointToSegmentDistance(x, y, x1, y1, x2, y2) <= threshold;
  }

  return false;
}

export function isMeasurementHit(
  m: MeasurementResult,
  x: number,
  y: number,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  threshold = 8
): boolean {
  const x1 = timeToX(m.start.time);
  const y1 = priceToY(m.start.price);
  const x2 = timeToX(m.end.time);
  const y2 = priceToY(m.end.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return false;

  // Endpoint handles
  if (Math.hypot(x1 - x, y1 - y) <= 12 || Math.hypot(x2 - x, y2 - y) <= 12) {
    return true;
  }

  // Inside or near bounding box or diagonal
  if (isPointInOrNearRect(x, y, x1, y1, x2, y2, threshold)) {
    return true;
  }

  // Callout center badge box (width 120, height 40)
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  if (x >= midX - 65 && x <= midX + 65 && y >= midY - 25 && y <= midY + 25) {
    return true;
  }

  return false;
}

