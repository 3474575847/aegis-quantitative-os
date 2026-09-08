'use client';

import React from 'react';
import {
  ChartType,
  DrawingType,
  IndicatorConfig,
  IndicatorId,
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
  indicators: Record<IndicatorId, IndicatorConfig>;
  showSignals: boolean;
  showEvents: boolean;
  showBacktests: boolean;
  onTimeframeChange: (tf: Timeframe) => void;
  onRangeChange: (r: RangeShortcut) => void;
  onChartTypeChange: (ct: ChartType) => void;
  onToggleVolume: () => void;
  onSelectDrawingTool: (tool: DrawingType) => void;
  onToggleIndicator: (id: IndicatorId) => void;
  onToggleSignals: () => void;
  onToggleEvents: () => void;
  onToggleBacktests: () => void;
  onResetDrawings: () => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const RANGES: RangeShortcut[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'];

export default function ChartToolbar({
  symbol,
  timeframe,
  range,
  chartType,
  showVolume,
  activeDrawingTool,
  indicators,
  showSignals,
  showEvents,
  showBacktests,
  onTimeframeChange,
  onRangeChange,
  onChartTypeChange,
  onToggleVolume,
  onSelectDrawingTool,
  onToggleIndicator,
  onToggleSignals,
  onToggleEvents,
  onToggleBacktests,
  onResetDrawings,
}: Props) {
  const [showIndicatorMenu, setShowIndicatorMenu] = React.useState(false);
  const [showDrawMenu, setShowDrawMenu] = React.useState(false);

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
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDrawMenu((prev) => !prev)}
            style={{
              background: activeDrawingTool !== 'cursor' ? 'rgba(0, 229, 255, 0.15)' : '#121824',
              color: activeDrawingTool !== 'cursor' ? '#00e5ff' : '#f8fafc',
              border: `1px solid ${activeDrawingTool !== 'cursor' ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            Tool: {activeDrawingTool.toUpperCase()} ▼
          </button>
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
                minWidth: 160,
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
              }}
            >
              {[
                { id: 'cursor', label: 'Cursor (Select)' },
                { id: 'ruler', label: 'Measurement / Ruler' },
                { id: 'trendline', label: 'Trendline' },
                { id: 'horizontalLine', label: 'Horizontal Line' },
                { id: 'verticalLine', label: 'Vertical Line' },
                { id: 'ray', label: 'Ray Line' },
                { id: 'rectangle', label: 'Rectangle Box' },
                { id: 'arrow', label: 'Arrow' },
                { id: 'text', label: 'Text Annotation' },
                { id: 'fibonacci', label: 'Fibonacci Retracements' },
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
                    background: activeDrawingTool === tool.id ? 'rgba(0,229,255,0.15)' : 'transparent',
                    color: activeDrawingTool === tool.id ? '#00e5ff' : '#f8fafc',
                  }}
                >
                  {tool.label}
                </div>
              ))}
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
                }}
              >
                Clear All Drawings
              </button>
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
