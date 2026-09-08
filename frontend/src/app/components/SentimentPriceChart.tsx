'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatFigure, formatPercent, formatSignedFigure } from '../../lib/api';

export interface ChartDatapoint {
  timestamp: string;
  time?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  price: number;
  sentimentZ: number;
  eventTitle?: string | null;
}

export interface ChartSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  rationale: string;
  article_id: string;
  market_timestamp: string;
  headline: string;
  factor_values?: Record<string, number>;
  factor_contributions?: Array<{ name: string; value: number; weight: number; contribution: number }>;
}

interface Props {
  data?: ChartDatapoint[];
  signals?: ChartSignal[];
  assetName?: string;
}

interface CandlePoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Measurement {
  start: { time: UTCTimestamp; price: number };
  end: { time: UTCTimestamp; price: number };
}

const COLORS = {
  green: '#10b981',
  red: '#ef4444',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  grid: '#242e42',
  text: '#94a3b8',
};

function cleanCandles(data: ChartDatapoint[]): CandlePoint[] {
  const deduped = new Map<number, CandlePoint>();
  for (const point of data) {
    const time = point.time;
    const open = point.open ?? point.price;
    const high = point.high ?? point.price;
    const low = point.low ?? point.price;
    const close = point.close ?? point.price;
    if (!time || ![open, high, low, close].every(Number.isFinite) || low > high || open < low || open > high || close < low || close > high) continue;
    deduped.set(time, { time: time as UTCTimestamp, open, high, low, close, volume: point.volume });
  }
  return [...deduped.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

function sma(candles: CandlePoint[], period: number) {
  return candles.map((candle, index) => {
    if (index + 1 < period) return { time: candle.time, value: candle.close };
    const window = candles.slice(index + 1 - period, index + 1);
    return { time: candle.time, value: window.reduce((sum, item) => sum + item.close, 0) / period };
  });
}

function ema(candles: CandlePoint[], period: number) {
  const alpha = 2 / (period + 1);
  let previous = candles[0]?.close ?? 0;
  return candles.map((candle, index) => {
    previous = index === 0 ? candle.close : alpha * candle.close + (1 - alpha) * previous;
    return { time: candle.time, value: previous };
  });
}

export default function SentimentPriceChart({ data = [], signals = [], assetName = 'BTC/USD' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [chartType, setChartType] = useState<'candles' | 'line' | 'area'>('candles');
  const [showVolume, setShowVolume] = useState(true);
  const [showSma, setShowSma] = useState(false);
  const [showEma, setShowEma] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [range, setRange] = useState<'1D' | '1W' | '1M'>('1D');
  const [hover, setHover] = useState<CandlePoint | null>(null);
  const [measurementStart, setMeasurementStart] = useState<{ time: UTCTimestamp; price: number } | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  const candles = useMemo(() => cleanCandles(data), [data]);
  const markerData = useMemo<SeriesMarker<Time>[]>(() => signals.filter((signal) => signal.action !== 'HOLD').flatMap((signal) => {
    const timestamp = Math.floor(Date.parse(signal.market_timestamp) / 1000) as UTCTimestamp;
    return [{
      time: timestamp,
      position: signal.action === 'BUY' ? 'belowBar' : 'aboveBar',
      color: signal.action === 'BUY' ? COLORS.green : COLORS.red,
      shape: signal.action === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: signal.action,
    }];
  }), [signals]);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#121722' }, textColor: COLORS.text },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLORS.grid },
      timeScale: { borderColor: COLORS.grid, timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 430,
    });
    chartRef.current = chart;
    const candleSeries = chart.addSeries({
      type: chartType === 'candles' ? 'Candlestick' : chartType === 'area' ? 'Area' : 'Line',
      upColor: COLORS.green,
      downColor: COLORS.red,
      borderUpColor: COLORS.green,
      borderDownColor: COLORS.red,
      wickUpColor: COLORS.green,
      wickDownColor: COLORS.red,
      lineColor: COLORS.cyan,
      topColor: 'rgba(6, 182, 212, 0.35)',
      bottomColor: 'rgba(6, 182, 212, 0.02)',
    } as never);
    candleRef.current = candleSeries as ISeriesApi<'Candlestick'>;
    if (chartType === 'candles') candleSeries.setData(candles);
    else candleSeries.setData(candles.map((candle) => ({ time: candle.time, value: candle.close })));
    createSeriesMarkers(candleSeries, markerData);

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeries.setData(candles.map((candle) => ({ time: candle.time, value: candle.volume ?? 0, color: candle.close >= candle.open ? 'rgba(16,185,129,.45)' : 'rgba(239,68,68,.45)' })));
    }
    if (showSma) {
      const series = chart.addSeries(LineSeries, { color: COLORS.amber, lineWidth: 2, title: 'SMA 20' });
      series.setData(sma(candles, 20));
    }
    if (showEma) {
      const series = chart.addSeries(LineSeries, { color: COLORS.cyan, lineWidth: 2, title: 'EMA 21' });
      series.setData(ema(candles, 21));
    }
    if (showBollinger) {
      const upper = chart.addSeries(LineSeries, { color: COLORS.purple, lineWidth: 1, title: 'BB upper' });
      const lower = chart.addSeries(LineSeries, { color: COLORS.purple, lineWidth: 1, title: 'BB lower' });
      const average = sma(candles, 20);
      upper.setData(average.map((item, index) => ({ time: item.time, value: item.value + 2 * (candles[index].high - candles[index].low) })));
      lower.setData(average.map((item, index) => ({ time: item.time, value: item.value - 2 * (candles[index].high - candles[index].low) })));
    }
    chart.subscribeCrosshairMove((param) => {
      const value = param.seriesData.get(candleSeries as never);
      if (value && 'open' in value) setHover(value as CandlePoint);
    });
    const resize = () => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 760 });
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    chart.timeScale().fitContent();
    return () => { observer.disconnect(); chart.remove(); chartRef.current = null; };
  }, [candles, chartType, markerData, showBollinger, showEma, showSma, showVolume]);

  const measuredChange = measurement ? measurement.end.price - measurement.start.price : null;
  const measuredReturn = measurement ? measuredChange! / measurement.start.price : null;
  const measuredDays = measurement ? Math.round((Number(measurement.end.time) - Number(measurement.start.time)) / 86400) : null;

  return (
    <section className="card" style={{ minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="card-title">Aegis Research Chart / {assetName}</div>
          <strong className="card-value" style={{ fontSize: 24 }}>
            {hover ? `$${formatFigure(hover.close)}` : candles.length ? `$${formatFigure(candles.at(-1)!.close)}` : 'No market data'}
          </strong>
          {hover && <div className="font-mono" style={{ color: COLORS.text, fontSize: 11 }}>O {formatFigure(hover.open)} H {formatFigure(hover.high)} L {formatFigure(hover.low)} C {formatFigure(hover.close)} · V {hover.volume == null ? 'Unavailable' : formatFigure(hover.volume)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['1D', '1W', '1M'] as const).map((item) => <button key={item} className={`btn ${range === item ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRange(item)}>{item}</button>)}
          <select className="btn btn-secondary" value={chartType} onChange={(event) => setChartType(event.target.value as typeof chartType)}><option value="candles">Candles</option><option value="line">Line</option><option value="area">Area</option></select>
          <button className={`btn ${showVolume ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowVolume((value) => !value)}>Volume</button>
          <button className={`btn ${showSma ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowSma((value) => !value)}>SMA</button>
          <button className={`btn ${showEma ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowEma((value) => !value)}>EMA</button>
          <button className={`btn ${showBollinger ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowBollinger((value) => !value)}>BOLL</button>
          <button className={`btn ${measurementStart ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMeasurementStart(null); setMeasurement(null); }}>Ruler</button>
        </div>
      </div>
      <div ref={containerRef} style={{ width: '100%', minHeight: 430 }} onClick={(event) => {
        if (!chartRef.current || candles.length === 0) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = event.clientX - rect.left;
        const time = chartRef.current.timeScale().coordinateToTime(x);
        if (time === null) return;
        const price = candleRef.current?.coordinateToPrice(event.clientY - rect.top);
        if (price === null || price === undefined) return;
        const point = { time: time as UTCTimestamp, price: Number(price) };
        if (!measurementStart) setMeasurementStart(point); else { setMeasurement({ start: measurementStart, end: point }); setMeasurementStart(null); }
      }} />
      {measurement && <div className="font-mono" style={{ padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontSize: 11 }}><strong>MEASUREMENT</strong> · Change {formatSignedFigure(measuredChange!)} · Return {formatPercent(measuredReturn!)} · Duration {measuredDays} calendar days</div>}
      {measurementStart && <div className="font-mono" style={{ color: COLORS.amber, fontSize: 11 }}>Ruler start selected. Click an end point on the chart.</div>}
    </section>
  );
}
