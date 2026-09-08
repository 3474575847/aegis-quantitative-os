'use client';

import React from 'react';
import {
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import ChartHeader from './ChartHeader';
import ChartToolbar from './ChartToolbar';
import DrawingOverlayCanvas from './DrawingOverlayCanvas';
import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateMomentum,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateVWAP,
} from './indicators/calculations';
import {
  AegisEventOverlay,
  AegisSignalOverlay,
  BacktestTradeOverlay,
  Candle,
  ChartDatapoint,
  ChartState,
  ChartType,
  Drawing,
  DrawingType,
  IndicatorConfig,
  IndicatorId,
  MeasurementResult,
  RangeShortcut,
  Timeframe,
} from './types';

interface Props {
  symbol?: string;
  data?: ChartDatapoint[];
  signals?: AegisSignalOverlay[];
  events?: AegisEventOverlay[];
  backtests?: BacktestTradeOverlay[];
  providerStatus?: { isFallback: boolean; reason: string | null; source: string | null };
  onTimeframeChange?: (tf: Timeframe) => void;
  onRangeChange?: (range: RangeShortcut) => void;
}

const DEFAULT_INDICATORS: Record<IndicatorId, IndicatorConfig> = {
  sma: { id: 'sma', enabled: false, params: { period: 20 }, color: '#f59e0b' },
  ema: { id: 'ema', enabled: false, params: { period: 21 }, color: '#00e5ff' },
  vwap: { id: 'vwap', enabled: false, params: {}, color: '#10b981' },
  bollinger: { id: 'bollinger', enabled: false, params: { period: 20, stdDev: 2 }, color: '#8b5cf6' },
  rsi: { id: 'rsi', enabled: false, params: { period: 14 }, color: '#00e5ff' },
  macd: { id: 'macd', enabled: false, params: { fast: 12, slow: 26, signal: 9 } },
  atr: { id: 'atr', enabled: false, params: { period: 14 }, color: '#f59e0b' },
  momentum: { id: 'momentum', enabled: false, params: { period: 10 }, color: '#10b981' },
  stochastic: { id: 'stochastic', enabled: false, params: { k: 14, d: 3 } },
};

export default function AegisChart({
  symbol = 'BTC/USD',
  data = [],
  signals = [],
  events = [],
  backtests = [],
  providerStatus,
  onTimeframeChange,
  onRangeChange,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const mainSeriesRef = React.useRef<ISeriesApi<any> | null>(null);

  // State management
  const [chartState, setChartState] = React.useState<ChartState>({
    symbol,
    timeframe: '5m',
    range: '1D',
    chartType: 'candles',
    showVolume: true,
    activeDrawingTool: 'cursor',
    drawings: [],
    selectedDrawingId: null,
    measurements: [],
    indicators: DEFAULT_INDICATORS,
    showSignals: true,
    showEvents: true,
    showBacktests: true,
  });

  const [hoverCandle, setHoverCandle] = React.useState<Candle | null>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 480 });

  // Convert raw API data into clean Candles
  const candles = React.useMemo<Candle[]>(() => {
    const deduped = new Map<number, Candle>();
    data.forEach((p) => {
      const time = p.time ?? Math.floor(Date.parse(p.timestamp) / 1000);
      const open = p.open ?? p.price;
      const high = p.high ?? p.price;
      const low = p.low ?? p.price;
      const close = p.close ?? p.price;
      if (!time || isNaN(time) || ![open, high, low, close].every(Number.isFinite)) return;
      deduped.set(time, {
        time,
        open,
        high,
        low,
        close,
        volume: p.volume,
        sentimentZ: p.sentimentZ,
        eventTitle: p.eventTitle,
      });
    });
    return [...deduped.values()].sort((a, b) => a.time - b.time);
  }, [data]);

  // Main Lightweight-Charts initialization
  React.useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#080a0f' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.08)', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 480,
    });
    chartRef.current = chart;

    // Series type selection
    let series: ISeriesApi<any>;
    if (chartState.chartType === 'line') {
      series = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2 });
      series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    } else if (chartState.chartType === 'area') {
      series = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2 });
      series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    } else {
      series = chart.addSeries({
        type: 'Candlestick',
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      } as never);
      series.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }
    mainSeriesRef.current = series;

    // Volume histogram
    if (chartState.showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        }))
      );
    }

    // Render Overlays (SMA, EMA, VWAP, Bollinger)
    if (chartState.indicators.sma.enabled) {
      const smaData = calculateSMA(candles, chartState.indicators.sma.params.period ?? 20);
      const s = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, title: 'SMA 20' });
      s.setData(smaData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }
    if (chartState.indicators.ema.enabled) {
      const emaData = calculateEMA(candles, chartState.indicators.ema.params.period ?? 21);
      const s = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2, title: 'EMA 21' });
      s.setData(emaData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }
    if (chartState.indicators.vwap.enabled) {
      const vwapData = calculateVWAP(candles);
      const s = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 2, title: 'VWAP' });
      s.setData(vwapData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }
    if (chartState.indicators.bollinger.enabled) {
      const { upper, middle, lower } = calculateBollingerBands(
        candles,
        chartState.indicators.bollinger.params.period ?? 20
      );
      const u = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, title: 'BB Upper' });
      const m = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, title: 'BB Mid' });
      const l = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, title: 'BB Lower' });
      u.setData(upper.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      m.setData(middle.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      l.setData(lower.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }

    // Render Separate Panes (RSI, MACD, ATR, Momentum, Stochastic)
    if (chartState.indicators.rsi.enabled) {
      const rsiData = calculateRSI(candles, chartState.indicators.rsi.params.period ?? 14);
      const rsiSeries = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2, title: 'RSI 14' });
      rsiSeries.setData(rsiData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }
    if (chartState.indicators.macd.enabled) {
      const { macdLine, signalLine } = calculateMACD(candles);
      const mSeries = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2, title: 'MACD' });
      const sSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, title: 'Signal' });
      mSeries.setData(macdLine.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      sSeries.setData(signalLine.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }

    // Hover crosshair sync
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverCandle(null);
        return;
      }
      const t = typeof param.time === 'number' ? param.time : Number(param.time);
      const match = candles.find((c) => c.time === t);
      if (match) setHoverCandle(match);
    });

    // Resize observer
    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = 480;
        setDimensions({ width: w, height: h });
        chart.applyOptions({ width: w, height: h });
      }
    };
    handleResize();

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    chart.timeScale().fitContent();

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, chartState.chartType, chartState.showVolume, chartState.indicators]);

  // Coordinate Converters for Canvas Overlays
  const timeToX = React.useCallback(
    (time: number) => {
      if (!chartRef.current) return null;
      return chartRef.current.timeScale().timeToCoordinate(time as UTCTimestamp);
    },
    [chartRef]
  );

  const priceToY = React.useCallback(
    (price: number) => {
      if (!mainSeriesRef.current) return null;
      return mainSeriesRef.current.priceToCoordinate(price);
    },
    [mainSeriesRef]
  );

  const xToTime = React.useCallback(
    (x: number) => {
      if (!chartRef.current) return null;
      const t = chartRef.current.timeScale().coordinateToTime(x);
      return t ? Number(t) : null;
    },
    [chartRef]
  );

  const yToPrice = React.useCallback(
    (y: number) => {
      if (!mainSeriesRef.current) return null;
      const p = mainSeriesRef.current.coordinateToPrice(y);
      return p ? Number(p) : null;
    },
    [mainSeriesRef]
  );

  return (
    <div
      style={{
        width: '100%',
        background: '#080a0f',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* 1. Header */}
      <ChartHeader
        symbol={symbol}
        candles={candles}
        hoverCandle={hoverCandle}
        providerStatus={providerStatus}
      />

      {/* 2. Toolbar */}
      <ChartToolbar
        symbol={symbol}
        timeframe={chartState.timeframe}
        range={chartState.range}
        chartType={chartState.chartType}
        showVolume={chartState.showVolume}
        activeDrawingTool={chartState.activeDrawingTool}
        indicators={chartState.indicators}
        showSignals={chartState.showSignals}
        showEvents={chartState.showEvents}
        showBacktests={chartState.showBacktests}
        onTimeframeChange={(tf) => {
          setChartState((s) => ({ ...s, timeframe: tf }));
          onTimeframeChange?.(tf);
        }}
        onRangeChange={(r) => {
          setChartState((s) => ({ ...s, range: r }));
          onRangeChange?.(r);
        }}
        onChartTypeChange={(ct) => setChartState((s) => ({ ...s, chartType: ct }))}
        onToggleVolume={() => setChartState((s) => ({ ...s, showVolume: !s.showVolume }))}
        onSelectDrawingTool={(tool) => setChartState((s) => ({ ...s, activeDrawingTool: tool }))}
        onToggleIndicator={(id) =>
          setChartState((s) => ({
            ...s,
            indicators: {
              ...s.indicators,
              [id]: { ...s.indicators[id], enabled: !s.indicators[id].enabled },
            },
          }))
        }
        onToggleSignals={() => setChartState((s) => ({ ...s, showSignals: !s.showSignals }))}
        onToggleEvents={() => setChartState((s) => ({ ...s, showEvents: !s.showEvents }))}
        onToggleBacktests={() => setChartState((s) => ({ ...s, showBacktests: !s.showBacktests }))}
        onResetDrawings={() => setChartState((s) => ({ ...s, drawings: [], measurements: [] }))}
      />

      {/* 3. Main Chart & Overlay Container */}
      <div style={{ position: 'relative', width: '100%', height: 480 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        <DrawingOverlayCanvas
          width={dimensions.width}
          height={dimensions.height}
          activeDrawingTool={chartState.activeDrawingTool}
          drawings={chartState.drawings}
          measurements={chartState.measurements}
          signals={signals}
          events={events}
          backtests={backtests}
          showSignals={chartState.showSignals}
          showEvents={chartState.showEvents}
          showBacktests={chartState.showBacktests}
          timeToX={timeToX}
          priceToY={priceToY}
          xToTime={xToTime}
          yToPrice={yToPrice}
          onAddDrawing={(drawing: Drawing) =>
            setChartState((s) => ({ ...s, drawings: [...s.drawings, drawing] }))
          }
          onAddMeasurement={(m: MeasurementResult) =>
            setChartState((s) => ({ ...s, measurements: [...s.measurements, m] }))
          }
          onRemoveDrawing={(id: string) =>
            setChartState((s) => ({ ...s, drawings: s.drawings.filter((d) => d.id !== id) }))
          }
          onRemoveMeasurement={(id: string) =>
            setChartState((s) => ({ ...s, measurements: s.measurements.filter((m) => m.id !== id) }))
          }
        />
      </div>
    </div>
  );
}
