import { describe, expect, it } from 'vitest';
import { inferAnnualizationFactor, runSignalBacktest } from '../backtest';

describe('Aegis Backtest Engine', () => {
  it('infers annualization factor from candle frequency', () => {
    // 5-minute candles (300 sec interval)
    const candles5m = [
      { time: 1000 },
      { time: 1300 },
      { time: 1600 },
      { time: 1900 },
    ];
    expect(inferAnnualizationFactor(candles5m)).toBe(19656.0);

    // 1-day candles (86400 sec interval)
    const candlesDaily = [
      { time: 1000 },
      { time: 87400 },
      { time: 173800 },
    ];
    expect(inferAnnualizationFactor(candlesDaily)).toBe(252.0);
  });

  it('runs backtest correctly with positive trend signal', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 2000, close: 105 },
      { time: 3000, close: 110 },
      { time: 4000, close: 115 },
    ];
    const signals = [
      { time: 1000, signal: 1.0 },
      { time: 2000, signal: 1.0 },
      { time: 3000, signal: 1.0 },
      { time: 4000, signal: 1.0 },
    ];

    const res = runSignalBacktest(candles, signals, {
      transaction_cost_bps: 0,
      slippage_bps: 0,
      annualization: 252,
    });

    expect(res.observations).toBe(3);
    expect(res.final_equity).toBeCloseTo(1.15, 2);
    expect(res.total_return).toBeCloseTo(0.15, 2);
    expect(res.max_drawdown).toBe(0.0);
    expect(res.win_rate).toBe(1.0);
    expect(res.entries).toBe(1);
    expect(res.trade_count).toBe(1);
    expect(Number.isFinite(res.sharpe)).toBe(true);
    expect(Number.isFinite(res.cagr)).toBe(true);
  });

  it('handles zero trades (neutral signal)', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 2000, close: 105 },
      { time: 3000, close: 102 },
    ];
    const signals = [
      { time: 1000, signal: 0.0 },
    ];

    const res = runSignalBacktest(candles, signals);
    expect(res.final_equity).toBe(1.0);
    expect(res.total_return).toBe(0.0);
    expect(res.entries).toBe(0);
    expect(res.win_rate).toBe(0.0);
    expect(res.turnover).toBe(0.0);
    expect(res.sharpe).toBe(0.0);
    expect(res.sortino).toBe(0.0);
    expect(res.calmar).toBe(0.0);
  });

  it('handles transaction cost deduction on position change', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 2000, close: 100 }, // flat
    ];
    // Position flips from 0 to 1 -> 50 bps cost
    const signals = [
      { time: 1000, signal: 1.0 },
    ];

    const res = runSignalBacktest(candles, signals, {
      transaction_cost_bps: 50.0,
      slippage_bps: 0.0,
    });

    // Cost: 50 bps = 0.005
    expect(res.final_equity).toBeCloseTo(0.995, 3);
    expect(res.total_return).toBeCloseTo(-0.005, 3);
  });

  it('strictly respects point-in-time signal availability', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 2000, close: 110 },
      { time: 3000, close: 120 },
    ];
    // Signal only appears at time 2000, so candle at 1000 gets signal 0
    const signals = [
      { time: 2000, signal: 1.0 },
    ];

    const res = runSignalBacktest(candles, signals, {
      transaction_cost_bps: 0,
      slippage_bps: 0,
    });

    // First period (1000->2000) position was 0, so 0 return
    // Second period (2000->3000) position was 1, so (120-110)/110 return
    expect(res.equity_curve[0].equity).toBe(1.0);
    expect(res.final_equity).toBeCloseTo(120 / 110, 3);
  });

  it('sanitizes ruin/negative equity without NaN or infinite metrics', () => {
    const candles = [
      { time: 1000, close: 100 },
      { time: 2000, close: 1 }, // massive drop
      { time: 3000, close: 1 },
    ];
    const signals = [
      { time: 1000, signal: 1.0 },
      { time: 2000, signal: 1.0 },
    ];

    const res = runSignalBacktest(candles, signals, {
      transaction_cost_bps: 200,
    });

    expect(Number.isFinite(res.final_equity)).toBe(true);
    expect(Number.isFinite(res.cagr)).toBe(true);
    expect(Number.isFinite(res.sharpe)).toBe(true);
    expect(Number.isFinite(res.sortino)).toBe(true);
    expect(Number.isFinite(res.calmar)).toBe(true);
  });
});
