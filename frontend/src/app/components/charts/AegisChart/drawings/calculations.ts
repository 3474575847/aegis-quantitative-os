import { ChartPoint, Drawing, DrawingType, MeasurementResult } from '../types';

export function calculateMeasurement(start: ChartPoint, end: ChartPoint): MeasurementResult {
  const priceStart = start.price;
  const priceEnd = end.price;
  const priceChange = priceEnd - priceStart;
  const returnPct = priceStart !== 0 ? priceChange / priceStart : 0;

  const timeDiffSec = Math.abs(end.time - start.time);
  const calendarDays = Math.round(timeDiffSec / 86400);

  // Approximate trading days (5/7th of calendar days, min 1 if non-zero time diff)
  const tradingDays = calendarDays > 0 ? Math.max(1, Math.round(calendarDays * (5 / 7))) : 0;

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
