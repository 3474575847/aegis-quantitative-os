import { CandleDatapoint } from './market';
import { CanonicalArticleRecord } from './store';
import { computeCryptoFactors } from './cryptoFactors';
import { computeMarketStructure } from './marketStructure';

export interface ExpertHorizonMetrics {
  horizon_bars: number;
  horizon_name: string;
  pearson_ic: number;
  rank_ic: number;
  t_stat: number;
  p_value: number;
  avg_fwd_return: number;
  win_rate: number;
}

export interface ExpertRegimeIC {
  regime: string;
  ic: number;
  observations: number;
}

export interface ExpertEvaluation {
  expert_id: string;
  name: string;
  dimension: string;
  long_short_return_pct: number;
  cost_adjusted_return_pct: number;
  win_rate_pct: number;
  sharpe_ratio: number;
  pearson_ic: number;
  rank_ic: number;
  newey_west_tstat: number;
  p_value: number;
  ic_ci_95: [number, number];
  trade_count: number;
  turnover: number;
  horizons_matrix: ExpertHorizonMetrics[];
  regime_ic: ExpertRegimeIC[];
  has_statistical_edge: boolean;
}

export interface ExpertDecompositionResult {
  symbol: string;
  period_bars: number;
  experts: ExpertEvaluation[];
}

/**
 * Computes Newey-West adjusted t-statistic for a sequence of values to correct for autocorrelation.
 */
function computeNeweyWestTStat(series: number[], maxLag = 3): { tStat: number; pValue: number } {
  const n = series.length;
  if (n < 5) return { tStat: 0, pValue: 1.0 };

  const mean = series.reduce((a, b) => a + b, 0) / n;
  const dev = series.map((x) => x - mean);
  let gamma0 = dev.reduce((acc, d) => acc + d * d, 0) / n;

  let gammaSum = 0;
  for (let l = 1; l <= maxLag; l++) {
    let cov = 0;
    for (let t = l; t < n; t++) {
      cov += dev[t] * dev[t - l];
    }
    cov /= n;
    const w = 1 - l / (maxLag + 1);
    gammaSum += 2 * w * cov;
  }

  const varNW = (gamma0 + gammaSum) / n;
  if (varNW <= 1e-12) return { tStat: 0, pValue: 1.0 };

  const se = Math.sqrt(varNW);
  const tStat = mean / se;

  // Approximate two-tailed p-value
  const absT = Math.abs(tStat);
  let pValue = 1.0;
  if (absT > 3.29) pValue = 0.001;
  else if (absT > 2.58) pValue = 0.01;
  else if (absT > 1.96) pValue = 0.05;
  else if (absT > 1.645) pValue = 0.10;
  else pValue = Math.max(0.1, 1 - absT * 0.3);

  return { tStat: Number(tStat.toFixed(3)), pValue: Number(pValue.toFixed(4)) };
}

/**
 * Computes Pearson correlation coefficient
 */
function computePearsonIC(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 5) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = x[i] - mx;
    const vy = y[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 1e-12 ? Number((num / denom).toFixed(4)) : 0;
}

/**
 * Computes Spearman Rank IC
 */
function computeRankIC(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 5) return 0;

  const getRanks = (arr: number[]) => {
    const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = Array(n).fill(0);
    sorted.forEach((item, rank) => {
      ranks[item.idx] = rank + 1;
    });
    return ranks;
  };

  const rx = getRanks(x);
  const ry = getRanks(y);
  return computePearsonIC(rx, ry);
}

/**
 * Decomposes A³ into individual factor experts and tests performance across multiple prediction horizons.
 */
export function runExpertDecomposition(
  symbol: string,
  candles: CandleDatapoint[],
  newsClusters: CanonicalArticleRecord[] = []
): ExpertDecompositionResult {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;

  const horizons = [
    { bars: 1, name: '1B (5m)' },
    { bars: 3, name: '3B (15m)' },
    { bars: 6, name: '6B (30m)' },
    { bars: 12, name: '12B (1h)' },
    { bars: 24, name: '24B (2h)' },
    { bars: 48, name: '48B (4h)' },
  ];

  // Precompute factor snapshots and market structures for all bars
  const factorSnapshots = sorted.map((_, idx) =>
    computeCryptoFactors(symbol, sorted.slice(0, idx + 1), newsClusters)
  );
  const mktStructures = sorted.map((_, idx) => computeMarketStructure(symbol, sorted.slice(0, idx + 1)));

  const factorIds = [
    'crypto-ofi-v1',
    'crypto-funding-v1',
    'crypto-semivar-v1',
    'crypto-volsurprise-v1',
    'crypto-mom-v1',
    'crypto-crossasset-v1',
    'crypto-csvd-v1',
  ];

  const expertEvaluations: ExpertEvaluation[] = [];

  for (const fId of factorIds) {
    const fName = factorSnapshots[0]?.factors[fId]?.name || fId;
    const fDim = factorSnapshots[0]?.factors[fId]?.dimension || 'Alpha Factor';

    // Extract factor z-scores
    const zScores = factorSnapshots.map((snap) => snap.factors[fId]?.z_score ?? 0);

    // Compute Horizon Matrix
    const horizonMetrics: ExpertHorizonMetrics[] = [];

    for (const h of horizons) {
      const hBars = h.bars;
      const xVals: number[] = [];
      const yVals: number[] = [];

      for (let i = 0; i < n - hBars; i++) {
        const ret = (sorted[i + hBars].close - sorted[i].close) / (sorted[i].close || 1);
        xVals.push(zScores[i]);
        yVals.push(ret);
      }

      const pIC = computePearsonIC(xVals, yVals);
      const rIC = computeRankIC(xVals, yVals);

      // Element-wise products for t-stat
      const products = xVals.map((x, idx) => x * yVals[idx]);
      const nw = computeNeweyWestTStat(products, Math.min(3, hBars));

      const posRets = yVals.filter((_, idx) => xVals[idx] > 0.3);
      const winRate = posRets.length > 0 ? (posRets.filter((r) => r > 0).length / posRets.length) * 100 : 50;
      const avgFwdRet = posRets.length > 0 ? (posRets.reduce((a, b) => a + b, 0) / posRets.length) * 100 : 0;

      horizonMetrics.push({
        horizon_bars: hBars,
        horizon_name: h.name,
        pearson_ic: pIC,
        rank_ic: rIC,
        t_stat: nw.tStat,
        p_value: nw.pValue,
        avg_fwd_return: Number(avgFwdRet.toFixed(3)),
        win_rate: Number(winRate.toFixed(1)),
      });
    }

    // Baseline 1-bar horizon metrics for main expert card
    const x1 = zScores.slice(0, n - 1);
    const y1 = zScores.slice(0, n - 1).map((_, i) => (sorted[i + 1].close - sorted[i].close) / (sorted[i].close || 1));

    const pIC1 = computePearsonIC(x1, y1);
    const rIC1 = computeRankIC(x1, y1);
    const nw1 = computeNeweyWestTStat(
      x1.map((x, i) => x * y1[i]),
      2
    );

    // Single expert backtest simulation (5 bps cost per trade)
    let cumulativeReturn = 0;
    let netReturn = 0;
    let tradeCount = 0;
    let wins = 0;
    let pos = 0;
    const tradeReturns: number[] = [];

    for (let i = 0; i < n - 1; i++) {
      const signal = zScores[i] > 0.4 ? 1 : zScores[i] < -0.4 ? -1 : 0;
      const barRet = (sorted[i + 1].close - sorted[i].close) / (sorted[i].close || 1);

      if (signal !== pos) {
        if (signal !== 0) tradeCount++;
        pos = signal;
        // Cost: 5 bps taker fee
        netReturn -= 0.0005;
      }

      if (pos !== 0) {
        const ret = pos * barRet;
        cumulativeReturn += ret;
        netReturn += ret;
        tradeReturns.push(ret);
        if (ret > 0) wins++;
      }
    }

    const winRatePct = tradeReturns.length > 0 ? (wins / tradeReturns.length) * 100 : 50;
    const meanTradeRet = tradeReturns.length > 0 ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0;
    const stdTradeRet =
      tradeReturns.length > 1
        ? Math.sqrt(
            tradeReturns.reduce((acc, r) => acc + Math.pow(r - meanTradeRet, 2), 0) / (tradeReturns.length - 1)
          )
        : 1e-4;

    const annFactor = Math.sqrt(19656); // 5-min annualization
    const sharpe = stdTradeRet > 0 ? (meanTradeRet / stdTradeRet) * annFactor : 0;

    // IC by Regime
    const regimes = ['TRENDING_BULL', 'TRENDING_BEAR', 'MEAN_REVERTING', 'HIGH_VOLATILITY_SHOCK'];
    const regimeICs: ExpertRegimeIC[] = [];

    for (const reg of regimes) {
      const regX: number[] = [];
      const regY: number[] = [];

      for (let i = 0; i < n - 1; i++) {
        if (mktStructures[i]?.regime === reg) {
          regX.push(zScores[i]);
          regY.push(y1[i]);
        }
      }

      const ic = computePearsonIC(regX, regY);
      regimeICs.push({
        regime: reg,
        ic,
        observations: regX.length,
      });
    }

    // 95% Confidence Interval for IC
    const ciRadius = Number((1.96 / Math.sqrt(n || 1)).toFixed(4));
    const ciLower = Number((pIC1 - ciRadius).toFixed(4));
    const ciUpper = Number((pIC1 + ciRadius).toFixed(4));

    expertEvaluations.push({
      expert_id: fId,
      name: fName,
      dimension: fDim,
      long_short_return_pct: Number((cumulativeReturn * 100).toFixed(2)),
      cost_adjusted_return_pct: Number((netReturn * 100).toFixed(2)),
      win_rate_pct: Number(winRatePct.toFixed(1)),
      sharpe_ratio: Number(sharpe.toFixed(2)),
      pearson_ic: pIC1,
      rank_ic: rIC1,
      newey_west_tstat: nw1.tStat,
      p_value: nw1.pValue,
      ic_ci_95: [ciLower, ciUpper],
      trade_count: tradeCount,
      turnover: Number((tradeCount / (n || 1)).toFixed(2)),
      horizons_matrix: horizonMetrics,
      regime_ic: regimeICs,
      has_statistical_edge: Math.abs(nw1.tStat) >= 1.65,
    });
  }

  return {
    symbol,
    period_bars: n,
    experts: expertEvaluations,
  };
}
