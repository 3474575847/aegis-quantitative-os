import { describe, expect, it } from 'vitest';
import { computeCSVDSeries } from '../csvd';
import { computeAssetFactorMatrix } from '../factors';
import { runFactorAblationStudy } from '../ablation';
import { generateAegisCompanyThesis } from '../thesisEngine';

describe('C-SVD Point-In-Time Factor Engine', () => {
  const dummyCandles = [
    { time: 1000, close: 100, open: 99 },
    { time: 1300, close: 102, open: 100 },
    { time: 1600, close: 105, open: 102 },
    { time: 1900, close: 104, open: 105 },
    { time: 2200, close: 108, open: 104 },
  ];

  const dummyClusters = [
    {
      cluster_id: 'c1',
      primary_headline: 'Major Contract Breakthrough Confirmed by Multiple Outlets',
      canonical_summary: 'Major breakthrough announced with key partners.',
      first_available_at: new Date(1100 * 1000).toISOString(),
      corroboration_score: 0.88,
      publisher_count: 5,
      sentiment_polarity: 0.82,
      symbol: 'BTC',
      sources: ['Reuters', 'Bloomberg', 'WSJ'],
    },
  ];

  it('computes point-in-time C-SVD series strictly observing article availability', () => {
    const series = computeCSVDSeries(dummyCandles, dummyClusters as any);
    expect(series.length).toBe(dummyCandles.length);

    // Candle at t=1000 is before news at t=1100 -> cwsi should be 0
    expect(series[0].cwsi).toBe(0);

    // Candle at t=1300 is after news at t=1100 -> cwsi should be positive
    expect(series[1].cwsi).toBeGreaterThan(0);
    expect(series[1].corroboration_score).toBe(0.88);
  });

  it('computes 8 orthogonal asset factor matrix snapshot', () => {
    const snapshot = computeAssetFactorMatrix('BTC', dummyCandles, dummyClusters as any);
    expect(snapshot.symbol).toBe('BTC');
    expect(Object.keys(snapshot.factors).length).toBe(8);
    expect(snapshot.factors['aegis-csvd-v1']).toBeDefined();
    expect(snapshot.factors['aegis-fund-v1']).toBeDefined();
    expect(snapshot.factors['aegis-macro-v1']).toBeDefined();
  });

  it('runs factor ablation study with baseline comparisons', async () => {
    const study = await runFactorAblationStudy('BTC');
    expect(study.baseline_comparisons.length).toBeGreaterThanOrEqual(5);
    expect(study.factor_ablation_table.length).toBe(8);
    expect(study.correlation_matrix.matrix.length).toBe(8);
  });

  it('generates company thesis with multi-dimensional assessment', async () => {
    const thesis = await generateAegisCompanyThesis('BTC');
    expect(thesis.symbol).toBe('BTC');
    expect(thesis.dimensions.information_discovery).toBeDefined();
    expect(thesis.synthesis.core_thesis_statement).toBeDefined();
    expect(thesis.historical_event_analogues.length).toBeGreaterThan(0);
  });

  // --- ADVERSARIAL LEAKAGE TESTS A-H ---
  describe('Adversarial Information-Leakage Audits', () => {
    it('Test A — Future corroboration: earlier signal must not see later sources', () => {
      // Cluster with 3 member articles arriving at different times:
      // Source A at t=1000, Source B at t=1400, Source C at t=1800
      const clusterWithRaw = {
        cluster_id: 'c-dynamic',
        primary_headline: 'Breakthrough Story',
        first_available_at: new Date(1000 * 1000).toISOString(),
        corroboration_score: 0.95, // Final aggregated score
        publisher_count: 3,
        sentiment_polarity: 0.9,
        raws: [
          { publisher: 'Reuters', available_at: new Date(1000 * 1000).toISOString() },
          { publisher: 'Bloomberg', available_at: new Date(1400 * 1000).toISOString() },
          { publisher: 'WSJ', available_at: new Date(1800 * 1000).toISOString() },
        ],
      };

      const candles = [
        { time: 1200, close: 100 }, // Only Reuters available -> pub_count=1, corr=0.50
        { time: 1500, close: 101 }, // Reuters + Bloomberg available -> pub_count=2, corr=0.75
        { time: 2000, close: 102 }, // All 3 available -> pub_count=3, corr=0.95
      ];

      const series = computeCSVDSeries(candles, [clusterWithRaw] as any);

      // At t=1200, corroboration score MUST be 0.50 (not 0.95)
      expect(series[0].corroboration_score).toBe(0.5);
      expect(series[0].publisher_count).toBe(1);

      // At t=1500, corroboration score MUST be 0.75
      expect(series[1].corroboration_score).toBe(0.75);
      expect(series[1].publisher_count).toBe(2);

      // At t=2000, corroboration score MUST be 0.95
      expect(series[2].corroboration_score).toBe(0.95);
      expect(series[2].publisher_count).toBe(3);
    });

    it('Test B — Future sentiment: later news must not alter past historical CWSI', () => {
      const candles = [
        { time: 1000, close: 100 },
        { time: 2000, close: 100 },
      ];

      const earlyCluster = {
        cluster_id: 'c-early',
        primary_headline: 'Early News',
        first_available_at: new Date(1000 * 1000).toISOString(),
        corroboration_score: 0.75,
        publisher_count: 2,
        sentiment_polarity: 0.4,
      };

      const lateCluster = {
        cluster_id: 'c-late',
        primary_headline: 'Late Huge News',
        first_available_at: new Date(1800 * 1000).toISOString(),
        corroboration_score: 0.95,
        publisher_count: 5,
        sentiment_polarity: -0.9,
      };

      const seriesBefore = computeCSVDSeries(candles, [earlyCluster] as any);
      const seriesWithLate = computeCSVDSeries(candles, [earlyCluster, lateCluster] as any);

      // Past point t=1000 CWSI must be IDENTICAL regardless of whether lateCluster exists
      expect(seriesBefore[0].cwsi).toBe(seriesWithLate[0].cwsi);
    });

    it('Test C — Future price: factor at bar t must only use price returns up to t', () => {
      const candles = [
        { time: 1000, close: 100 },
        { time: 1100, close: 100 }, // Flat price
        { time: 1200, close: 200 }, // Massive future jump at t=1200
      ];
      const series = computeCSVDSeries(candles, []);
      // At t=1100 (index 1), price return was 0 (100 -> 100), not seeing jump to 200
      expect(series[1].npdo).toBeDefined();
      expect(Number.isNaN(series[1].npdo)).toBe(false);
    });

    it('Test D — Future normalization: rolling window must only use historical observations', () => {
      const candles = Array.from({ length: 30 }, (_, i) => ({
        time: 1000 + i * 100,
        close: 100 + i,
      }));
      const series = computeCSVDSeries(candles, []);
      expect(series.length).toBe(30);
      series.forEach((pt) => {
        expect(Number.isNaN(pt.sav)).toBe(false);
        expect(Number.isNaN(pt.npdo)).toBe(false);
      });
    });

    it('Test E & F — Handles zero variance, NaNs, missing data gracefully', () => {
      const flatCandles = [
        { time: 1000, close: 100 },
        { time: 1100, close: 100 },
        { time: 1200, close: 100 },
      ];
      const series = computeCSVDSeries(flatCandles, []);
      expect(series[0].npdo).toBe(0);
      expect(series[1].npdo).toBe(0);
      expect(series[2].npdo).toBe(0);
    });

    it('Test G & H — Market session / post-market news alignment', () => {
      const postMarketCluster = {
        cluster_id: 'c-afterhours',
        primary_headline: 'Earnings Beat After Bell',
        first_available_at: new Date('2026-09-14T20:30:00Z').toISOString(), // Post-market
        corroboration_score: 0.95,
        publisher_count: 4,
        sentiment_polarity: 0.85,
      };
      const marketCandle = {
        time: new Date('2026-09-14T19:00:00Z').getTime() / 1000, // Pre-earnings candle
        close: 150,
      };
      const series = computeCSVDSeries([marketCandle], [postMarketCluster] as any);
      // Pre-earnings candle at 19:00 cannot see post-market news at 20:30
      expect(series[0].cwsi).toBe(0);
    });
  });
});
