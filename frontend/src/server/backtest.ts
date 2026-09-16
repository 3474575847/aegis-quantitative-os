export interface BacktestResult {
  observations: number;
  initial_capital: number;
  final_equity: number;
  total_return: number;
  annualized_volatility: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  calmar: number;
  win_rate: number;
  turnover: number;
  position_size: number;
  holding_period: number;
  entries: number;
  exits: number;
  trade_count: number;
  benchmark_final_equity: number | null;
  benchmark_return: number | null;
  transaction_cost_bps: number;
  slippage_bps: number;
  execution: string;
  annualization_factor: number;
  bar_interval: string;
  periods_per_year: number;
  annualization_basis: string;
  equity_curve: Array<{
    timestamp: string;
    equity: number;
    drawdown: number;
  }>;
}

function sanitizeMetric(val: number, fallback = 0.0): number {
  return Number.isFinite(val) && !isNaN(val) ? val : fallback;
}

export function inferAnnualizationFactor(candles: Array<{ time: number }>): number {
  if (candles.length < 2) return 252.0;

  // Calculate median interval between consecutive candles
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].time - candles[i - 1].time;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 252.0;

  diffs.sort((a, b) => a - b);
  const medianSec = diffs[Math.floor(diffs.length / 2)];

  // Classify frequency
  if (medianSec <= 120) {
    // 1-minute: ~252 trading days * 390 min = 98,280
    return 98280.0;
  } else if (medianSec <= 400) {
    // 5-minute: ~252 * 78 = 19,656
    return 19656.0;
  } else if (medianSec <= 1000) {
    // 15-minute: ~252 * 26 = 6,552
    return 6552.0;
  } else if (medianSec <= 4000) {
    // 1-hour: ~252 * 6.5 = 1,638
    return 1638.0;
  } else if (medianSec <= 15000) {
    // 4-hour: ~252 * 1.625 = 410
    return 410.0;
  } else {
    // Daily / weekly: standard 252 trading days
    return 252.0;
  }
}

export function runSignalBacktest(
  candles: Array<{ time: number; close: number; timestamp?: string }>,
  signalValues: Array<{ time: number; signal: number }>,
  options: {
    transaction_cost_bps?: number;
    slippage_bps?: number;
    position_size?: number;
    holding_period?: number;
    annualization?: number;
  } = {}
): BacktestResult {
  const transaction_cost_bps = options.transaction_cost_bps ?? 5.0;
  const slippage_bps = options.slippage_bps ?? 0.0;
  const position_size = Math.min(1.0, Math.max(0.0, options.position_size ?? 1.0));
  const holding_period = Math.max(1, options.holding_period ?? 1);

  if (!candles || candles.length < 2) {
    throw new Error('At least two market candles are required for backtest');
  }

  // Sort candles ascending by time
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);

  // Determine annualization factor dynamically if not explicitly specified
  const annualization = options.annualization ?? inferAnnualizationFactor(sortedCandles);

  // Map candles and align signals strictly point-in-time
  // Signals published at or before candle.time are known; subsequent signals are NOT accessible
  const sortedSignals = [...signalValues].sort((a, b) => a.time - b.time);

  const aligned: Array<{
    time: number;
    timestamp: string;
    price: number;
    signal: number;
  }> = [];

  let sigIdx = 0;
  let lastSignal = 0.0;

  for (const candle of sortedCandles) {
    while (sigIdx < sortedSignals.length && sortedSignals[sigIdx].time <= candle.time) {
      lastSignal = sortedSignals[sigIdx].signal;
      sigIdx++;
    }
    aligned.push({
      time: candle.time,
      timestamp: candle.timestamp || new Date(candle.time * 1000).toISOString(),
      price: candle.close,
      signal: lastSignal,
    });
  }

  if (aligned.length < 2) {
    throw new Error('Insufficient aligned periods for backtest');
  }

  // Calculate positions: signal at t establishes target position executed at next bar
  const rawPositions = aligned.map((item) =>
    item.signal > 0 ? 1.0 : item.signal < 0 ? -1.0 : 0.0
  );

  const positions: number[] = [];
  let remaining = 0;
  let heldPosition = 0.0;

  for (const rawPos of rawPositions) {
    if (remaining <= 0) {
      heldPosition = rawPos * position_size;
      remaining = holding_period;
    }
    positions.push(heldPosition);
    remaining--;
  }

  // Returns calculation
  const totalCost = (transaction_cost_bps + slippage_bps) / 10000;
  const strategyReturns: number[] = [];
  const validIndices: number[] = [];

  for (let i = 0; i < aligned.length - 1; i++) {
    const pCurrent = aligned[i].price;
    const pNext = aligned[i + 1].price;
    if (pCurrent <= 0) continue;
    const marketReturn = (pNext - pCurrent) / pCurrent;
    const posCurrent = positions[i];
    const posPrev = i > 0 ? positions[i - 1] : 0.0;
    const posChange = Math.abs(posCurrent - posPrev);

    const stratReturn = posCurrent * marketReturn - posChange * totalCost;
    strategyReturns.push(stratReturn);
    validIndices.push(i);
  }

  if (strategyReturns.length === 0) {
    throw new Error('Backtest produced no executable periods');
  }

  // Cumulative equity & drawdown
  let cumEquity = 1.0;
  let peakEquity = 1.0;
  const equityCurve: Array<{ timestamp: string; equity: number; drawdown: number }> = [];
  const drawdowns: number[] = [];

  for (let i = 0; i < strategyReturns.length; i++) {
    const r = strategyReturns[i];
    cumEquity = Math.max(0.0, cumEquity * (1.0 + r));
    if (cumEquity > peakEquity) {
      peakEquity = cumEquity;
    }
    const dd = peakEquity > 0 ? cumEquity / peakEquity - 1.0 : 0.0;
    drawdowns.push(dd);

    const candleIdx = validIndices[i];
    equityCurve.push({
      timestamp: aligned[candleIdx].timestamp,
      equity: Number(cumEquity.toFixed(6)),
      drawdown: Number(dd.toFixed(6)),
    });
  }

  const periods = strategyReturns.length;
  const meanReturn = strategyReturns.reduce((acc, v) => acc + v, 0) / periods;
  const variance =
    periods > 1
      ? strategyReturns.reduce((acc, v) => acc + Math.pow(v - meanReturn, 2), 0) / (periods - 1)
      : 0.0;
  const stdReturn = Math.sqrt(Math.max(0, variance));

  const annualizedVol = periods > 1 ? stdReturn * Math.sqrt(annualization) : 0.0;
  const sharpe =
    periods > 1 && stdReturn > 1e-9 ? (meanReturn / stdReturn) * Math.sqrt(annualization) : 0.0;

  // Downside deviation for Sortino (returns below 0 or target return)
  const negativeReturns = strategyReturns.map((r) => (r < 0 ? r : 0));
  const downsideSqSum = negativeReturns.reduce((acc, v) => acc + v * v, 0);
  const downsideDev = periods > 1 ? Math.sqrt(downsideSqSum / (periods - 1)) : 0.0;
  const sortino =
    downsideDev > 1e-9 ? (meanReturn / downsideDev) * Math.sqrt(annualization) : 0.0;

  // Max drawdown (non-positive number)
  const maxDrawdown = Math.min(...drawdowns, 0.0);

  // Total return & CAGR
  const totalReturn = cumEquity - 1.0;
  let cagr = 0.0;
  if (cumEquity <= 0.0) {
    cagr = -1.0;
  } else if (periods > 0) {
    const exponent = annualization / periods;
    // Cap CAGR calculation if exponent is exceedingly large for very short runs to avoid Math.pow overflow
    if (exponent > 50) {
      cagr = totalReturn;
    } else {
      cagr = Math.pow(cumEquity, exponent) - 1.0;
    }
  }

  // Calmar ratio (CAGR / |Max Drawdown|)
  const calmar = Math.abs(maxDrawdown) > 1e-5 ? cagr / Math.abs(maxDrawdown) : 0.0;

  // Win rate (among active trade periods where position !== 0)
  const activeReturns = strategyReturns.filter((_, idx) => positions[validIndices[idx]] !== 0);
  const winCount = activeReturns.filter((r) => r > 0).length;
  const winRate = activeReturns.length > 0 ? winCount / activeReturns.length : 0.0;

  // Trades count & entries/exits
  let entries = 0;
  let exits = 0;
  let turnover = 0;
  for (let i = 0; i < positions.length; i++) {
    const curr = positions[i];
    const prev = i > 0 ? positions[i - 1] : 0.0;
    if (curr !== 0 && prev === 0) entries++;
    if (curr === 0 && prev !== 0) exits++;
    turnover += Math.abs(curr - prev);
  }

  // Benchmark return (buy & hold)
  const initialPrice = aligned[0].price;
  const finalPrice = aligned[aligned.length - 1].price;
  const benchmarkReturn = initialPrice > 0 ? (finalPrice - initialPrice) / initialPrice : 0.0;
  const benchmarkFinal = 1.0 + benchmarkReturn;

  let barInterval = '1d';
  if (annualization >= 90000) barInterval = '1m';
  else if (annualization >= 15000) barInterval = '5m';
  else if (annualization >= 5000) barInterval = '15m';
  else if (annualization >= 1000) barInterval = '1h';
  else if (annualization >= 300) barInterval = '4h';

  const annualizationBasis = `${annualization} periods/year (${barInterval} interval)`;

  return {
    observations: periods,
    initial_capital: 1.0,
    final_equity: Number(sanitizeMetric(cumEquity, 1.0).toFixed(6)),
    total_return: Number(sanitizeMetric(totalReturn, 0.0).toFixed(6)),
    annualized_volatility: Number(sanitizeMetric(annualizedVol, 0.0).toFixed(6)),
    cagr: Number(sanitizeMetric(cagr, 0.0).toFixed(6)),
    sharpe: Number(sanitizeMetric(sharpe, 0.0).toFixed(6)),
    sortino: Number(sanitizeMetric(sortino, 0.0).toFixed(6)),
    max_drawdown: Number(sanitizeMetric(maxDrawdown, 0.0).toFixed(6)),
    calmar: Number(sanitizeMetric(calmar, 0.0).toFixed(6)),
    win_rate: Number(sanitizeMetric(winRate, 0.0).toFixed(6)),
    turnover: Number(sanitizeMetric(turnover, 0.0).toFixed(6)),
    position_size,
    holding_period,
    entries,
    exits,
    trade_count: entries + exits,
    benchmark_final_equity: Number(sanitizeMetric(benchmarkFinal, 1.0).toFixed(6)),
    benchmark_return: Number(sanitizeMetric(benchmarkReturn, 0.0).toFixed(6)),
    transaction_cost_bps,
    slippage_bps,
    execution: 'next_bar_close',
    annualization_factor: annualization,
    bar_interval: barInterval,
    periods_per_year: annualization,
    annualization_basis: annualizationBasis,
    equity_curve: equityCurve,
  };
}
