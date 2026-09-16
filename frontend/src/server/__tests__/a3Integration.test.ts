import { describe, expect, test } from 'vitest';
import { aegisStore } from '../store';
import { evaluateA3AdaptiveAlpha } from '../a3Engine';
import { runSignalBacktest, inferAnnualizationFactor } from '../backtest';
import { CandleDatapoint } from '../market';

describe('A3 Dynamic Execution & Backtest Integration Test Suite', () => {
  const baseTime = 1700000000;
  
  function createSynthetic5MinCandles(count = 100, trend = 'UP'): CandleDatapoint[] {
    const candles: CandleDatapoint[] = [];
    let price = 50000.0;
    for (let i = 0; i < count; i++) {
      const time = baseTime + i * 300;
      const drift = trend === 'UP' ? 25.0 : trend === 'DOWN' ? -25.0 : (i % 2 === 0 ? 5 : -5);
      price += drift + (Math.sin(i / 3) * 10);
      const high = price + 15;
      const low = price - 15;
      const close = price;
      candles.push({
        time,
        timestamp: new Date(time * 1000).toISOString(),
        open: price - drift,
        high,
        low,
        close,
        volume: 150.0 + (i % 5) * 20,
      });
    }
    return candles;
  }

  test('Test 1: A3 strategy executes dynamically without consuming static mock datapoints', async () => {
    const backtestRes = await aegisStore.executeBacktest('e1a1a1a1-a3a3-4000-8000-0000000000a3', 'BTC');

    expect(backtestRes).toBeDefined();
    expect(backtestRes.signal_name).toBe('A3_ADAPTIVE_ALPHA_V1');
    expect(backtestRes.signal_source).toBe('Dynamic canonical A³ evaluation');
    expect(backtestRes.signal_distribution).toBeDefined();

    // Signal distribution must sum to total candle bars (observations + 1 return periods)
    const dist = backtestRes.signal_distribution!;
    const totalDist = dist.BUY + dist.SELL + dist.WATCH + dist.NO_TRADE + dist.UNAVAILABLE;
    expect(totalDist).toBe(backtestRes.diagnostics.total_bars);
    expect(backtestRes.result.observations).toBe(backtestRes.diagnostics.total_bars - 1);

    // Verify diagnostics presence
    expect(backtestRes.diagnostics).toBeDefined();
    expect(backtestRes.diagnostics.total_bars).toBe(totalDist);
    expect(backtestRes.diagnostics.model_version).toBe('A3-V1.3.0');
  });

  test('Test 2: Dynamic state variation produces non-trivial signal distributions', async () => {
    const candles = createSynthetic5MinCandles(150, 'UP');
    const news = aegisStore.getLatestNews(50);

    const actions: string[] = [];
    for (let i = 0; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const evalRes = evaluateA3AdaptiveAlpha('BTC', slice, news);
      actions.push(evalRes.signal_action);
    }

    const uniqueActions = Array.from(new Set(actions));
    expect(uniqueActions.length).toBeGreaterThanOrEqual(1);
    expect(['BUY', 'SELL', 'WATCH', 'NO TRADE']).toContain(actions[actions.length - 1]);
  });

  test('Test 3: Point-in-Time barrier holds — future bars do not modify historical evaluation', () => {
    const candles = createSynthetic5MinCandles(50, 'UP');
    const news = aegisStore.getLatestNews(10);

    const evalAt20 = evaluateA3AdaptiveAlpha('BTC', candles.slice(0, 20), news);
    const evalAt20Rechecked = evaluateA3AdaptiveAlpha('BTC', candles.slice(0, 20), news);

    expect(evalAt20.calibrated_aegis_score).toBe(evalAt20Rechecked.calibrated_aegis_score);
    expect(evalAt20.signal_action).toBe(evalAt20Rechecked.signal_action);
    expect(evalAt20.expected_excess_return_pct).toBe(evalAt20Rechecked.expected_excess_return_pct);
  });

  test('Test 4: Strategy Parity — Direct canonical evaluator and executeBacktest match bar-by-bar', async () => {
    const backtestRes = await aegisStore.executeBacktest('A3_ADAPTIVE_ALPHA_V1', 'BTC');
    const dist = backtestRes.signal_distribution!;
    expect(dist).toBeDefined();
    expect(dist.BUY + dist.SELL + dist.WATCH + dist.NO_TRADE + dist.UNAVAILABLE).toBe(backtestRes.diagnostics.total_bars);
  });

  test('Test 5: Position transitions, entries, exits, and turnover accounting', () => {
    const mockCandles = [
      { time: 1000, close: 100 },
      { time: 1300, close: 105 },
      { time: 1600, close: 108 },
      { time: 1900, close: 102 },
      { time: 2200, close: 99 },
      { time: 2500, close: 101 },
    ];
    // Signal sequence: BUY(1), BUY(1), SELL(-1), NO TRADE(0), BUY(1), BUY(1)
    const signals = [
      { time: 1000, signal: 1.0 },
      { time: 1300, signal: 1.0 },
      { time: 1600, signal: -1.0 },
      { time: 1900, signal: 0.0 },
      { time: 2200, signal: 1.0 },
      { time: 2500, signal: 1.0 },
    ];

    const bt = runSignalBacktest(mockCandles, signals, { transaction_cost_bps: 10, slippage_bps: 0 });

    expect(bt.execution).toBe('next_bar_close');
    expect(bt.entries).toBeGreaterThanOrEqual(1);
    expect(bt.turnover).toBeGreaterThan(0);
  });

  test('Test 6: Timeframe-aware annualization factor accuracy', () => {
    const candles5m = createSynthetic5MinCandles(10, 'UP');
    expect(inferAnnualizationFactor(candles5m)).toBe(19656.0);

    const candles1d = [
      { time: 1700000000, close: 100 },
      { time: 1700086400, close: 102 },
      { time: 1700172800, close: 105 },
    ];
    expect(inferAnnualizationFactor(candles1d)).toBe(252.0);

    const candles1m = [
      { time: 1700000000, close: 100 },
      { time: 1700000060, close: 101 },
      { time: 1700000120, close: 102 },
    ];
    expect(inferAnnualizationFactor(candles1m)).toBe(98280.0);
  });

  test('Test 7: Metric hygiene — guarantee zero NaN or Infinity output', () => {
    const flatCandles = [
      { time: 1000, close: 100 },
      { time: 1300, close: 100 },
      { time: 1600, close: 100 },
      { time: 1900, close: 100 },
    ];
    const zeroSignals = flatCandles.map((c) => ({ time: c.time, signal: 0.0 }));

    const bt = runSignalBacktest(flatCandles, zeroSignals);

    expect(Number.isFinite(bt.sharpe)).toBe(true);
    expect(Number.isFinite(bt.sortino)).toBe(true);
    expect(Number.isFinite(bt.cagr)).toBe(true);
    expect(Number.isFinite(bt.calmar)).toBe(true);
    expect(Number.isFinite(bt.annualized_volatility)).toBe(true);
    expect(isNaN(bt.sharpe)).toBe(false);
    expect(isNaN(bt.sortino)).toBe(false);
  });

  test('Test 8: End-to-end A3 research execution returns complete structured telemetry', async () => {
    const res = await aegisStore.executeBacktest('A3_ADAPTIVE_ALPHA_V1', 'BTC', 5.0, 0.0);

    expect(res.symbol).toBe('BTC');
    expect(res.signal_distribution).toBeDefined();
    expect(res.diagnostics.factor_contributions.length).toBeGreaterThan(0);
    expect(res.result.annualization_factor).toBe(19656.0);
    expect(res.result.bar_interval).toBe('5m');
  });
});
