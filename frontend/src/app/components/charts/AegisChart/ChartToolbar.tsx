'use client';

import React from 'react';
import {
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
  symbol: string;
  timeframe: Timeframe;
  range: RangeShortcut;
  chartType: ChartType;
  showVolume: boolean;
  activeDrawingTool: DrawingType;
  drawingColor?: string;
  drawingLineWidth?: number;
  activeDrawingsCount?: number;
  drawings?: Drawing[];
  measurements?: MeasurementResult[];
  selectedDrawingId?: string | null;
  indicators: Record<IndicatorId, IndicatorConfig>;
  showSignals: boolean;
  showEvents: boolean;
  showBacktests: boolean;
  onTimeframeChange: (tf: Timeframe) => void;
  onRangeChange: (r: RangeShortcut) => void;
  onChartTypeChange: (ct: ChartType) => void;
  onToggleVolume: () => void;
  onSelectDrawingTool: (tool: DrawingType) => void;
  onDrawingColorChange?: (color: string) => void;
  onDrawingLineWidthChange?: (width: number) => void;
  onSelectDrawing?: (id: string | null) => void;
  onRemoveDrawing?: (id: string) => void;
  onRemoveMeasurement?: (id: string) => void;
  onToggleIndicator: (id: IndicatorId) => void;
  onToggleSignals: () => void;
  onToggleEvents: () => void;
  onToggleBacktests: () => void;
  onResetDrawings: () => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const RANGES: RangeShortcut[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'];
const INK_COLORS = [
  { id: '#00e5ff', label: 'Cyan' },
  { id: '#f59e0b', label: 'Gold' },
  { id: '#10b981', label: 'Green' },
  { id: '#f43f5e', label: 'Rose' },
  { id: '#a855f7', label: 'Purple' },
  { id: '#eab308', label: 'Yellow' },
  { id: '#ffffff', label: 'White' },
];

export default function ChartToolbar({
  symbol,
  timeframe,
  range,
  chartType,
  showVolume,
  activeDrawingTool,
  drawingColor = '#00e5ff',
  drawingLineWidth = 2,
  activeDrawingsCount = 0,
  drawings = [],
  measurements = [],
  selectedDrawingId = null,
  indicators,
  showSignals,
  showEvents,
  showBacktests,
  onTimeframeChange,
  onRangeChange,
  onChartTypeChange,
  onToggleVolume,
  onSelectDrawingTool,
  onDrawingColorChange,
  onDrawingLineWidthChange,
  onSelectDrawing,
  onRemoveDrawing,
  onRemoveMeasurement,
  onToggleIndicator,
  onToggleSignals,
  onToggleEvents,
  onToggleBacktests,
  onResetDrawings,
}: Props) {
  const [showIndicatorMenu, setShowIndicatorMenu] = React.useState(false);
  const [showDrawMenu, setShowDrawMenu] = React.useState(false);
  const [showColorMenu, setShowColorMenu] = React.useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        background: '#0d121c',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: 12,
        fontFamily: 'var(--font-mono, monospace)',
        color: '#94a3b8',
        flexWrap: 'wrap',
      }}
    >
      {/* Timeframe selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, color: '#f8fafc', marginRight: 6 }}>{symbol}</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            style={{
              background: timeframe === tf ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
              color: timeframe === tf ? '#00e5ff' : '#94a3b8',
              border: `1px solid ${timeframe === tf ? 'rgba(0, 229, 255, 0.4)' : 'transparent'}`,
              borderRadius: 4,
              padding: '2px 6px',
              cursor: 'pointer',
              fontWeight: timeframe === tf ? 600 : 400,
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Range shortcuts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            style={{
              background: range === r ? '#1e293b' : 'transparent',
              color: range === r ? '#f8fafc' : '#64748b',
              border: 'none',
              borderRadius: 3,
              padding: '2px 5px',
              cursor: 'pointer',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart Type, Volume, Indicators, Drawings, Aegis Intelligence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {/* Chart Type */}
        <select
          value={chartType}
          onChange={(e) => onChartTypeChange(e.target.value as ChartType)}
          style={{
            background: '#121824',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="candles">Candles</option>
          <option value="ohlc">OHLC Bars</option>
          <option value="line">Line</option>
          <option value="area">Area</option>
        </select>

        {/* Volume toggle */}
        <button
          onClick={onToggleVolume}
          style={{
            background: showVolume ? 'rgba(16, 185, 129, 0.15)' : '#121824',
            color: showVolume ? '#10b981' : '#94a3b8',
            border: `1px solid ${showVolume ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Vol
        </button>

        {/* Indicators Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowIndicatorMenu((prev) => !prev)}
            style={{
              background: '#121824',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            Indicators ▼
          </button>
          {showIndicatorMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#121824',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 6,
                padding: 8,
                zIndex: 100,
                minWidth: 160,
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>
                Overlays
              </div>
              {(['sma', 'ema', 'vwap', 'bollinger'] as IndicatorId[]).map((id) => (
                <label
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 0',
                    cursor: 'pointer',
                    color: indicators[id]?.enabled ? '#00e5ff' : '#94a3b8',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={indicators[id]?.enabled ?? false}
                    onChange={() => onToggleIndicator(id)}
                  />
                  {id.toUpperCase()}
                </label>
              ))}
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', marginTop: 8, marginBottom: 4 }}>
                Panes
              </div>
              {(['rsi', 'macd', 'atr', 'momentum', 'stochastic'] as IndicatorId[]).map((id) => (
                <label
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 0',
                    cursor: 'pointer',
                    color: indicators[id]?.enabled ? '#00e5ff' : '#94a3b8',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={indicators[id]?.enabled ?? false}
                    onChange={() => onToggleIndicator(id)}
                  />
                  {id.toUpperCase()}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Drawings Dropdown */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setShowDrawMenu((prev) => !prev)}
            style={{
              background: activeDrawingTool !== 'cursor' ? 'rgba(0, 229, 255, 0.15)' : '#121824',
              color: activeDrawingTool !== 'cursor' ? '#00e5ff' : '#f8fafc',
              border: `1px solid ${activeDrawingTool !== 'cursor' ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>Tool: {activeDrawingTool.toUpperCase()}</span>
            {activeDrawingsCount > 0 && (
              <span
                style={{
                  background: '#00e5ff',
                  color: '#080a0f',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 8,
                  padding: '0 5px',
                  lineHeight: '14px',
                }}
              >
                {activeDrawingsCount}
              </span>
            )}
            <span>▼</span>
          </button>
          {activeDrawingsCount > 0 && (
            <button
              onClick={onResetDrawings}
              title="Clear all active drawings from chart"
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#f43f5e',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Clear ({activeDrawingsCount})
            </button>
          )}
          {showDrawMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#121824',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 6,
                padding: 8,
                zIndex: 100,
                minWidth: 220,
                maxHeight: 380,
                overflowY: 'auto',
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 4 }}>
                Modes
              </div>
              {[
                { id: 'cursor', label: '✋ Cursor (Pan & Zoom Chart)' },
                { id: 'select', label: '↖ Select / Edit Drawings' },
              ].map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => {
                    onSelectDrawingTool(tool.id as DrawingType);
                    setShowDrawMenu(false);
                  }}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    background: activeDrawingTool === tool.id ? 'rgba(0,229,255,0.15)' : 'transparent',
                    color: activeDrawingTool === tool.id ? '#00e5ff' : '#f8fafc',
                    fontWeight: activeDrawingTool === tool.id ? 600 : 400,
                  }}
                >
                  {tool.label}
                </div>
              ))}

              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', margin: '8px 0 4px', paddingLeft: 4 }}>
                Drawing Tools
              </div>
              {[
                { id: 'trendline', label: '╱ Trendline' },
                { id: 'horizontalLine', label: '― Horizontal Line' },
                { id: 'verticalLine', label: '┆ Vertical Line' },
                { id: 'ray', label: '↗ Ray Line' },
                { id: 'rectangle', label: '▭ Rectangle Box' },
                { id: 'arrow', label: '➔ Arrow' },
                { id: 'fibonacci', label: '☰ Fibonacci Retracement' },
                { id: 'ruler', label: '⤢ Ruler / Measurement' },
                { id: 'text', label: '🗎 Text Annotation' },
              ].map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => {
                    onSelectDrawingTool(tool.id as DrawingType);
                    setShowDrawMenu(false);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    background: activeDrawingTool === tool.id ? 'rgba(0,229,255,0.15)' : 'transparent',
                    color: activeDrawingTool === tool.id ? '#00e5ff' : '#f8fafc',
                  }}
                >
                  {tool.label}
                </div>
              ))}

              {(drawings.length > 0 || measurements.length > 0) && (
                <>
                  <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, paddingLeft: 4 }}>
                    Active Drawings ({drawings.length + measurements.length})
                  </div>
                  {drawings.map((d, idx) => (
                    <div
                      key={d.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: selectedDrawingId === d.id ? 'rgba(0,229,255,0.2)' : 'transparent',
                      }}
                    >
                      <span
                        onClick={() => {
                          onSelectDrawingTool('select');
                          onSelectDrawing?.(d.id);
                          setShowDrawMenu(false);
                        }}
                        style={{ cursor: 'pointer', color: d.style?.color ?? '#00e5ff', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.style?.color ?? '#00e5ff', display: 'inline-block' }} />
                        {d.type.charAt(0).toUpperCase() + d.type.slice(1)} #{idx + 1}
                      </span>
                      <button
                        onClick={() => onRemoveDrawing?.(d.id)}
                        title="Delete drawing"
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {measurements.map((m, idx) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: selectedDrawingId === m.id ? 'rgba(0,229,255,0.2)' : 'transparent',
                      }}
                    >
                      <span
                        onClick={() => {
                          onSelectDrawingTool('select');
                          onSelectDrawing?.(m.id);
                          setShowDrawMenu(false);
                        }}
                        style={{ cursor: 'pointer', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
                        Ruler #{idx + 1}
                      </span>
                      <button
                        onClick={() => onRemoveMeasurement?.(m.id)}
                        title="Delete measurement"
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </>
              )}

              <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
              <button
                onClick={() => {
                  onResetDrawings();
                  setShowDrawMenu(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  color: '#f43f5e',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Clear All Drawings
              </button>
            </div>
          )}
        </div>

        {/* Ink Color & Stroke Width Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowColorMenu((prev) => !prev)}
            title="Choose Ink Color and Stroke Width"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#121824',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: drawingColor,
                boxShadow: `0 0 6px ${drawingColor}`,
              }}
            />
            <span>Ink: {drawingLineWidth}px</span>
            <span style={{ fontSize: 9 }}>▼</span>
          </button>
          {showColorMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#121824',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 6,
                padding: 10,
                zIndex: 100,
                minWidth: 170,
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                Ink Color
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                {INK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => {
                      onDrawingColorChange?.(c.id);
                    }}
                    style={{
                      height: 24,
                      borderRadius: 4,
                      background: c.id,
                      border: drawingColor === c.id ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: drawingColor === c.id ? `0 0 8px ${c.id}` : 'none',
                    }}
                  />
                ))}
              </div>

              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                Stroke Width
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    onClick={() => {
                      onDrawingLineWidthChange?.(w);
                      setShowColorMenu(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: drawingLineWidth === w ? 'rgba(0, 229, 255, 0.2)' : '#1a2234',
                      color: drawingLineWidth === w ? '#00e5ff' : '#94a3b8',
                      border: `1px solid ${drawingLineWidth === w ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                      fontSize: 11,
                    }}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Intelligence Overlays */}
        <button
          onClick={onToggleSignals}
          style={{
            background: showSignals ? 'rgba(16,185,129,0.15)' : '#121824',
            color: showSignals ? '#10b981' : '#64748b',
            border: `1px solid ${showSignals ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          Signals
        </button>
        <button
          onClick={onToggleEvents}
          style={{
            background: showEvents ? 'rgba(139,92,246,0.15)' : '#121824',
            color: showEvents ? '#8b5cf6' : '#64748b',
            border: `1px solid ${showEvents ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          Events
        </button>
        <button
          onClick={onToggleBacktests}
          style={{
            background: showBacktests ? 'rgba(245,158,11,0.15)' : '#121824',
            color: showBacktests ? '#f59e0b' : '#64748b',
            border: `1px solid ${showBacktests ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          Trades
        </button>
      </div>
    </div>
  );
}
