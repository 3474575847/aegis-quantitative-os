'use client';

import React from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from 'lightweight-charts';
import ChartHeader from './ChartHeader';
import ChartToolbar from './ChartToolbar';
import DrawingOverlayCanvas from './DrawingOverlayCanvas';
import {
  calculateATR,
  calculateBollingerBands,
  calculateCSVD,
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
  csvd: { id: 'csvd', enabled: false, params: { halfLife: 48, window: 20 }, color: '#00e5ff' },
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
  const [redrawNonce, setRedrawNonce] = React.useState(0);
  const [drawingColor, setDrawingColor] = React.useState('#00e5ff');
  const [drawingLineWidth, setDrawingLineWidth] = React.useState(2);

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

  const isInitialMountRef = React.useRef(true);
  const indicatorSeriesMapRef = React.useRef<ISeriesApi<any>[]>([]);
  const volumeSeriesRef = React.useRef<ISeriesApi<any> | null>(null);
  const candlesRef = React.useRef<Candle[]>(candles);
  candlesRef.current = candles;

  // Apply time range window
  const applyTimeRange = React.useCallback((range: string) => {
    const chart = chartRef.current;
    const currentCandles = candlesRef.current;
    if (!chart || currentCandles.length === 0) return;

    if (range === 'ALL') {
      chart.timeScale().fitContent();
      return;
    }

    const lastCandle = currentCandles[currentCandles.length - 1];
    const lastTime = lastCandle.time;

    let seconds = 86400;
    if (range === '1D') seconds = 86400;
    else if (range === '1W') seconds = 7 * 86400;
    else if (range === '1M') seconds = 30 * 86400;
    else if (range === '1Y') seconds = 365 * 86400;

    const fromTime = Math.max(currentCandles[0].time, lastTime - seconds);
    try {
      chart.timeScale().setVisibleRange({
        from: fromTime as UTCTimestamp,
        to: lastTime as UTCTimestamp,
      });
    } catch {
      chart.timeScale().fitContent();
    }
  }, []);

  // Main Lightweight-Charts initialization (runs once on mount)
  React.useEffect(() => {
    if (!containerRef.current) return;

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

    // Hover crosshair sync
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverCandle(null);
        return;
      }
      const t = typeof param.time === 'number' ? param.time : Number(param.time);
      const match = candlesRef.current.find((c) => c.time === t);
      if (match) setHoverCandle(match);
    });

    // Subscribe to chart zoom & pan events to force overlay canvas redraw
    const handleViewportChange = () => {
      setRedrawNonce((n) => n + 1);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handleViewportChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleViewportChange);

    // Resize observer
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        const w = containerRef.current.clientWidth;
        const h = 480;
        setDimensions({ width: w, height: h });
        chartRef.current.applyOptions({ width: w, height: h });
      }
    };
    handleResize();

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesMapRef.current = [];
    };
  }, []);

  // Update Series data and Indicators on data/config change (preserves zoom level!)
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    // Save current zoom / viewport position
    const timeScale = chart.timeScale();
    const prevLogicalRange = timeScale.getVisibleLogicalRange();

    // Remove existing series
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current); } catch {}
      mainSeriesRef.current = null;
    }
    if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch {}
      volumeSeriesRef.current = null;
    }
    indicatorSeriesMapRef.current.forEach((s) => {
      try { chart.removeSeries(s); } catch {}
    });
    indicatorSeriesMapRef.current = [];

    // Main Series type selection
    let series: ISeriesApi<any>;
    if (chartState.chartType === 'line') {
      series = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2 });
      series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    } else if (chartState.chartType === 'area') {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#00e5ff',
        topColor: 'rgba(0, 229, 255, 0.35)',
        bottomColor: 'rgba(0, 229, 255, 0.02)',
        lineWidth: 2,
      });
      series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    } else if (chartState.chartType === 'ohlc') {
      series = chart.addSeries(BarSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
      });
      series.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      });
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
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume ?? 0,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        }))
      );
      volumeSeriesRef.current = volSeries;
    }

    // Render Overlays (SMA, EMA, VWAP, Bollinger)
    const newIndicatorSeries: ISeriesApi<any>[] = [];
    if (chartState.indicators.sma.enabled) {
      const smaData = calculateSMA(candles, chartState.indicators.sma.params.period ?? 20);
      const s = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, title: 'SMA 20' });
      s.setData(smaData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      newIndicatorSeries.push(s);
    }
    if (chartState.indicators.ema.enabled) {
      const emaData = calculateEMA(candles, chartState.indicators.ema.params.period ?? 21);
      const s = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 2, title: 'EMA 21' });
      s.setData(emaData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      newIndicatorSeries.push(s);
    }
    if (chartState.indicators.vwap.enabled) {
      const vwapData = calculateVWAP(candles);
      const s = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 2, title: 'VWAP' });
      s.setData(vwapData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      newIndicatorSeries.push(s);
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
      newIndicatorSeries.push(u, m, l);
    }

    // Separate Panes (RSI, MACD)
    if (chartState.indicators.rsi.enabled) {
      const rsiData = calculateRSI(candles, chartState.indicators.rsi.params.period ?? 14);
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#00e5ff',
        lineWidth: 2,
        title: 'RSI 14',
        priceScaleId: 'rsi',
      });
      rsiSeries.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0.05 } });
      rsiSeries.setData(rsiData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      newIndicatorSeries.push(rsiSeries);
    }
    if (chartState.indicators.macd.enabled) {
      const { macdLine, signalLine } = calculateMACD(candles);
      const mSeries = chart.addSeries(LineSeries, {
        color: '#00e5ff',
        lineWidth: 2,
        title: 'MACD',
        priceScaleId: 'macd',
      });
      const sSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        title: 'Signal',
        priceScaleId: 'macd',
      });
      mSeries.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0.05 } });
      mSeries.setData(macdLine.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      sSeries.setData(signalLine.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      newIndicatorSeries.push(mSeries, sSeries);
    }
    indicatorSeriesMapRef.current = newIndicatorSeries;

    // Restore visible range if user already had an active zoom/pan; otherwise fit initial
    if (isInitialMountRef.current) {
      timeScale.fitContent();
      isInitialMountRef.current = false;
    } else if (prevLogicalRange) {
      try {
        timeScale.setVisibleLogicalRange(prevLogicalRange);
      } catch {}
    }
  }, [candles, chartState.chartType, chartState.showVolume, chartState.indicators]);

  // Adjust scroll/pan options based on active drawing tool to prevent chart pan when drawing
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isCursor = chartState.activeDrawingTool === 'cursor';
    chart.applyOptions({
      handleScroll: {
        mouseWheel: isCursor,
        pressedMouseMove: isCursor,
        horzTouchDrag: isCursor,
        vertTouchDrag: isCursor,
      },
      handleScale: {
        axisPressedMouseMove: isCursor,
        mouseWheel: isCursor,
        pinch: isCursor,
      },
    });
  }, [chartState.activeDrawingTool]);

  // Robust Coordinate Converters for Canvas Overlays (Continuous Logical Mapping)
  const timeToX = React.useCallback(
    (time: number) => {
      const chart = chartRef.current;
      const currentCandles = candlesRef.current;
      if (!chart || currentCandles.length === 0) return null;

      const n = currentCandles.length;
      if (n === 1) {
        const c = chart.timeScale().logicalToCoordinate(0 as Logical);
        return c !== null ? Number(c) : null;
      }

      const tFirst = currentCandles[0].time;
      const tLast = currentCandles[n - 1].time;
      const avgSpan = (tLast - tFirst) / Math.max(1, n - 1);

      let logicalIndex = 0;
      if (time <= tFirst) {
        logicalIndex = avgSpan > 0 ? (time - tFirst) / avgSpan : 0;
      } else if (time >= tLast) {
        logicalIndex = avgSpan > 0 ? (n - 1) + (time - tLast) / avgSpan : n - 1;
      } else {
        let low = 0;
        let high = n - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          if (currentCandles[mid].time < time) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        const i0 = Math.max(0, low - 1);
        const i1 = Math.min(n - 1, i0 + 1);
        const t0 = currentCandles[i0].time;
        const t1 = currentCandles[i1].time;
        if (t1 > t0) {
          logicalIndex = i0 + (time - t0) / (t1 - t0);
        } else {
          logicalIndex = i0;
        }
      }

      const coord = chart.timeScale().logicalToCoordinate(logicalIndex as Logical);
      return coord !== null ? Number(coord) : null;
    },
    []
  );

  const priceToY = React.useCallback(
    (price: number) => {
      if (!mainSeriesRef.current) return null;
      const coord = mainSeriesRef.current.priceToCoordinate(price);
      return coord !== null ? Number(coord) : null;
    },
    []
  );

  const xToTime = React.useCallback(
    (x: number) => {
      const chart = chartRef.current;
      const currentCandles = candlesRef.current;
      if (!chart || currentCandles.length === 0) return null;

      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return null;

      const n = currentCandles.length;
      if (n === 1) return currentCandles[0].time;

      const idx = Number(logical);
      const tFirst = currentCandles[0].time;
      const tLast = currentCandles[n - 1].time;
      const avgSpan = (tLast - tFirst) / Math.max(1, n - 1);

      if (idx <= 0) {
        return Math.round(tFirst + idx * avgSpan);
      }
      if (idx >= n - 1) {
        return Math.round(tLast + (idx - (n - 1)) * avgSpan);
      }

      const i0 = Math.floor(idx);
      const frac = idx - i0;
      const t0 = currentCandles[i0].time;
      const t1 = currentCandles[i0 + 1].time;
      return Math.round(t0 + frac * (t1 - t0));
    },
    []
  );

  const yToPrice = React.useCallback(
    (y: number) => {
      if (!mainSeriesRef.current) return null;
      const p = mainSeriesRef.current.coordinateToPrice(y);
      return p !== null ? Number(p) : null;
    },
    []
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
        drawingColor={drawingColor}
        drawingLineWidth={drawingLineWidth}
        activeDrawingsCount={chartState.drawings.length + chartState.measurements.length}
        drawings={chartState.drawings}
        measurements={chartState.measurements}
        selectedDrawingId={chartState.selectedDrawingId}
        onSelectDrawing={(id) => setChartState((s) => ({ ...s, selectedDrawingId: id }))}
        onRemoveDrawing={(id) =>
          setChartState((s) => ({
            ...s,
            drawings: s.drawings.filter((d) => d.id !== id),
            selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
          }))
        }
        onRemoveMeasurement={(id) =>
          setChartState((s) => ({
            ...s,
            measurements: s.measurements.filter((m) => m.id !== id),
            selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
          }))
        }
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
          applyTimeRange(r);
          onRangeChange?.(r);
        }}
        onChartTypeChange={(ct) => setChartState((s) => ({ ...s, chartType: ct }))}
        onToggleVolume={() => setChartState((s) => ({ ...s, showVolume: !s.showVolume }))}
        onSelectDrawingTool={(tool) => setChartState((s) => ({ ...s, activeDrawingTool: tool }))}
        onDrawingColorChange={(c) => setDrawingColor(c)}
        onDrawingLineWidthChange={(w) => setDrawingLineWidth(w)}
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
        onResetDrawings={() => setChartState((s) => ({ ...s, drawings: [], measurements: [], selectedDrawingId: null }))}
      />

      {/* 3. Main Chart & Overlay Container */}
      <div style={{ position: 'relative', width: '100%', height: 480, overflow: 'hidden' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />

        {/* Floating Action Bar for Selected Drawing */}
        {chartState.selectedDrawingId && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 30,
              background: '#121824',
              border: '1px solid rgba(0, 229, 255, 0.5)',
              borderRadius: 8,
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
              fontSize: 12,
              color: '#f8fafc',
            }}
          >
            <span style={{ color: '#00e5ff', fontWeight: 600, fontSize: 11 }}>
              {chartState.drawings.find((d) => d.id === chartState.selectedDrawingId)?.type.toUpperCase() ||
                (chartState.measurements.some((m) => m.id === chartState.selectedDrawingId) ? 'RULER' : 'DRAWING')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {['#00e5ff', '#f59e0b', '#10b981', '#f43f5e', '#a855f7', '#ffffff'].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setChartState((s) => ({
                      ...s,
                      drawings: s.drawings.map((d) =>
                        d.id === s.selectedDrawingId
                          ? { ...d, style: { ...d.style, color: c, fillColor: `${c}22` } }
                          : d
                      ),
                    }));
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: c,
                    border: '1px solid rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  onClick={() => {
                    setChartState((s) => ({
                      ...s,
                      drawings: s.drawings.map((d) =>
                        d.id === s.selectedDrawingId
                          ? { ...d, style: { ...d.style, lineWidth: w } }
                          : d
                      ),
                    }));
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#f8fafc',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  {w}px
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const selId = chartState.selectedDrawingId;
                if (!selId) return;
                setChartState((s) => ({
                  ...s,
                  drawings: s.drawings.filter((d) => d.id !== selId),
                  measurements: s.measurements.filter((m) => m.id !== selId),
                  selectedDrawingId: null,
                }));
              }}
              title="Delete this drawing"
              style={{
                background: 'rgba(244, 63, 94, 0.2)',
                color: '#f43f5e',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setChartState((s) => ({ ...s, selectedDrawingId: null }))}
              title="Deselect drawing"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#f8fafc',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        )}

        <DrawingOverlayCanvas
          width={dimensions.width}
          height={dimensions.height}
          activeDrawingTool={chartState.activeDrawingTool}
          drawingColor={drawingColor}
          drawingLineWidth={drawingLineWidth}
          drawings={chartState.drawings}
          measurements={chartState.measurements}
          selectedDrawingId={chartState.selectedDrawingId}
          signals={signals}
          events={events}
          backtests={backtests}
          showSignals={chartState.showSignals}
          showEvents={chartState.showEvents}
          showBacktests={chartState.showBacktests}
          redrawKey={redrawNonce}
          timeToX={timeToX}
          priceToY={priceToY}
          xToTime={xToTime}
          yToPrice={yToPrice}
          onAddDrawing={(drawing: Drawing) =>
            setChartState((s) => ({
              ...s,
              drawings: [...s.drawings, drawing],
              selectedDrawingId: null,
            }))
          }
          onUpdateDrawing={(drawing: Drawing) =>
            setChartState((s) => ({
              ...s,
              drawings: s.drawings.map((d) => (d.id === drawing.id ? drawing : d)),
            }))
          }
          onAddMeasurement={(m: MeasurementResult) =>
            setChartState((s) => ({
              ...s,
              measurements: [...s.measurements, m],
              selectedDrawingId: null,
            }))
          }
          onUpdateMeasurement={(m: MeasurementResult) =>
            setChartState((s) => ({
              ...s,
              measurements: s.measurements.map((item) => (item.id === m.id ? m : item)),
            }))
          }
          onRemoveDrawing={(id: string) =>
            setChartState((s) => ({
              ...s,
              drawings: s.drawings.filter((d) => d.id !== id),
              selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
            }))
          }
          onRemoveMeasurement={(id: string) =>
            setChartState((s) => ({
              ...s,
              measurements: s.measurements.filter((m) => m.id !== id),
              selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
            }))
          }
          onSelectDrawing={(id: string | null) =>
            setChartState((s) => ({ ...s, selectedDrawingId: id }))
          }
          onReturnToCursor={() =>
            setChartState((s) => ({ ...s, activeDrawingTool: 'select' }))
          }
        />
      </div>
    </div>
  );
}
