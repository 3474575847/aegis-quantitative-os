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
  { id: '#e3b341', label: 'Gold' },
  { id: '#3fb950', label: 'Green' },
  { id: '#f85149', label: 'Red' },
  { id: '#58a6ff', label: 'Blue' },
  { id: '#bc8cff', label: 'Purple' },
  { id: '#ffffff', label: 'White' },
];

export default function ChartToolbar({
  symbol,
  timeframe,
  range,
  chartType,
  showVolume,
  activeDrawingTool,
  drawingColor = '#e3b341',
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
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0e1117] border-b border-[#1b2230] text-[11px] font-mono text-[#8b949e] flex-wrap">
      {/* Timeframe Selector (Compact Segmented Control) */}
      <div className="flex items-center gap-1">
        <span className="font-bold text-[#e6edf3] mr-1.5 text-xs">{symbol}</span>
        <div className="flex items-center bg-[#131722] border border-[#1f2633] rounded-[2px] p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-1.5 py-0.5 rounded-[1px] transition-colors ${
                timeframe === tf
                  ? 'bg-[#1e2638] text-[#e6edf3] font-bold border border-[#2f3b52]'
                  : 'text-[#7d8590] hover:text-[#c9d1d9] border border-transparent'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Range Shortcuts */}
      <div className="hidden md:flex items-center gap-1 bg-[#131722] border border-[#1f2633] rounded-[2px] p-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className={`px-1.5 py-0.5 rounded-[1px] transition-colors ${
              range === r
                ? 'bg-[#1e2638] text-[#e6edf3] font-bold border border-[#2f3b52]'
                : 'text-[#586069] hover:text-[#c9d1d9] border border-transparent'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chart Controls & Overlays */}
      <div className="flex items-center gap-1.5 relative">
        {/* Chart Type Selector */}
        <select
          value={chartType}
          onChange={(e) => onChartTypeChange(e.target.value as ChartType)}
          className="bg-[#131722] text-[#c9d1d9] border border-[#1f2633] rounded-[2px] px-2 py-1 text-[11px] outline-none hover:border-[#2f3b52] cursor-pointer"
        >
          <option value="candles">Candles</option>
          <option value="ohlc">OHLC</option>
          <option value="line">Line</option>
          <option value="area">Area</option>
        </select>

        {/* Volume Toggle */}
        <button
          onClick={onToggleVolume}
          className={`px-2 py-1 rounded-[2px] border transition-colors ${
            showVolume
              ? 'bg-[#162a1e] text-[#3fb950] border-[#234b30] font-semibold'
              : 'bg-[#131722] text-[#7d8590] border-[#1f2633] hover:border-[#2f3b52]'
          }`}
        >
          VOL
        </button>

        {/* Indicators Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowIndicatorMenu((prev) => !prev)}
            className="px-2 py-1 bg-[#131722] text-[#c9d1d9] border border-[#1f2633] hover:border-[#2f3b52] rounded-[2px] cursor-pointer"
          >
            Indicators ▾
          </button>
          {showIndicatorMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#131722] border border-[#2b3548] rounded-[3px] p-2.5 z-50 min-w-[160px] shadow-2xl">
              <div className="text-[10px] uppercase font-bold text-[#586069] mb-1.5 tracking-wider">
                Trend Overlays
              </div>
              {(['sma', 'ema', 'vwap', 'bollinger'] as IndicatorId[]).map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-2 py-1 cursor-pointer text-[#8b949e] hover:text-[#e6edf3]"
                >
                  <input
                    type="checkbox"
                    checked={indicators[id]?.enabled ?? false}
                    onChange={() => onToggleIndicator(id)}
                    className="accent-[#d29922]"
                  />
                  <span className="uppercase text-[11px]">{id}</span>
                </label>
              ))}
              <div className="text-[10px] uppercase font-bold text-[#586069] mt-2 mb-1.5 tracking-wider border-t border-[#1f2633] pt-1.5">
                Oscillators
              </div>
              {(['rsi', 'macd', 'atr', 'momentum', 'stochastic'] as IndicatorId[]).map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-2 py-1 cursor-pointer text-[#8b949e] hover:text-[#e6edf3]"
                >
                  <input
                    type="checkbox"
                    checked={indicators[id]?.enabled ?? false}
                    onChange={() => onToggleIndicator(id)}
                    className="accent-[#d29922]"
                  />
                  <span className="uppercase text-[11px]">{id}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Drawings Dropdown */}
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setShowDrawMenu((prev) => !prev)}
            className={`px-2 py-1 rounded-[2px] border transition-colors flex items-center gap-1.5 ${
              activeDrawingTool !== 'cursor'
                ? 'bg-[#1b2538] text-[#e6edf3] border-[#384869]'
                : 'bg-[#131722] text-[#c9d1d9] border-[#1f2633] hover:border-[#2f3b52]'
            }`}
          >
            <span>Draw: {activeDrawingTool.toUpperCase()}</span>
            {activeDrawingsCount > 0 && (
              <span className="bg-[#d29922] text-[#080a0d] text-[9px] font-bold px-1 rounded-[1px] leading-3">
                {activeDrawingsCount}
              </span>
            )}
            <span>▾</span>
          </button>

          {activeDrawingsCount > 0 && (
            <button
              onClick={onResetDrawings}
              title="Clear all drawings"
              className="px-1.5 py-1 bg-[#28161a] text-[#f85149] border border-[#482025] hover:bg-[#34181d] rounded-[2px] text-[10px]"
            >
              Clear
            </button>
          )}

          {showDrawMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#131722] border border-[#2b3548] rounded-[3px] p-2 z-50 min-w-[200px] max-h-[360px] overflow-y-auto shadow-2xl">
              <div className="text-[10px] font-bold text-[#586069] uppercase mb-1 tracking-wider px-1">
                Navigation
              </div>
              {[
                { id: 'cursor', label: 'Cursor (Pan & Zoom)' },
                { id: 'select', label: 'Select / Edit' },
              ].map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => {
                    onSelectDrawingTool(tool.id as DrawingType);
                    setShowDrawMenu(false);
                  }}
                  className={`px-2 py-1 rounded-[2px] cursor-pointer text-[11px] ${
                    activeDrawingTool === tool.id
                      ? 'bg-[#1e2638] text-[#e6edf3] font-semibold'
                      : 'text-[#8b949e] hover:bg-[#1a202c] hover:text-[#e6edf3]'
                  }`}
                >
                  {tool.label}
                </div>
              ))}

              <div className="text-[10px] font-bold text-[#586069] uppercase mt-2 mb-1 tracking-wider px-1 border-t border-[#1f2633] pt-1.5">
                Technical Tools
              </div>
              {[
                { id: 'trendline', label: 'Trendline' },
                { id: 'horizontalLine', label: 'Horizontal Line' },
                { id: 'verticalLine', label: 'Vertical Line' },
                { id: 'ray', label: 'Ray Line' },
                { id: 'rectangle', label: 'Rectangle Box' },
                { id: 'arrow', label: 'Arrow' },
                { id: 'fibonacci', label: 'Fibonacci Retracement' },
                { id: 'ruler', label: 'Measurement Ruler' },
                { id: 'text', label: 'Text Note' },
              ].map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => {
                    onSelectDrawingTool(tool.id as DrawingType);
                    setShowDrawMenu(false);
                  }}
                  className={`px-2 py-1 rounded-[2px] cursor-pointer text-[11px] ${
                    activeDrawingTool === tool.id
                      ? 'bg-[#1e2638] text-[#e6edf3] font-semibold'
                      : 'text-[#8b949e] hover:bg-[#1a202c] hover:text-[#e6edf3]'
                  }`}
                >
                  {tool.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Intelligence Overlays (Segmented group) */}
        <div className="flex items-center bg-[#131722] border border-[#1f2633] rounded-[2px] p-0.5">
          <button
            onClick={onToggleSignals}
            className={`px-2 py-0.5 rounded-[1px] transition-colors font-semibold ${
              showSignals
                ? 'bg-[#1b2538] text-[#3fb950] border border-[#2f3b52]'
                : 'text-[#7d8590] hover:text-[#c9d1d9] border border-transparent'
            }`}
          >
            Signals
          </button>
          <button
            onClick={onToggleEvents}
            className={`px-2 py-0.5 rounded-[1px] transition-colors font-semibold ${
              showEvents
                ? 'bg-[#1b2538] text-[#d29922] border border-[#2f3b52]'
                : 'text-[#7d8590] hover:text-[#c9d1d9] border border-transparent'
            }`}
          >
            Events
          </button>
          <button
            onClick={onToggleBacktests}
            className={`px-2 py-0.5 rounded-[1px] transition-colors font-semibold ${
              showBacktests
                ? 'bg-[#1b2538] text-[#bc8cff] border border-[#2f3b52]'
                : 'text-[#7d8590] hover:text-[#c9d1d9] border border-transparent'
            }`}
          >
            Trades
          </button>
        </div>
      </div>
    </div>
  );
}
