import { CandleDatapoint } from './market';

export interface MarketStructureDimensions {
  trend_score: number;             // Multi-horizon trend persistence [-2.5, 2.5]
  momentum_score: number;          // Composite multi-horizon momentum (1D, 5D, 20D) [-2.5, 2.5]
  residual_momentum_score: number; // Idiosyncratic momentum relative to market benchmark [-2.5, 2.5]
  relative_strength_score: number; // Performance vs benchmark index [-2.5, 2.5]
  volume_participation_score: number; // Abnormal volume surge & turnover acceleration [-2.5, 2.5]
  price_structure_score: number;   // Breakout/breakdown & consolidation structure [-2.5, 2.5]
  volatility_score: number;        // Realized volatility regime & ATR ratio [-2.5, 2.5]
  mean_reversion_score: number;    // Deviation from equilibrium / overextension [-2.5, 2.5]
  gap_behaviour_score: number;     // Overnight/over-weekend gap direction & continuation [-2.5, 2.5]
  multi_timeframe_alignment: number; // Confirmation across short/medium/long timeframes [0.0, 1.0]
}

export interface MarketStructureSnapshot {
  symbol: string;
  timestamp: string;
  composite_technical_score: number;
  dimensions: MarketStructureDimensions;
  regime: 'STRONG_BULL' | 'BULL_CONSOLIDATION' | 'NEUTRAL_RANGE' | 'BEAR_CONSOLIDATION' | 'STRONG_BEAR' | 'HIGH_VOLATILITY_SHOCK';
  details: {
    sma20_dist_pct: number;
    sma50_dist_pct: number;
    mom5d_pct: number;
    vol_zscore: number;
    atr_pct: number;
    rsi14: number;
    overextended: boolean;
  };
}

/**
 * Computes a 10-dimension Market Structure Engine vector for a given set of candles strictly point-in-time.
 */
export function computeMarketStructure(
  symbol: string,
  candles: CandleDatapoint[],
  marketBenchmarkCandles?: CandleDatapoint[]
): MarketStructureSnapshot {
  const sym = symbol.toUpperCase().trim();
  const sorted = [...candles].sort((a, b) => a.time - b.time);

  if (sorted.length < 5) {
    return {
      symbol: sym,
      timestamp: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : new Date().toISOString(),
      composite_technical_score: 0.0,
      dimensions: {
        trend_score: 0,
        momentum_score: 0,
        residual_momentum_score: 0,
        relative_strength_score: 0,
        volume_participation_score: 0,
        price_structure_score: 0,
        volatility_score: 0,
        mean_reversion_score: 0,
        gap_behaviour_score: 0,
        multi_timeframe_alignment: 0.5,
      },
      regime: 'NEUTRAL_RANGE',
      details: {
        sma20_dist_pct: 0,
        sma50_dist_pct: 0,
        mom5d_pct: 0,
        vol_zscore: 0,
        atr_pct: 0,
        rsi14: 50,
        overextended: false,
      },
    };
  }

  const latest = sorted[sorted.length - 1];
  const closes = sorted.map((c) => c.close);
  const volumes = sorted.map((c) => c.volume ?? 1000);
  const n = sorted.length;

  // 1. Trend Score: Multi-horizon moving average alignment
  const sma20 = n >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : latest.close;
  const sma50 = n >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : sma20;
  const sma200 = n >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : sma50;

  const dist20 = (latest.close - sma20) / (sma20 || 1);
  const dist50 = (latest.close - sma50) / (sma50 || 1);
  const dist200 = (latest.close - sma200) / (sma200 || 1);

  const trendScore = Math.max(-2.5, Math.min(2.5, (dist20 * 8.0 + dist50 * 5.0 + dist200 * 3.0) / 3));

  // 2. Momentum Score (1D, 5D, 20D)
  const ret1D = n >= 2 ? (latest.close - closes[n - 2]) / (closes[n - 2] || 1) : 0;
  const ret5D = n >= 6 ? (latest.close - closes[n - 6]) / (closes[n - 6] || 1) : ret1D;
  const ret20D = n >= 21 ? (latest.close - closes[n - 21]) / (closes[n - 21] || 1) : ret5D;

  const momentumScore = Math.max(-2.5, Math.min(2.5, ret1D * 15.0 + ret5D * 6.0 + ret20D * 2.5));

  // 3. Residual Momentum (Relative to benchmark market return)
  let mktRet5D = 0;
  if (marketBenchmarkCandles && marketBenchmarkCandles.length >= 6) {
    const bSorted = [...marketBenchmarkCandles].sort((a, b) => a.time - b.time);
    const bLatest = bSorted[bSorted.length - 1];
    const bPrev = bSorted[Math.max(0, bSorted.length - 6)];
    if (bPrev.close > 0) {
      mktRet5D = (bLatest.close - bPrev.close) / bPrev.close;
    }
  } else {
    mktRet5D = 0.005; // Default mild market trend assumption
  }
  const residualMom = ret5D - mktRet5D;
  const residualMomentumScore = Math.max(-2.5, Math.min(2.5, residualMom * 10.0));

  // 4. Relative Strength Score
  const relativeStrengthScore = Math.max(-2.5, Math.min(2.5, (ret20D - mktRet5D * 2) * 6.0));

  // 5. Volume Participation Score (Abnormal volume surge)
  const windowVol = volumes.slice(-20);
  const meanVol = windowVol.reduce((a, b) => a + b, 0) / windowVol.length;
  const volVariance = windowVol.reduce((acc, v) => acc + Math.pow(v - meanVol, 2), 0) / (windowVol.length - 1 || 1);
  const volStd = Math.sqrt(volVariance) || 1.0;
  const volZscore = (latest.volume - meanVol) / volStd;
  const priceDirection = ret1D >= 0 ? 1 : -1;
  const volumeParticipationScore = Math.max(-2.5, Math.min(2.5, volZscore * priceDirection * 0.8));

  // 6. Price Structure Score (Breakout magnitude vs 20-bar High/Low)
  const high20 = Math.max(...sorted.slice(-20).map((c) => c.high || c.close));
  const low20 = Math.min(...sorted.slice(-20).map((c) => c.low || c.close));
  const range20 = high20 - low20 || 1.0;
  const posInRange = (latest.close - low20) / range20; // 0.0 to 1.0
  const priceStructureScore = Math.max(-2.5, Math.min(2.5, (posInRange - 0.5) * 4.5));

  // 7. Volatility Score (Realized volatility & ATR ratio)
  const returns: number[] = [];
  for (let i = Math.max(1, n - 20); i < n; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const meanRet = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const varRet = returns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / (returns.length - 1 || 1);
  const realizedVolAnn = Math.sqrt(varRet) * Math.sqrt(252);
  // High volatility penalizes structural score slightly
  const volatilityScore = Math.max(-2.5, Math.min(2.5, realizedVolAnn > 0.6 ? -1.5 : realizedVolAnn > 0.35 ? -0.5 : 0.5));

  // 8. Mean Reversion Score / Overextension
  const std20 = Math.sqrt(closes.slice(-20).reduce((acc, c) => acc + Math.pow(c - sma20, 2), 0) / 20) || 1.0;
  const zDev = (latest.close - sma20) / std20;
  // Extreme zDev (>2.0 or <-2.0) implies reversion pressure
  const overextended = Math.abs(zDev) > 2.0;
  const meanReversionScore = Math.max(-2.5, Math.min(2.5, overextended ? -zDev * 0.8 : zDev * 0.5));

  // 9. Gap Behaviour Score
  const prevClose = n >= 2 ? sorted[n - 2].close : latest.open;
  const gapPct = (latest.open - prevClose) / (prevClose || 1);
  const gapContinuation = gapPct * ret1D > 0 ? 1 : -0.5;
  const gapBehaviourScore = Math.max(-2.5, Math.min(2.5, gapPct * gapContinuation * 15.0));

  // 10. Multi-Timeframe Alignment
  const shortBull = ret1D > 0;
  const medBull = ret5D > 0;
  const longBull = ret20D > 0;
  const alignCount = (shortBull === medBull ? 1 : 0) + (medBull === longBull ? 1 : 0);
  const multiTimeframeAlignment = alignCount === 2 ? 1.0 : alignCount === 1 ? 0.65 : 0.3;

  // Composite technical score
  const compositeTechnical = Number(
    (
      (trendScore * 0.25 +
        momentumScore * 0.2 +
        residualMomentumScore * 0.15 +
        volumeParticipationScore * 0.15 +
        priceStructureScore * 0.15 +
        volatilityScore * 0.1) *
      multiTimeframeAlignment
    ).toFixed(4)
  );

  // Determine regime
  let regime: MarketStructureSnapshot['regime'] = 'NEUTRAL_RANGE';
  if (realizedVolAnn > 0.6) {
    regime = 'HIGH_VOLATILITY_SHOCK';
  } else if (compositeTechnical > 1.2) {
    regime = 'STRONG_BULL';
  } else if (compositeTechnical > 0.4) {
    regime = 'BULL_CONSOLIDATION';
  } else if (compositeTechnical < -1.2) {
    regime = 'STRONG_BEAR';
  } else if (compositeTechnical < -0.4) {
    regime = 'BEAR_CONSOLIDATION';
  }

  // RSI 14 calculation
  let rsi14 = 50;
  if (n >= 15) {
    let gains = 0;
    let losses = 0;
    for (let i = n - 14; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14 || 0.0001;
    const rs = avgGain / avgLoss;
    rsi14 = Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  return {
    symbol: sym,
    timestamp: latest.timestamp || new Date(latest.time * 1000).toISOString(),
    composite_technical_score: compositeTechnical,
    dimensions: {
      trend_score: Number(trendScore.toFixed(4)),
      momentum_score: Number(momentumScore.toFixed(4)),
      residual_momentum_score: Number(residualMomentumScore.toFixed(4)),
      relative_strength_score: Number(relativeStrengthScore.toFixed(4)),
      volume_participation_score: Number(volumeParticipationScore.toFixed(4)),
      price_structure_score: Number(priceStructureScore.toFixed(4)),
      volatility_score: Number(volatilityScore.toFixed(4)),
      mean_reversion_score: Number(meanReversionScore.toFixed(4)),
      gap_behaviour_score: Number(gapBehaviourScore.toFixed(4)),
      multi_timeframe_alignment: Number(multiTimeframeAlignment.toFixed(2)),
    },
    regime,
    details: {
      sma20_dist_pct: Number((dist20 * 100).toFixed(2)),
      sma50_dist_pct: Number((dist50 * 100).toFixed(2)),
      mom5d_pct: Number((ret5D * 100).toFixed(2)),
      vol_zscore: Number(volZscore.toFixed(2)),
      atr_pct: Number((realizedVolAnn * 100).toFixed(2)),
      rsi14,
      overextended,
    },
  };
}
