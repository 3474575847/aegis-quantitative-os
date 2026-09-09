import {
  calculateMeasurement,
  createDrawing,
  deserializeDrawings,
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
});
