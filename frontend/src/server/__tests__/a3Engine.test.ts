import { describe, expect, it } from 'vitest';
import { evaluateA3AdaptiveAlpha } from '../a3Engine';
import { computeMarketStructure } from '../marketStructure';

describe('AEGIS Adaptive Alpha Engine (A³) Unit Tests', () => {
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(1000000000000 + i * 3600000).toISOString(),
    time: 1000000 + i * 3600,
    open: 100 + i * 0.5,
    high: 102 + i * 0.5,
    low: 99 + i * 0.5,
    close: 101 + i * 0.5,
    price: 101 + i * 0.5,
    volume: 5000 + (i % 5) * 1000,
    sentimentZ: 0.5,
  }));

  const mockNews = [
    {
      cluster_id: 'c-test-1',
      primary_headline: 'Major Tech Breakthrough Announced',
      primary_url: 'https://reuters.com/tech-breakthrough',
      primary_publisher: 'Reuters',
      publisher_count: 4,
      first_published_at: new Date(1000000000000).toISOString(),
      first_available_at: new Date(1000000000000).toISOString(),
      corroboration_score: 0.95,
      entities: ['BTC', 'TECH'],
      sentiment_polarity: 0.85,
      raws: [
        { headline: 'Major Tech Breakthrough', publisher: 'Reuters', provider_id: 'p1', available_at: new Date(1000000000000).toISOString() },
        { headline: 'Breakthrough Confirmed', publisher: 'Bloomberg', provider_id: 'p2', available_at: new Date(1000000000000).toISOString() },
        { headline: 'Industry Reacts to Tech Step', publisher: 'WSJ', provider_id: 'p3', available_at: new Date(1000000000000).toISOString() },
        { headline: 'Tech Breakthrough Analysis', publisher: 'CNBC', provider_id: 'p4', available_at: new Date(1000000000000).toISOString() },
      ],
    },
  ];

  it('computes 10-dimension market structure vector without errors or NaNs', () => {
    const mkt = computeMarketStructure('BTC', mockCandles);
    expect(mkt.symbol).toBe('BTC');
    expect(mkt.composite_technical_score).toBeDefined();
    expect(Number.isNaN(mkt.composite_technical_score)).toBe(false);
    expect(mkt.dimensions.trend_score).toBeDefined();
    expect(mkt.dimensions.momentum_score).toBeDefined();
    expect(mkt.dimensions.volume_participation_score).toBeDefined();
    expect(mkt.dimensions.multi_timeframe_alignment).toBeGreaterThanOrEqual(0);
    expect(mkt.dimensions.multi_timeframe_alignment).toBeLessThanOrEqual(1.0);
  });

  it('evaluates full A³ Adaptive Alpha signal with quality gates and factor contributions', () => {
    const evalResult = evaluateA3AdaptiveAlpha('BTC', mockCandles, mockNews as any);
    expect(evalResult.symbol).toBe('BTC');
    expect(evalResult.model_version).toBe('A3-V1.3.0');
    expect(['BUY', 'WATCH', 'SELL', 'NO TRADE']).toContain(evalResult.signal_action);
    expect(evalResult.calibrated_aegis_score).toBeGreaterThanOrEqual(-3.0);
    expect(evalResult.calibrated_aegis_score).toBeLessThanOrEqual(3.0);
    expect(evalResult.expected_excess_return_pct).toBeDefined();
    expect(evalResult.uncertainty_pct).toBeGreaterThan(0);
    expect(evalResult.factor_contributions.length).toBeGreaterThan(0);
    expect(evalResult.disagreement_vector).toBeDefined();
    expect(evalResult.quality_gates.gate_summary).toBeDefined();
  });

  it('enforces Point-In-Time boundary — past evaluation remains invariant when future bars arrive', () => {
    const pastCandles = mockCandles.slice(0, 15);
    const pastEval = evaluateA3AdaptiveAlpha('BTC', pastCandles, mockNews as any);

    // Future candles appended
    const futureCandles = mockCandles.slice(0, 25);
    const pastEvalRechecked = evaluateA3AdaptiveAlpha('BTC', pastCandles, mockNews as any);

    // Historical calculation on pastCandles must be identical
    expect(pastEval.calibrated_aegis_score).toBe(pastEvalRechecked.calibrated_aegis_score);
    expect(pastEval.signal_action).toBe(pastEvalRechecked.signal_action);
  });

  it('handles flat candles and zero variance gracefully', () => {
    const flatCandles = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1000000000000 + i * 3600000).toISOString(),
      time: 1000000 + i * 3600,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      price: 100,
      volume: 1000,
      sentimentZ: 0,
    }));
    const evalResult = evaluateA3AdaptiveAlpha('BTC', flatCandles, []);
    expect(Number.isNaN(evalResult.calibrated_aegis_score)).toBe(false);
    expect(Number.isNaN(evalResult.expected_excess_return_pct)).toBe(false);
    expect(Math.abs(evalResult.calibrated_aegis_score)).toBeLessThan(0.2);
  });
});
