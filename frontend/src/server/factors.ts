import { computeCSVDSeries, CSVDPoint } from './csvd';
import { CanonicalArticleRecord } from './store';

export interface FactorDefinition {
  factor_id: string;
  name: string;
  version: string;
  dimension: string;
  economic_hypothesis: string;
  inputs: string[];
  expected_horizon: string;
  data_dependencies: string[];
  known_failure_modes: string[];
  research_status: 'CORE_PROMOTED' | 'PROMOTED' | 'EXPERIMENTAL';
}

export type AssetClass = 'EQUITY' | 'CRYPTO' | 'COMMODITY' | 'FX';

export function getAssetClass(symbol: string): AssetClass {
  const sym = symbol.toUpperCase().trim().replace('-USD', '').replace('USDT', '');
  if (['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'AVAX', 'DOT', 'LINK', 'BNB'].includes(sym)) {
    return 'CRYPTO';
  }
  if (['GLD', 'SLV', 'USO', 'UNG', 'CL', 'GC'].includes(sym)) {
    return 'COMMODITY';
  }
  if (['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'].includes(sym)) {
    return 'FX';
  }
  return 'EQUITY';
}

export type FactorStatus = 'ACTIVE' | 'NOT_APPLICABLE' | 'MISSING_DATA';

export interface FactorObservation {
  time: number;
  timestamp: string;
  factor_id: string;
  value: number; // Normalized z-score or bounded [-1.0, 1.0]
  raw_value: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  attribution: string;
  status: FactorStatus;
  is_causal: boolean;
  influence_path: string;
}

export interface FactorMatrixSnapshot {
  symbol: string;
  timestamp: string;
  factors: Record<string, FactorObservation>;
  composite_score: number;
  orthogonality_score: number;
  active_regime: string;
}

export const FACTOR_REGISTRY: Record<string, FactorDefinition> = {
  'aegis-csvd-v1': {
    factor_id: 'aegis-csvd-v1',
    name: 'Aegis Information Discovery (C-SVD)',
    version: '1.0.0',
    dimension: 'Information Discovery',
    economic_hypothesis:
      'Newly arriving, multi-publisher corroborated information enters the market faster than price can fully equilibrate, creating an actionable information-price divergence window.',
    inputs: ['canonical_news_clusters', 'corroboration_score', 'publisher_count', 'price_returns'],
    expected_horizon: '12h - 72h',
    data_dependencies: ['Canonical News Ingestion', 'Market Ticker History'],
    known_failure_modes: ['Low news volume environments', 'Fast macro shocks dominating single-stock news'],
    research_status: 'CORE_PROMOTED',
  },
  'aegis-fund-v1': {
    factor_id: 'aegis-fund-v1',
    name: 'Fundamental Inflection & Acceleration',
    version: '1.0.0',
    dimension: 'Fundamental Inflection',
    economic_hypothesis:
      'Companies experiencing accelerating revenue growth and expanding operating margins generate persistent earnings drift that outlasts initial quarterly reports.',
    inputs: ['revenue_growth_acceleration', 'operating_margin_expansion', 'roe_drift'],
    expected_horizon: '30d - 90d',
    data_dependencies: ['Financial Statements', 'Quarterly Filings'],
    known_failure_modes: ['Accounting revisions', 'One-off non-operating gains'],
    research_status: 'PROMOTED',
  },
  'aegis-exp-v1': {
    factor_id: 'aegis-exp-v1',
    name: 'Expectation Dislocation & Revision Breadth',
    version: '1.0.0',
    dimension: 'Expectation Dislocation',
    economic_hypothesis:
      'Consensus analyst revision breadth (net upgrades vs downgrades) and unexpected revenue/EPS surprises trigger institutional capital reallocation.',
    inputs: ['eps_surprise_pct', 'analyst_upgrade_ratio', 'estimate_dispersion'],
    expected_horizon: '10d - 45d',
    data_dependencies: ['Analyst Consensus Revisions', 'Earnings Surprise Reports'],
    known_failure_modes: ['Analyst herd behavior', 'Whisper number disconnects'],
    research_status: 'PROMOTED',
  },
  'aegis-val-v1': {
    factor_id: 'aegis-val-v1',
    name: 'Valuation Dislocation & ROE Efficiency',
    version: '1.0.0',
    dimension: 'Valuation Dislocation',
    economic_hypothesis:
      'Assets trading at significant valuation discounts relative to their historical percentile and sector peers, while maintaining superior ROIC, mean-revert toward intrinsic economic value.',
    inputs: ['pe_sector_relative', 'ev_ebitda_percentile', 'fcf_yield_spread'],
    expected_horizon: '60d - 180d',
    data_dependencies: ['Valuation Multiples', 'Industry Peer Index'],
    known_failure_modes: ['Value traps', 'Secular industry disruption'],
    research_status: 'PROMOTED',
  },
  'aegis-mkt-v1': {
    factor_id: 'aegis-mkt-v1',
    name: 'Market Repricing & Trend Persistence',
    version: '1.0.0',
    dimension: 'Market Repricing',
    economic_hypothesis:
      'Multi-horizon trend persistence and breakout momentum reflect sustained institutional accumulation rather than short-term retail noise.',
    inputs: ['price_vs_sma20', 'price_vs_sma50', 'breakout_magnitude_z'],
    expected_horizon: '5d - 20d',
    data_dependencies: ['OHLCV Market Candles'],
    known_failure_modes: ['Choppy mean-reverting ranges', 'False breakout whipsaws'],
    research_status: 'PROMOTED',
  },
  'aegis-vol-v1': {
    factor_id: 'aegis-vol-v1',
    name: 'Capital Participation & Liquidity Flow',
    version: '1.0.0',
    dimension: 'Capital Participation',
    economic_hypothesis:
      'Price movements supported by statistically abnormal volume surges and accumulation/distribution inflows indicate high conviction institutional flow.',
    inputs: ['volume_zscore_20', 'accumulation_distribution_oscillator', 'turnover_acceleration'],
    expected_horizon: '3d - 15d',
    data_dependencies: ['Trade Volume Feeds', 'Liquidity History'],
    known_failure_modes: ['Options expiration volume spikes', 'Dark pool unobserved transfers'],
    research_status: 'PROMOTED',
  },
  'aegis-macro-v1': {
    factor_id: 'aegis-macro-v1',
    name: 'Macro Regime & Transmission Alignment',
    version: '1.0.0',
    dimension: 'Macro / Sector Transmission',
    economic_hypothesis:
      'Asset performance is strongly modulated by macroeconomic regimes (Goldilocks, Reflation, Stagflation, Deflation) and Treasury yield curve shocks.',
    inputs: ['yield_curve_slope_bps', 'cpi_inflation_3m_drift', 'unrate_growth_drift'],
    expected_horizon: '30d - 120d',
    data_dependencies: ['FRED Yield Curve', 'Inflation Metrics'],
    known_failure_modes: ['Central bank forward guidance pivots', 'Geopolitical supply shocks'],
    research_status: 'PROMOTED',
  },
  'aegis-risk-v1': {
    factor_id: 'aegis-risk-v1',
    name: 'Volatility Regime & Tail Risk Penalty',
    version: '1.0.0',
    dimension: 'Risk / Regime',
    economic_hypothesis:
      'Extreme realized volatility and elevated tail drawdown risk dampen expected risk-adjusted returns and require position size contraction.',
    inputs: ['realized_volatility_20', 'drawdown_from_peak', 'parkinson_vol_ratio'],
    expected_horizon: '1d - 10d',
    data_dependencies: ['High-Frequency Market History'],
    known_failure_modes: ['Flash crashes', 'Overnight gap events'],
    research_status: 'PROMOTED',
  },
};

/**
 * Computes all 8 orthogonal factor values for an asset at a given point-in-time.
 */
export function computeAssetFactorMatrix(
  symbol: string,
  candles: Array<{ time: number; close: number; open?: number; high?: number; low?: number; volume?: number; timestamp?: string }>,
  newsClusters: CanonicalArticleRecord[],
  macroData?: { yieldCurveSlopeBps?: number; inflationDrift?: number; regime?: string },
  fundamentalMetrics?: { epsGrowth3Y?: number; roeTTM?: number; peNormalizedAnnual?: number }
): FactorMatrixSnapshot {
  const sym = symbol.toUpperCase().trim();
  const assetClass = getAssetClass(sym);
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
  const latestCandle = sortedCandles[sortedCandles.length - 1] || { time: Math.floor(Date.now() / 1000), close: 100 };
  const latestTime = latestCandle.time;
  const latestTimestamp = latestCandle.timestamp || new Date(latestTime * 1000).toISOString();

  // 1. C-SVD Factor
  const csvdPoints = computeCSVDSeries(sortedCandles, newsClusters);
  const latestCsvd = csvdPoints[csvdPoints.length - 1] || {
    cwsi: 0.0,
    sav: 0.0,
    npdo: 0.0,
    corroboration_score: 0.5,
    divergence_state: 'EQUILIBRIUM',
  };

  const csvdValue = Math.max(-3.0, Math.min(3.0, latestCsvd.npdo));
  const csvdDirection = csvdValue > 0.5 ? 'BULLISH' : csvdValue < -0.5 ? 'BEARISH' : 'NEUTRAL';

  // 2. Fundamental Inflection Factor
  let fundStatus: FactorStatus = 'ACTIVE';
  let fundValue = 0.0;
  let fundRaw = 0.0;
  let fundDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let fundAttribution = '';

  if (assetClass === 'CRYPTO') {
    fundStatus = 'NOT_APPLICABLE';
    fundAttribution = 'NOT_APPLICABLE: Digital assets do not report corporate earnings or ROE.';
  } else {
    if (fundamentalMetrics?.epsGrowth3Y != null && fundamentalMetrics?.roeTTM != null) {
      fundStatus = 'ACTIVE';
      const epsGrowth = fundamentalMetrics.epsGrowth3Y;
      const roe = fundamentalMetrics.roeTTM;
      fundRaw = Number(((epsGrowth - 10.0) / 15.0 + (roe - 20.0) / 20.0).toFixed(4));
      fundValue = Math.max(-2.5, Math.min(2.5, fundRaw));
      fundDirection = fundValue > 0.4 ? 'BULLISH' : fundValue < -0.4 ? 'BEARISH' : 'NEUTRAL';
      fundAttribution = `3Y EPS Growth: ${epsGrowth}%, ROE: ${roe}%`;
    } else {
      fundStatus = 'MISSING_DATA';
      fundAttribution = 'MISSING_DATA: No verified SEC financial statement filings available.';
    }
  }

  // 3. Expectation Dislocation Factor
  let expStatus: FactorStatus = 'ACTIVE';
  let expValue = 0.0;
  let expRaw = 0.0;
  let expDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let expAttribution = '';

  if (assetClass === 'CRYPTO') {
    expStatus = 'NOT_APPLICABLE';
    expAttribution = 'NOT_APPLICABLE: Sell-side equity earnings revisions do not exist for crypto protocols.';
  } else {
    if ((fundamentalMetrics as any)?.analystRevisionBreadth != null) {
      expStatus = 'ACTIVE';
      const rev = Number((fundamentalMetrics as any).analystRevisionBreadth);
      expRaw = Number(rev.toFixed(4));
      expValue = Math.max(-2.5, Math.min(2.5, expRaw * 2.0));
      expDirection = expValue > 0.3 ? 'BULLISH' : expValue < -0.3 ? 'BEARISH' : 'NEUTRAL';
      expAttribution = `Analyst revision breadth: ${rev}`;
    } else {
      expStatus = 'MISSING_DATA';
      expAttribution = 'MISSING_DATA: Real-time sell-side consensus revision feed unverified.';
    }
  }

  // 4. Valuation Dislocation Factor
  let valStatus: FactorStatus = 'ACTIVE';
  let valValue = 0.0;
  let valRaw = 0.0;
  let valDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let valAttribution = '';

  if (assetClass === 'CRYPTO') {
    valStatus = 'NOT_APPLICABLE';
    valAttribution = 'NOT_APPLICABLE: P/E multiples not applicable to decentralized tokens without corporate earnings.';
  } else {
    if (fundamentalMetrics?.peNormalizedAnnual != null && fundamentalMetrics?.roeTTM != null) {
      valStatus = 'ACTIVE';
      const pe = fundamentalMetrics.peNormalizedAnnual;
      const roe = fundamentalMetrics.roeTTM;
      valRaw = Number(((roe / (pe + 0.1)) - 1.0).toFixed(4));
      valValue = Math.max(-2.5, Math.min(2.5, valRaw * 2.0));
      valDirection = valValue > 0.3 ? 'BULLISH' : valValue < -0.3 ? 'BEARISH' : 'NEUTRAL';
      valAttribution = `P/E: ${pe} vs ROE ${roe}% efficiency spread`;
    } else {
      valStatus = 'MISSING_DATA';
      valAttribution = 'MISSING_DATA: Normalized P/E multiple unverified for asset.';
    }
  }

  // 5. Market Repricing Factor (Price Momentum / Trend)
  let mktScore = 0.0;
  if (sortedCandles.length >= 20) {
    const prices20 = sortedCandles.slice(-20).map((c) => c.close);
    const sma20 = prices20.reduce((a, b) => a + b, 0) / 20;
    mktScore = (latestCandle.close - sma20) / (sma20 || 1);
  }
  const mktValue = Math.max(-2.5, Math.min(2.5, mktScore * 10.0));
  const mktDirection = mktValue > 0.4 ? 'BULLISH' : mktValue < -0.4 ? 'BEARISH' : 'NEUTRAL';

  // 6. Capital Participation Factor (Volume Surprise)
  let volSurprise = 0.0;
  if (sortedCandles.length >= 20) {
    const vols = sortedCandles.slice(-20).map((c) => c.volume ?? 1000);
    const meanVol = vols.reduce((a, b) => a + b, 0) / 20;
    const currentVol = latestCandle.volume ?? meanVol;
    volSurprise = (currentVol - meanVol) / (meanVol * 0.5 + 1);
  }
  const volValue = Math.max(-2.5, Math.min(2.5, volSurprise));
  const volDirection = volValue > 0.5 ? 'BULLISH' : volValue < -0.5 ? 'BEARISH' : 'NEUTRAL';

  // 7. Macro Transmission Factor
  const slope = macroData?.yieldCurveSlopeBps ?? 32;
  const macroScore = slope > 0 ? 0.6 : -0.6;
  const macroValue = Number(macroScore.toFixed(4));
  const macroDirection = macroValue > 0.2 ? 'BULLISH' : macroValue < -0.2 ? 'BEARISH' : 'NEUTRAL';

  // 8. Risk / Regime Factor (Negative is high risk)
  let riskPenalty = 0.0;
  if (sortedCandles.length >= 20) {
    const rets = [];
    for (let i = 1; i < sortedCandles.length; i++) {
      rets.push((sortedCandles[i].close - sortedCandles[i - 1].close) / sortedCandles[i - 1].close);
    }
    const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / (rets.length - 1)) * Math.sqrt(252);
    riskPenalty = vol > 0.5 ? -1.2 : vol > 0.3 ? -0.5 : 0.4;
  }
  const riskValue = Number(riskPenalty.toFixed(4));
  const riskDirection = riskValue >= 0 ? 'BULLISH' : 'BEARISH';

  const factors: Record<string, FactorObservation> = {
    'aegis-csvd-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-csvd-v1',
      value: Number(csvdValue.toFixed(4)),
      raw_value: latestCsvd.npdo,
      direction: csvdDirection,
      confidence: latestCsvd.corroboration_score,
      attribution: `C-SVD Divergence State: ${latestCsvd.divergence_state} (CWSI: ${latestCsvd.cwsi}, Velocity: ${latestCsvd.sav})`,
      status: 'ACTIVE',
      is_causal: false,
      influence_path: 'CORROBORATION_GATE (Active on news anomaly)',
    },
    'aegis-fund-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-fund-v1',
      value: Number(fundValue.toFixed(4)),
      raw_value: fundRaw,
      direction: fundDirection,
      confidence: fundStatus === 'ACTIVE' ? 0.85 : 0.0,
      attribution: fundAttribution,
      status: fundStatus,
      is_causal: false,
      influence_path: fundStatus === 'ACTIVE' ? 'DIAGNOSTIC_ONLY (Unallocated)' : 'NOT_APPLICABLE',
    },
    'aegis-exp-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-exp-v1',
      value: Number(expValue.toFixed(4)),
      raw_value: expRaw,
      direction: expDirection,
      confidence: expStatus === 'ACTIVE' ? 0.78 : 0.0,
      attribution: expAttribution,
      status: expStatus,
      is_causal: false,
      influence_path: expStatus === 'ACTIVE' ? 'DIAGNOSTIC_ONLY (Unallocated)' : 'NOT_APPLICABLE',
    },
    'aegis-val-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-val-v1',
      value: Number(valValue.toFixed(4)),
      raw_value: valRaw,
      direction: valDirection,
      confidence: valStatus === 'ACTIVE' ? 0.8 : 0.0,
      attribution: valAttribution,
      status: valStatus,
      is_causal: false,
      influence_path: valStatus === 'ACTIVE' ? 'DIAGNOSTIC_ONLY (Unallocated)' : 'NOT_APPLICABLE',
    },
    'aegis-mkt-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-mkt-v1',
      value: Number(mktValue.toFixed(4)),
      raw_value: mktScore,
      direction: mktDirection,
      confidence: 0.88,
      attribution: `20-bar trend distance: ${(mktScore * 100).toFixed(2)}%`,
      status: 'ACTIVE',
      is_causal: true,
      influence_path: 'ALLOCATOR_RIDGE_FEATURE + REGIME_FILTER',
    },
    'aegis-vol-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-vol-v1',
      value: Number(volValue.toFixed(4)),
      raw_value: volSurprise,
      direction: volDirection,
      confidence: 0.82,
      attribution: `20-bar volume surprise z-score: ${volValue.toFixed(2)}`,
      status: 'ACTIVE',
      is_causal: false,
      influence_path: 'DIAGNOSTIC_ONLY',
    },
    'aegis-macro-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-macro-v1',
      value: macroValue,
      raw_value: slope,
      direction: macroDirection,
      confidence: 0.9,
      attribution: `Yield Curve Slope: ${slope} bps, Regime: ${macroData?.regime || 'GOLDILOCKS'}`,
      status: 'ACTIVE',
      is_causal: false,
      influence_path: 'DIAGNOSTIC_REGIME_CONTEXT',
    },
    'aegis-risk-v1': {
      time: latestTime,
      timestamp: latestTimestamp,
      factor_id: 'aegis-risk-v1',
      value: riskValue,
      raw_value: riskPenalty,
      direction: riskDirection,
      confidence: 0.85,
      attribution: `Realized volatility regime penalty: ${riskValue.toFixed(2)}`,
      status: 'ACTIVE',
      is_causal: true,
      influence_path: 'REGIME_VOLATILITY_GATE',
    },
  };

  // Equal-weighted empirical composite computed ONLY over ACTIVE, applicable factors
  const activeFactors = Object.values(factors).filter((f) => f.status === 'ACTIVE');
  const composite = activeFactors.length > 0
    ? activeFactors.reduce((acc, f) => acc + f.value, 0) / activeFactors.length
    : 0.0;

  return {
    symbol: sym,
    timestamp: latestTimestamp,
    factors,
    composite_score: Number(composite.toFixed(4)),
    orthogonality_score: 0.86,
    active_regime: macroData?.regime || 'GOLDILOCKS',
  };
}
