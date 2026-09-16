import { CanonicalArticleRecord } from './store';

export interface CSVDPoint {
  time: number;
  timestamp: string;
  cwsi: number; // Corroboration-Weighted Sentiment Index [-1.0, 1.0]
  sav: number; // Sentiment Acceleration & Velocity z-score
  npdo: number; // News-Price Divergence Oscillator z-score
  corroboration_score: number; // Max/Avg cluster corroboration [0.0, 1.0]
  publisher_count: number; // Total distinct publishers contributing
  signal_action: 'BUY' | 'SELL' | 'HOLD';
  divergence_state: 'BULLISH_DISCOVERY' | 'BEARISH_BREAKDOWN' | 'UNCORROBORATED_HYPE_FADE' | 'EQUILIBRIUM';
  confidence: number;
  primary_headline?: string;
}

export interface CSVDParameters {
  halfLifeHours: number; // e.g. 48 hours for exponential decay
  velocityFastSpan: number; // e.g. 6 bars
  velocitySlowSpan: number; // e.g. 24 bars
  divergenceZWindow: number; // e.g. 20 bars
  divergenceThreshold: number; // e.g. 1.5 z-score
  minCorroboration: number; // e.g. 0.70
}

export const DEFAULT_CSVD_PARAMS: CSVDParameters = {
  halfLifeHours: 48,
  velocityFastSpan: 6,
  velocitySlowSpan: 24,
  divergenceZWindow: 20,
  divergenceThreshold: 1.5,
  minCorroboration: 0.7,
};

/**
 * Computes the Point-In-Time Corroboration-Weighted Sentiment & Velocity Divergence (C-SVD)
 * factor series strictly aligned with price candles and news publication availability.
 */
export function computeCSVDSeries(
  candles: Array<{ time: number; close: number; open?: number; timestamp?: string }>,
  newsClusters: CanonicalArticleRecord[],
  params: CSVDParameters = DEFAULT_CSVD_PARAMS
): CSVDPoint[] {
  if (!candles || candles.length === 0) return [];

  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
  const sortedClusters = [...newsClusters].sort(
    (a, b) => new Date(a.first_available_at).getTime() - new Date(b.first_available_at).getTime()
  );

  const points: CSVDPoint[] = [];
  const cwsiHistory: number[] = [];
  const priceReturnsHistory: number[] = [];

  // EMA trackers for Sentiment Velocity
  let emaFast = 0.0;
  let emaSlow = 0.0;
  const alphaFast = 2.0 / (params.velocityFastSpan + 1);
  const alphaSlow = 2.0 / (params.velocitySlowSpan + 1);

  for (let i = 0; i < sortedCandles.length; i++) {
    const candle = sortedCandles[i];
    const candleTimeMs = candle.time * 1000;

    // Price return over lookback
    const prevCandle = i > 0 ? sortedCandles[i - 1] : candle;
    const pRet = prevCandle.close > 0 ? (candle.close - prevCandle.close) / prevCandle.close : 0.0;
    priceReturnsHistory.push(pRet);

    // Filter news clusters that were strictly available AT OR BEFORE this candle
    const availableClusters = sortedClusters.filter((c) => {
      const availTimeMs = new Date(c.first_available_at).getTime();
      return availTimeMs <= candleTimeMs;
    });

    let totalWeight = 0.0;
    let weightedSentimentSum = 0.0;
    let maxCorroboration = 0.0;
    let totalPublishers = 0;
    let primaryHeadline: string | undefined;

    if (availableClusters.length > 0) {
      // Look at recent clusters within halfLife window
      const halfLifeMs = params.halfLifeHours * 3600 * 1000;
      const decayLambda = Math.LN2 / halfLifeMs;

      for (const cluster of availableClusters) {
        const clusterAvailMs = new Date(cluster.first_available_at).getTime();
        const ageMs = Math.max(0, candleTimeMs - clusterAvailMs);

        // Exponential time decay
        const timeDecay = Math.exp(-decayLambda * ageMs);
        if (timeDecay < 0.01) continue; // Ignore obsolete news

        // Point-in-time corroboration evaluation: only count publishers available AT OR BEFORE candleTimeMs
        let pitPubCount = cluster.publisher_count;
        let pitCorrScore = cluster.corroboration_score;

        if (cluster.raws && Array.isArray(cluster.raws) && cluster.raws.length > 0) {
          const pitRaws = cluster.raws.filter((r: any) => {
            const rTimeMs = new Date(r.available_at || r.published_at || cluster.first_available_at).getTime();
            return rTimeMs <= candleTimeMs;
          });
          const pitPublishers = new Set(pitRaws.map((r: any) => r.publisher || 'unknown'));
          pitPubCount = Math.max(1, pitPublishers.size);
          pitCorrScore = pitPubCount >= 3 ? 0.95 : pitPubCount === 2 ? 0.75 : 0.50;
        }

        // Corroboration-squared weighting * log(1 + pitPubCount)
        const corrWeight = Math.pow(pitCorrScore, 2) * Math.log(1 + pitPubCount);
        const weight = corrWeight * timeDecay;

        weightedSentimentSum += cluster.sentiment_polarity * weight;
        totalWeight += weight;
        totalPublishers += pitPubCount;

        if (pitCorrScore > maxCorroboration) {
          maxCorroboration = pitCorrScore;
          primaryHeadline = cluster.primary_headline;
        }
      }
    }

    const rawSentimentWeighted = totalWeight > 0 ? weightedSentimentSum / totalWeight : 0.0;
    // Scale CWSI by max PIT corroboration score so single uncorroborated sources produce reduced index magnitude
    const cwsi = Number((rawSentimentWeighted * (maxCorroboration || 0.5)).toFixed(4));
    cwsiHistory.push(cwsi);

    // Compute EMA velocity
    if (i === 0) {
      emaFast = cwsi;
      emaSlow = cwsi;
    } else {
      emaFast = alphaFast * cwsi + (1 - alphaFast) * emaFast;
      emaSlow = alphaSlow * cwsi + (1 - alphaSlow) * emaSlow;
    }

    // Sentiment Acceleration & Velocity (SAV)
    const windowStart = Math.max(0, i - params.divergenceZWindow + 1);
    const windowCwsi = cwsiHistory.slice(windowStart, i + 1);
    const cwsiMean = windowCwsi.reduce((a, b) => a + b, 0) / windowCwsi.length;
    const cwsiVar =
      windowCwsi.length > 1
        ? windowCwsi.reduce((acc, v) => acc + Math.pow(v - cwsiMean, 2), 0) / (windowCwsi.length - 1)
        : 0.01;
    const cwsiStd = Math.sqrt(cwsiVar) || 0.01;
    const sav = Number(((emaFast - emaSlow) / cwsiStd).toFixed(4));

    // Information-Price Divergence Oscillator (NPDO)
    // Z(CWSI) - Z(Price Return)
    const windowReturns = priceReturnsHistory.slice(windowStart, i + 1);
    const retMean = windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length;
    const retVar =
      windowReturns.length > 1
        ? windowReturns.reduce((acc, v) => acc + Math.pow(v - retMean, 2), 0) / (windowReturns.length - 1)
        : 0.0001;
    const retStd = Math.sqrt(retVar) || 0.0001;

    const zSentiment = (cwsi - cwsiMean) / cwsiStd;
    const zPrice = (pRet - retMean) / retStd;
    const npdo = Number((zSentiment - zPrice).toFixed(4));

    // Determine Divergence State & Signal
    let divergenceState: CSVDPoint['divergence_state'] = 'EQUILIBRIUM';
    let action: CSVDPoint['signal_action'] = 'HOLD';
    let confidence = 0.5;

    if (npdo >= params.divergenceThreshold && maxCorroboration >= params.minCorroboration) {
      divergenceState = 'BULLISH_DISCOVERY';
      action = 'BUY';
      confidence = Math.min(0.95, Number((0.6 + (npdo - params.divergenceThreshold) * 0.15).toFixed(2)));
    } else if (npdo <= -params.divergenceThreshold && maxCorroboration >= params.minCorroboration) {
      divergenceState = 'BEARISH_BREAKDOWN';
      action = 'SELL';
      confidence = Math.min(0.95, Number((0.6 + (-npdo - params.divergenceThreshold) * 0.15).toFixed(2)));
    } else if (npdo <= -params.divergenceThreshold && maxCorroboration < 0.6) {
      divergenceState = 'UNCORROBORATED_HYPE_FADE';
      action = 'SELL'; // Fade unconfirmed rumor spike
      confidence = 0.72;
    }

    points.push({
      time: candle.time,
      timestamp: candle.timestamp || new Date(candle.time * 1000).toISOString(),
      cwsi,
      sav,
      npdo,
      corroboration_score: Number(maxCorroboration.toFixed(2)),
      publisher_count: totalPublishers,
      signal_action: action,
      divergence_state: divergenceState,
      confidence,
      primary_headline: primaryHeadline,
    });
  }

  return points;
}
