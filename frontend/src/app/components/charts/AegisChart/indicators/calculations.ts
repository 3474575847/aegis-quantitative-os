import { Candle } from '../types';

export interface IndicatorSeriesData {
  time: number;
  value: number;
  [key: string]: number | string;
}

export interface IndicatorOutput {
  id: string;
  name: string;
  type: 'overlay' | 'pane';
  series: Array<{
    name: string;
    color: string;
    data: Array<{ time: number; value: number }>;
    histogram?: boolean;
  }>;
}

// 1. Simple Moving Average (SMA)
export function calculateSMA(candles: Candle[], period: number = 20): IndicatorSeriesData[] {
  return candles.map((candle, index) => {
    if (index + 1 < period) {
      return { time: candle.time, value: candle.close };
    }
    const slice = candles.slice(index + 1 - period, index + 1);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    return { time: candle.time, value: sum / period };
  });
}

// 2. Exponential Moving Average (EMA)
export function calculateEMA(candles: Candle[], period: number = 21): IndicatorSeriesData[] {
  const k = 2 / (period + 1);
  let prevEMA = candles[0]?.close ?? 0;
  return candles.map((candle, index) => {
    if (index === 0) {
      prevEMA = candle.close;
    } else {
      prevEMA = candle.close * k + prevEMA * (1 - k);
    }
    return { time: candle.time, value: prevEMA };
  });
}

// 3. Volume Weighted Average Price (VWAP)
export function calculateVWAP(candles: Candle[]): IndicatorSeriesData[] {
  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  return candles.map((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const vol = candle.volume ?? 1;
    cumulativeTPV += typicalPrice * vol;
    cumulativeVol += vol;
    const vwap = cumulativeVol > 0 ? cumulativeTPV / cumulativeVol : typicalPrice;
    return { time: candle.time, value: vwap };
  });
}

// 4. Bollinger Bands (20-period, 2 stddev)
export function calculateBollingerBands(candles: Candle[], period: number = 20, stdDevMult: number = 2) {
  const smaData = calculateSMA(candles, period);
  const upper: IndicatorSeriesData[] = [];
  const middle: IndicatorSeriesData[] = [];
  const lower: IndicatorSeriesData[] = [];

  candles.forEach((candle, index) => {
    const midVal = smaData[index].value;
    middle.push({ time: candle.time, value: midVal });

    if (index + 1 < period) {
      upper.push({ time: candle.time, value: candle.high });
      lower.push({ time: candle.time, value: candle.low });
      return;
    }

    const slice = candles.slice(index + 1 - period, index + 1);
    const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - midVal, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push({ time: candle.time, value: midVal + stdDev * stdDevMult });
    lower.push({ time: candle.time, value: midVal - stdDev * stdDevMult });
  });

  return { upper, middle, lower };
}

// 5. Relative Strength Index (RSI - 14 period)
export function calculateRSI(candles: Candle[], period: number = 14): IndicatorSeriesData[] {
  if (candles.length < 2) return candles.map((c) => ({ time: c.time, value: 50 }));

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= Math.min(period, candles.length - 1); i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const result: IndicatorSeriesData[] = [];

  candles.forEach((candle, index) => {
    if (index < period) {
      result.push({ time: candle.time, value: 50 });
      return;
    }

    const change = candle.close - candles[index - 1].close;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push({ time: candle.time, value: 100 });
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push({ time: candle.time, value: rsi });
    }
  });

  return result;
}

// 6. MACD (12, 26, 9)
export function calculateMACD(candles: Candle[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  const macdLine: IndicatorSeriesData[] = candles.map((c, i) => ({
    time: c.time,
    value: fastEMA[i].value - slowEMA[i].value,
  }));

  // Signal line is EMA of macdLine
  const k = 2 / (signalPeriod + 1);
  let prevSignal = macdLine[0]?.value ?? 0;
  const signalLine: IndicatorSeriesData[] = macdLine.map((m, i) => {
    if (i === 0) prevSignal = m.value;
    else prevSignal = m.value * k + prevSignal * (1 - k);
    return { time: m.time, value: prevSignal };
  });

  const histogram: IndicatorSeriesData[] = macdLine.map((m, i) => ({
    time: m.time,
    value: m.value - signalLine[i].value,
  }));

  return { macdLine, signalLine, histogram };
}

// 7. Average True Range (ATR - 14)
export function calculateATR(candles: Candle[], period: number = 14): IndicatorSeriesData[] {
  if (candles.length === 0) return [];
  const trs: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  });

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / Math.max(1, period);
  const result: IndicatorSeriesData[] = [];

  candles.forEach((c, i) => {
    if (i < period) {
      result.push({ time: c.time, value: trs[i] });
    } else {
      atr = (atr * (period - 1) + trs[i]) / period;
      result.push({ time: c.time, value: atr });
    }
  });

  return result;
}

// 8. Momentum Indicator (% price change over period)
export function calculateMomentum(candles: Candle[], period: number = 10): IndicatorSeriesData[] {
  return candles.map((c, i) => {
    if (i < period) return { time: c.time, value: 0 };
    const prev = candles[i - period].close;
    const mom = prev > 0 ? ((c.close - prev) / prev) * 100 : 0;
    return { time: c.time, value: mom };
  });
}

// 9. Stochastic Oscillator (%K, %D - 14, 3)
export function calculateStochastic(candles: Candle[], kPeriod: number = 14, dPeriod: number = 3) {
  const kLine: IndicatorSeriesData[] = candles.map((c, i) => {
    if (i + 1 < kPeriod) return { time: c.time, value: 50 };
    const slice = candles.slice(i + 1 - kPeriod, i + 1);
    const highestHigh = Math.max(...slice.map((item) => item.high));
    const lowestLow = Math.min(...slice.map((item) => item.low));
    const range = highestHigh - lowestLow;
    const kVal = range > 0 ? ((c.close - lowestLow) / range) * 100 : 50;
    return { time: c.time, value: kVal };
  });

  const dLine = calculateSMA(kLine.map((item) => ({ time: item.time, open: item.value, high: item.value, low: item.value, close: item.value })), dPeriod);

  return { kLine, dLine };
}
