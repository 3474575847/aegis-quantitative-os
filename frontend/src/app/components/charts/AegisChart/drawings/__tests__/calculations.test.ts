import {
  calculateMeasurement,
  createDrawing,
  deserializeDrawings,
  isDrawingHit,
  isMeasurementHit,
  isPointInOrNearRect,
  pointToSegmentDistance,
  serializeDrawings,
} from '../calculations';

describe('Drawing calculations and serialization', () => {
  it('correctly calculates price change, percentage return, and duration', () => {
    const start = { time: 1700000000, price: 100 };
    const end = { time: 1700172800, price: 110 }; // 2 days later

    const result = calculateMeasurement(start, end);

    expect(result.priceStart).toBe(100);
    expect(result.priceEnd).toBe(110);
    expect(result.priceChange).toBe(10);
    expect(result.returnPct).toBeCloseTo(0.1);
    expect(result.calendarDays).toBe(2);
    expect(result.tradingDays).toBe(1);
    expect(result.annualizedReturn).toBeGreaterThan(0);
  });

  it('handles zero or negative price start gracefully without NaN', () => {
    const start = { time: 1700000000, price: 0 };
    const end = { time: 1700172800, price: 10 };

    const result = calculateMeasurement(start, end);

    expect(result.returnPct).toBe(0);
    expect(result.annualizedReturn).toBeUndefined();
  });

  it('serializes and deserializes drawings properly', () => {
    const drawing = createDrawing('trendline', { time: 1000, price: 50 }, { time: 2000, price: 60 });
    const serialized = serializeDrawings([drawing]);
    const deserialized = deserializeDrawings(serialized);

    expect(deserialized).toHaveLength(1);
    expect(deserialized[0].id).toBe(drawing.id);
    expect(deserialized[0].type).toBe('trendline');
    expect(deserialized[0].points).toHaveLength(2);
  });

  it('handles invalid JSON gracefully when deserializing', () => {
    expect(deserializeDrawings('invalid json')).toEqual([]);
    expect(deserializeDrawings('{"not": "an array"}')).toEqual([]);
  });

  it('calculates pointToSegmentDistance accurately', () => {
    // Horizontal segment from (0, 10) to (100, 10)
    // Point at (50, 15) has distance 5
    expect(pointToSegmentDistance(50, 15, 0, 10, 100, 10)).toBe(5);
    // Point beyond right endpoint at (110, 10) has distance 10
    expect(pointToSegmentDistance(110, 10, 0, 10, 100, 10)).toBe(10);
  });

  it('detects hits on drawings and handles', () => {
    const timeToX = (t: number) => t;
    const priceToY = (p: number) => p;
    const drawing = createDrawing('trendline', { time: 100, price: 100 }, { time: 200, price: 200 });

    // Directly on line midpoint (150, 150)
    expect(isDrawingHit(drawing, 150, 150, timeToX, priceToY, 500, 8)).toBe(true);
    // Near line (150, 154) - within 8px
    expect(isDrawingHit(drawing, 150, 154, timeToX, priceToY, 500, 8)).toBe(true);
    // Far from line (150, 200)
    expect(isDrawingHit(drawing, 150, 200, timeToX, priceToY, 500, 8)).toBe(false);
    // Endpoint handle (100, 100)
    expect(isDrawingHit(drawing, 100, 100, timeToX, priceToY, 500, 8)).toBe(true);
  });

  it('detects hits on measurements', () => {
    const timeToX = (t: number) => t;
    const priceToY = (p: number) => p;
    const m = calculateMeasurement({ time: 50, price: 50 }, { time: 150, price: 150 });

    // Inside measurement bounding box
    expect(isMeasurementHit(m, 100, 100, timeToX, priceToY, 8)).toBe(true);
    // Far away
    expect(isMeasurementHit(m, 300, 300, timeToX, priceToY, 8)).toBe(false);
  });
});
