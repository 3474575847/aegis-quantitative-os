import { CandleDatapoint } from './market';
import { CanonicalArticleRecord } from './store';
import { computeCSVDSeries } from './csvd';

export interface CryptoFactorObservation {
  factor_id: string;
  name: string;
  dimension: string;
  raw_value: number;
  z_score: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  status: 'ACTIVE' | 'NOT_APPLICABLE';
  economic_hypothesis: string;
}

export interface CryptoFactorSnapshot {
  symbol: string;
  timestamp: string;
  time: number;
  factors: Record<string, CryptoFactorObservation>;
  composite_score: number;
}

/**
 * Computes genuinely crypto-native factors for digital assets.
 * Excludes equity metrics (EPS, ROE, P/E, Analyst revisions).
 */
export const CRYPTO_FACTOR_BETAS: Record<string, number> = {
  'crypto-ofi-v1': 0.15,
  'crypto-funding-v1': -0.20,
  'crypto-semivar-v1': -0.15,
  'crypto-volsurprise-v1': 0.25,
  'crypto-mom-v1': -0.35,
  'crypto-crossasset-v1': -0.15,
  'crypto-csvd-v1': -0.10,
};

export function computeCryptoFactors(
  symbol: string,
  candles: CandleDatapoint[],
  newsClusters: CanonicalArticleRecord[] = []
): CryptoFactorSnapshot {
  const sym = symbol.toUpperCase().trim().replace('-USD', '').replace('USDT', '');
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  const latest = sorted[n - 1] || { time: Math.floor(Date.now() / 1000), close: 100, volume: 1000 };
  const latestTimestamp = latest.timestamp || new Date(latest.time * 1000).toISOString();

  const closes = sorted.map((c) => c.close);
  const highs = sorted.map((c) => c.high || c.close);
  const lows = sorted.map((c) => c.low || c.close);
  const volumes = sorted.map((c) => c.volume || 1000);

  // 1. Order Flow Imbalance (OFI) / Volume Trade Imbalance
  // Estimates aggressive buying vs selling based on close position within high-low bar & volume
  let ofiRaw = 0;
  if (n >= 10) {
    let buyVolSum = 0;
    let sellVolSum = 0;
    const window = Math.min(14, n);
    for (let i = n - window; i < n; i++) {
      const range = highs[i] - lows[i];
      const buyProp = range > 1e-6 ? (closes[i] - lows[i]) / range : 0.5;
      const buyV = volumes[i] * buyProp;
      const sellV = volumes[i] * (1 - buyProp);
      buyVolSum += buyV;
      sellVolSum += sellV;
    }
    const totV = buyVolSum + sellVolSum || 1;
    ofiRaw = (buyVolSum - sellVolSum) / totV; // Bounded [-1.0, 1.0]
  }
  const ofiZ = Math.max(-3.0, Math.min(3.0, ofiRaw * 3.0));

  // 2. Funding Rate & Funding Acceleration Proxy
  // Derived from intraday momentum divergence and volume pressure
  let fundingRateRaw = 0;
  let fundingAccelRaw = 0;
  if (n >= 20) {
    const recentRet = (closes[n - 1] - closes[n - 5]) / (closes[n - 5] || 1);
    const prevRet = (closes[n - 5] - closes[n - 10]) / (closes[n - 10] || 1);
    fundingRateRaw = recentRet * 10.0; // Proxy perpetual funding rate
    fundingAccelRaw = (recentRet - prevRet) * 20.0; // Funding acceleration
  }
  const fundingZ = Math.max(-3.0, Math.min(3.0, -fundingAccelRaw)); // High positive funding accel indicates crowded long -> contrarian bearish

  // 3. Volatility Semivariance Ratio (Upside vs Downside Volatility)
  let semivarianceRatio = 1.0;
  if (n >= 20) {
    let upSum = 0;
    let downSum = 0;
    let upCnt = 0;
    let downCnt = 0;
    for (let i = n - 20; i < n; i++) {
      const ret = (closes[i] - closes[i - 1]) / (closes[i - 1] || 1);
      if (ret > 0) {
        upSum += ret * ret;
        upCnt++;
      } else if (ret < 0) {
        downSum += ret * ret;
        downCnt++;
      }
    }
    const upVar = upCnt > 0 ? upSum / upCnt : 1e-5;
    const downVar = downCnt > 0 ? downSum / downCnt : 1e-5;
    semivarianceRatio = Math.sqrt(upVar) / (Math.sqrt(downVar) || 1e-5);
  }
  const semivarianceZ = Math.max(-3.0, Math.min(3.0, (semivarianceRatio - 1.0) * 2.5));

  // 4. Volume Anomaly / Capital Participation Surge
  let volSurpriseZ = 0;
  if (n >= 20) {
    const v20 = volumes.slice(-20);
    const meanV = v20.reduce((a, b) => a + b, 0) / 20;
    const stdV = Math.sqrt(v20.reduce((a, b) => a + Math.pow(b - meanV, 2), 0) / 20) || 1;
    volSurpriseZ = (volumes[n - 1] - meanV) / stdV;
  }
  const volSurpriseZBounded = Math.max(-3.0, Math.min(3.0, volSurpriseZ));

  // 5. Adaptive EMA Momentum Spread (16 vs 64 bar)
  let momSpreadZ = 0;
  if (n >= 30) {
    const kFast = 2 / 17;
    const kSlow = 2 / 65;
    let fast = closes[0];
    let slow = closes[0];
    for (let i = 1; i < n; i++) {
      fast = closes[i] * kFast + fast * (1 - kFast);
      slow = closes[i] * kSlow + slow * (1 - kSlow);
    }
    const spread = (fast - slow) / (slow || 1);
    momSpreadZ = Math.max(-3.0, Math.min(3.0, spread * 150.0));
  }

  // 6. Cross-Asset Apparent RSI Leadership (ETH/BTC relative strength proxy)
  let ethBtcRelStrengthZ = 0;
  if (n >= 14) {
    let gains = 0;
    let losses = 0;
    for (let i = n - 14; i < n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d;
      else losses -= d;
    }
    const rsi = (gains === 0 && losses === 0) ? 50 : losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    ethBtcRelStrengthZ = Math.max(-3.0, Math.min(3.0, (rsi - 50) / 15.0));
  }

  // 7. C-SVD News & Corroborated Sentiment Momentum
  const csvdPoints = computeCSVDSeries(sorted, newsClusters);
  const latestCsvd = csvdPoints[csvdPoints.length - 1] || { npdo: 0, corroboration_score: 0.5 };
  const csvdZ = Math.max(-3.0, Math.min(3.0, latestCsvd.npdo));

  const getDir = (z: number, beta: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    const impact = z * beta;
    return impact > 0.08 ? 'BULLISH' : impact < -0.08 ? 'BEARISH' : 'NEUTRAL';
  };

  const factors: Record<string, CryptoFactorObservation> = {
    'crypto-ofi-v1': {
      factor_id: 'crypto-ofi-v1',
      name: 'Order Flow Imbalance (OFI)',
      dimension: 'Microstructure',
      raw_value: Number(ofiRaw.toFixed(4)),
      z_score: Number(ofiZ.toFixed(4)),
      direction: getDir(ofiZ, CRYPTO_FACTOR_BETAS['crypto-ofi-v1']),
      confidence: 0.88,
      status: 'ACTIVE',
      economic_hypothesis: 'Aggressive taker order volume imbalances signal immediate directional liquidity sweeps.',
    },
    'crypto-funding-v1': {
      factor_id: 'crypto-funding-v1',
      name: 'Funding Rate & Acceleration',
      dimension: 'Derivatives',
      raw_value: Number(fundingAccelRaw.toFixed(4)),
      z_score: Number(fundingZ.toFixed(4)),
      direction: getDir(fundingZ, CRYPTO_FACTOR_BETAS['crypto-funding-v1']),
      confidence: 0.85,
      status: 'ACTIVE',
      economic_hypothesis: 'Perpetual funding rate acceleration identifies leveraged crowding and mean-reverting squeeze risks.',
    },
    'crypto-semivar-v1': {
      factor_id: 'crypto-semivar-v1',
      name: 'Volatility Semivariance Ratio',
      dimension: 'Price/Volatility',
      raw_value: Number(semivarianceRatio.toFixed(4)),
      z_score: Number(semivarianceZ.toFixed(4)),
      direction: getDir(semivarianceZ, CRYPTO_FACTOR_BETAS['crypto-semivar-v1']),
      confidence: 0.82,
      status: 'ACTIVE',
      economic_hypothesis: 'Asymmetric upside semivariance indicates local buying climax and exhaustion risk.',
    },
    'crypto-volsurprise-v1': {
      factor_id: 'crypto-volsurprise-v1',
      name: 'Volume Anomaly Surge',
      dimension: 'Capital Participation',
      raw_value: Number(volSurpriseZ.toFixed(4)),
      z_score: Number(volSurpriseZBounded.toFixed(4)),
      direction: getDir(volSurpriseZBounded, CRYPTO_FACTOR_BETAS['crypto-volsurprise-v1']),
      confidence: 0.80,
      status: 'ACTIVE',
      economic_hypothesis: 'Statistically significant volume spikes signal institutional participation or absorption.',
    },
    'crypto-mom-v1': {
      factor_id: 'crypto-mom-v1',
      name: 'EMA Overextension / Mean Reversion',
      dimension: 'Price Momentum',
      raw_value: Number((momSpreadZ / 150.0).toFixed(6)),
      z_score: Number(momSpreadZ.toFixed(4)),
      direction: getDir(momSpreadZ, CRYPTO_FACTOR_BETAS['crypto-mom-v1']),
      confidence: 0.90,
      status: 'ACTIVE',
      economic_hypothesis: 'Intraday EMA overextension indicates exhaustion and mean-reverting pressure on 5m timeframes.',
    },
    'crypto-crossasset-v1': {
      factor_id: 'crypto-crossasset-v1',
      name: 'Cross-Asset Momentum Leadership',
      dimension: 'Cross-Asset',
      raw_value: Number(ethBtcRelStrengthZ.toFixed(4)),
      z_score: Number(ethBtcRelStrengthZ.toFixed(4)),
      direction: getDir(ethBtcRelStrengthZ, CRYPTO_FACTOR_BETAS['crypto-crossasset-v1']),
      confidence: 0.84,
      status: 'ACTIVE',
      economic_hypothesis: 'Relative strength in major crypto benchmarks proxies broader market risk-on appetite.',
    },
    'crypto-csvd-v1': {
      factor_id: 'crypto-csvd-v1',
      name: 'C-SVD Corroborated News Discovery',
      dimension: 'News & Sentiment',
      raw_value: Number(latestCsvd.npdo.toFixed(4)),
      z_score: Number(csvdZ.toFixed(4)),
      direction: getDir(csvdZ, CRYPTO_FACTOR_BETAS['crypto-csvd-v1']),
      confidence: latestCsvd.corroboration_score || 0.75,
      status: 'ACTIVE',
      economic_hypothesis: 'Corroborated news discovery leads price equilibrium adjustments.',
    },
  };

  let composite = 0;
  for (const [k, obs] of Object.entries(factors)) {
    const beta = CRYPTO_FACTOR_BETAS[k] ?? 0.1;
    composite += obs.z_score * beta;
  }

  return {
    symbol: sym,
    timestamp: latestTimestamp,
    time: latest.time,
    factors,
    composite_score: Number(composite.toFixed(4)),
  };
}
