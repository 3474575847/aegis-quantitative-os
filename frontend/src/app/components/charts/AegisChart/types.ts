export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  sentimentZ?: number;
  eventTitle?: string | null;
}

export interface ChartDatapoint {
  timestamp: string;
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  price: number;
  sentimentZ?: number;
  eventTitle?: string | null;
}

export interface AegisSignalOverlay {
  id: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0..1 or %
  rationale: string;
  article_id?: string;
  market_timestamp: string;
  headline?: string;
  score?: number;
  momentum?: number;
  sentiment?: number;
  volumeZ?: number;
  factor_values?: Record<string, number>;
  factor_contributions?: Array<{ name: string; value: number; weight: number; contribution: number }>;
}

export interface AegisEventOverlay {
  id: string;
  timestamp: number | string;
  title: string;
  type: 'news' | 'earnings' | 'guidance' | 'regulatory' | 'macro' | 'sentiment_anomaly';
  sentiment?: 'positive' | 'negative' | 'neutral';
  sourcesCount?: number;
  url?: string;
  availableAt?: string;
}

export interface BacktestTradeOverlay {
  id: string;
  entryTimestamp: number | string;
  entryPrice: number;
  exitTimestamp?: number | string;
  exitPrice?: number;
  returnPct?: number;
  holdingPeriodDays?: number;
  strategyName?: string;
  direction: 'LONG' | 'SHORT';
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';
export type RangeShortcut = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';
export type ChartType = 'candles' | 'ohlc' | 'line' | 'area';

export type DrawingType =
  | 'cursor'
  | 'ruler'
  | 'trendline'
  | 'horizontalLine'
  | 'verticalLine'
  | 'ray'
  | 'rectangle'
  | 'arrow'
  | 'text'
  | 'fibonacci';

export interface ChartPoint {
  time: number;
  price: number;
}

export interface DrawingStyle {
  color?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fontSize?: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: ChartPoint[];
  style?: DrawingStyle;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface MeasurementResult {
  id: string;
  start: ChartPoint;
  end: ChartPoint;
  priceStart: number;
  priceEnd: number;
  priceChange: number;
  returnPct: number;
  calendarDays: number;
  tradingDays: number;
  formattedTimeSpan: string;
  annualizedReturn?: number;
}

export type IndicatorId =
  | 'sma'
  | 'ema'
  | 'vwap'
  | 'bollinger'
  | 'rsi'
  | 'macd'
  | 'atr'
  | 'momentum'
  | 'stochastic';

export interface IndicatorConfig {
  id: IndicatorId;
  enabled: boolean;
  params: Record<string, number>;
  color?: string;
}

export interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  range: RangeShortcut;
  chartType: ChartType;
  showVolume: boolean;
  activeDrawingTool: DrawingType;
  drawings: Drawing[];
  selectedDrawingId: string | null;
  measurements: MeasurementResult[];
  indicators: Record<IndicatorId, IndicatorConfig>;
  showSignals: boolean;
  showEvents: boolean;
  showBacktests: boolean;
}
