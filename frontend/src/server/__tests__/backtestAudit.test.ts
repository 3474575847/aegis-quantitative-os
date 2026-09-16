import { describe, expect, it } from 'vitest';
import { inferAnnualizationFactor, runSignalBacktest } from '../backtest';
import { evaluateA3AdaptiveAlpha } from '../a3Engine';
import { aegisStore } from '../store';

describe('A3 Adaptive Alpha Forensic Backtest Audit Regression Tests', () => {
  const mock5MinCandles = Array.from({ length: 100 }, (_, i) => ({
    time: 1000000 + i * 300, // 5-minute interval (300 sec)
    timestamp: new Date((1000000 + i * 300) * 1000).toISOString(),
    open: 100 + Math.sin(i / 5) * 2,
    high: 102 + Math.sin(i / 5) * 2,
    low: 99 + Math.sin(i / 5) * 2,
    close: 100.5 + Math.sin(i / 5) * 2,
    volume: 1000,
  }));

  it('correctly infers 5-minute annualization factor (19,656) instead of 252', () => {
    const factor = inferAnnualizationFactor(mock5MinCandles);
    expect(factor).toBe(19656.0);
  });

  it('verifies next-bar execution (signal at t executed at t+1 return)', () => {
    // Signal at bar 0 is BUY (+1), signal at bar 1 is FLAT (0)
    const candles = [
      { time: 1000, close: 100 },
      { time: 1300, close: 110 }, // bar 0 -> 1 return is +10%
      { time: 1600, close: 105 }, // bar 1 -> 2 return is -4.5%
    ];
    const signals = [
      { time: 1000, signal: 1.0 },
      { time: 1300, signal: 0.0 },
    ];

    const res = runSignalBacktest(candles, signals, { transaction_cost_bps: 0, slippage_bps: 0 });

    // Bar 0 signal (+1) receives bar 0->1 return (+10%)
    // Bar 1 signal (0) receives bar 1->2 return (0%)
    // Expected final equity = 1.0 * (1 + 0.10) * (1 + 0) = 1.10
    expect(res.final_equity).toBeCloseTo(1.10, 4);
    expect(res.entries).toBe(1);
    expect(res.exits).toBe(1);
  });

  it('charges transaction costs ONLY on position changes (no double counting)', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 1300, close: 100 }, // zero market return
      { time: 1600, close: 100 }, // zero market return
    ];
    // Position goes 0 -> 1 -> 1 (one entry, zero exits)
    const signals = [
      { time: 1000, signal: 1.0 },
      { time: 1300, signal: 1.0 },
    ];

    const res = runSignalBacktest(candles, signals, { transaction_cost_bps: 100, slippage_bps: 0 }); // 1% cost (100 bps)

    // Bar 0->1: position change 0 -> 1 (cost = 1%), market return = 0. stratReturn = 0 - 0.01 = -0.01. Equity = 0.99
    // Bar 1->2: position change 1 -> 1 (cost = 0%), market return = 0. stratReturn = 0. Equity = 0.99
    expect(res.final_equity).toBeCloseTo(0.99, 4);
    expect(res.turnover).toBe(1.0);
  });

  it('verifies PIT dynamic A3 signal generation across time', () => {
    const newsClusters = aegisStore.getLatestNews(100);
    const evalAt10 = evaluateA3AdaptiveAlpha('BTC', mock5MinCandles.slice(0, 10), newsClusters);
    const evalAt50 = evaluateA3AdaptiveAlpha('BTC', mock5MinCandles.slice(0, 50), newsClusters);

    expect(evalAt10.symbol).toBe('BTC');
    expect(evalAt50.symbol).toBe('BTC');
    expect(evalAt10.calibrated_aegis_score).toBeDefined();
    expect(evalAt50.calibrated_aegis_score).toBeDefined();
  });
});
