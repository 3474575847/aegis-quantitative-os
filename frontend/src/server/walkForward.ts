import { CandleDatapoint } from './market';
import { CanonicalArticleRecord } from './store';
import { computeCryptoFactors } from './cryptoFactors';
import { runSignalBacktest, BacktestResult } from './backtest';

export interface WalkForwardFoldResult {
  fold_index: number;
  train_window: { start_time: number; end_time: number; bars: number };
  purge_window: { start_time: number; end_time: number; bars: number };
  test_window: { start_time: number; end_time: number; bars: number };
  train_ic: number;
  test_ic: number;
  train_sharpe: number;
  test_sharpe: number;
  train_return_pct: number;
  test_return_pct: number;
  is_oos_stable: boolean;
}

export interface WalkForwardValidationResult {
  symbol: string;
  total_bars: number;
  num_folds: number;
  purge_gap_bars: number;
  overall_oos_return_pct: number;
  overall_oos_sharpe: number;
  overall_oos_win_rate_pct: number;
  is_walk_forward_verified: boolean;
  folds: WalkForwardFoldResult[];
}

/**
 * Runs 3-Fold Walk-Forward Out-Of-Sample Validation with Purge Gaps.
 * Enforces TRAIN -> PURGE -> TEST execution to prevent lookahead bias.
 */
export function runWalkForwardValidation(
  symbol: string,
  candles: CandleDatapoint[],
  newsClusters: CanonicalArticleRecord[] = []
): WalkForwardValidationResult {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;

  if (n < 60) {
    return {
      symbol,
      total_bars: n,
      num_folds: 1,
      purge_gap_bars: 5,
      overall_oos_return_pct: 0,
      overall_oos_sharpe: 0,
      overall_oos_win_rate_pct: 50,
      is_walk_forward_verified: false,
      folds: [],
    };
  }

  // 3 sequential folds over history
  const numFolds = 3;
  const purgeBars = 10; // Purge gap between Train and Test to eliminate overlap
  const foldSize = Math.floor((n - purgeBars) / numFolds);

  const folds: WalkForwardFoldResult[] = [];
  let combinedOosSignals: Array<{ time: number; signal: number }> = [];

  for (let f = 0; f < numFolds; f++) {
    const trainStartIdx = 0;
    const trainEndIdx = Math.floor(foldSize * (f + 1) * 0.6);

    const purgeStartIdx = trainEndIdx;
    const purgeEndIdx = Math.min(n, purgeStartIdx + purgeBars);

    const testStartIdx = purgeEndIdx;
    const testEndIdx = Math.min(n, testStartIdx + Math.floor(foldSize * 0.4));

    if (testEndIdx <= testStartIdx) continue;

    // Train Window evaluation
    const trainCandles = sorted.slice(trainStartIdx, trainEndIdx);
    const trainSnaps = trainCandles.map((_, i) =>
      computeCryptoFactors(symbol, trainCandles.slice(0, i + 1), newsClusters)
    );
    const trainScores = trainSnaps.map((s) => s.composite_score);
    const trainRets = trainCandles.map((c, i) =>
      i < trainCandles.length - 1 ? (trainCandles[i + 1].close - c.close) / (c.close || 1) : 0
    );

    // Compute Train IC
    let numTr = 0,
      dxTr = 0,
      dyTr = 0;
    const mTrS = trainScores.reduce((a, b) => a + b, 0) / (trainScores.length || 1);
    const mTrR = trainRets.reduce((a, b) => a + b, 0) / (trainRets.length || 1);
    for (let i = 0; i < trainScores.length; i++) {
      const vx = trainScores[i] - mTrS;
      const vy = trainRets[i] - mTrR;
      numTr += vx * vy;
      dxTr += vx * vx;
      dyTr += vy * vy;
    }
    const trainIC = dxTr * dyTr > 0 ? numTr / Math.sqrt(dxTr * dyTr) : 0.0;

    const trainSigs = trainCandles.map((c, i) => ({
      time: c.time,
      signal: trainScores[i] > 0.35 ? 1 : trainScores[i] < -0.35 ? -1 : 0,
    }));
    const trainBt = runSignalBacktest(trainCandles, trainSigs);

    // Test Window evaluation (Untouched Out-of-Sample)
    const testCandles = sorted.slice(testStartIdx, testEndIdx);
    const testSnaps = testCandles.map((_, i) =>
      computeCryptoFactors(symbol, testCandles.slice(0, i + 1), newsClusters)
    );
    const testScores = testSnaps.map((s) => s.composite_score);
    const testRets = testCandles.map((c, i) =>
      i < testCandles.length - 1 ? (testCandles[i + 1].close - c.close) / (c.close || 1) : 0
    );

    let numTe = 0,
      dxTe = 0,
      dyTe = 0;
    const mTeS = testScores.reduce((a, b) => a + b, 0) / (testScores.length || 1);
    const mTeR = testRets.reduce((a, b) => a + b, 0) / (testRets.length || 1);
    for (let i = 0; i < testScores.length; i++) {
      const vx = testScores[i] - mTeS;
      const vy = testRets[i] - mTeR;
      numTe += vx * vy;
      dxTe += vx * vx;
      dyTe += vy * vy;
    }
    const testIC = dxTe * dyTe > 0 ? numTe / Math.sqrt(dxTe * dyTe) : 0.0;

    const testSigs = testCandles.map((c, i) => ({
      time: c.time,
      signal: testScores[i] > 0.35 ? 1 : testScores[i] < -0.35 ? -1 : 0,
    }));
    const testBt = runSignalBacktest(testCandles, testSigs);

    combinedOosSignals = [...combinedOosSignals, ...testSigs];

    const isStable = testIC >= trainIC * 0.5 && testBt.sharpe > -1.0;

    folds.push({
      fold_index: f + 1,
      train_window: {
        start_time: trainCandles[0]?.time || 0,
        end_time: trainCandles[trainCandles.length - 1]?.time || 0,
        bars: trainCandles.length,
      },
      purge_window: {
        start_time: sorted[purgeStartIdx]?.time || 0,
        end_time: sorted[Math.min(n - 1, purgeEndIdx - 1)]?.time || 0,
        bars: purgeEndIdx - purgeStartIdx,
      },
      test_window: {
        start_time: testCandles[0]?.time || 0,
        end_time: testCandles[testCandles.length - 1]?.time || 0,
        bars: testCandles.length,
      },
      train_ic: Number(trainIC.toFixed(4)),
      test_ic: Number(testIC.toFixed(4)),
      train_sharpe: Number(trainBt.sharpe.toFixed(2)),
      test_sharpe: Number(testBt.sharpe.toFixed(2)),
      train_return_pct: Number((trainBt.total_return * 100).toFixed(2)),
      test_return_pct: Number((testBt.total_return * 100).toFixed(2)),
      is_oos_stable: isStable,
    });
  }

  // Combined OOS Backtest
  let overallOosReturn = 0;
  let overallOosSharpe = 0;
  let overallOosWinRate = 50;

  if (combinedOosSignals.length > 5) {
    const oosCandles = sorted.slice(-combinedOosSignals.length);
    const oosBt = runSignalBacktest(oosCandles, combinedOosSignals);
    overallOosReturn = Number((oosBt.total_return * 100).toFixed(2));
    overallOosSharpe = Number(oosBt.sharpe.toFixed(2));
    overallOosWinRate = Number(oosBt.win_rate.toFixed(1));
  }

  const isVerified = folds.filter((f) => f.is_oos_stable).length >= Math.ceil(folds.length * 0.5);

  return {
    symbol,
    total_bars: n,
    num_folds: folds.length,
    purge_gap_bars: purgeBars,
    overall_oos_return_pct: overallOosReturn,
    overall_oos_sharpe: overallOosSharpe,
    overall_oos_win_rate_pct: overallOosWinRate,
    is_walk_forward_verified: isVerified,
    folds,
  };
}
