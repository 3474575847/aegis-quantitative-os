'use client';

import React from 'react';
import { formatFigure, formatPercent, formatSignedFigure } from '../../../../lib/api';
import { Candle } from './types';

interface Props {
  symbol: string;
  candles: Candle[];
  hoverCandle: Candle | null;
  providerStatus?: { isFallback: boolean; reason: string | null; source: string | null };
}

export default function ChartHeader({ symbol, candles, hoverCandle, providerStatus }: Props) {
  const current = hoverCandle ?? candles.at(-1) ?? null;
  const previous = candles.length > 1 ? candles.at(hoverCandle ? candles.indexOf(hoverCandle) - 1 : -2) : null;

  const price = current?.close ?? 0;
  const change = previous && current ? current.close - previous.close : 0;
  const pctChange = previous && previous.close > 0 ? change / previous.close : 0;

  return (
    <div className="flex items-center justify-between px-3.5 py-2 bg-[#0c0f15] border-b border-[#1b2230] flex-wrap gap-2 text-xs font-mono">
      {/* Symbol & Primary Price */}
      <div className="flex items-baseline gap-3">
        <span className="font-bold text-[#e6edf3] tracking-wide text-sm">
          {symbol}
        </span>
        {current ? (
          <>
            <span className="text-base font-bold text-[#e6edf3] tabular-nums">
              ${formatFigure(price)}
            </span>
            <span
              className={`text-xs font-semibold tabular-nums ${
                change >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
              }`}
            >
              {formatSignedFigure(change)} ({formatPercent(pctChange)})
            </span>
          </>
        ) : (
          <span className="text-xs text-[#586069]">No market data available</span>
        )}
      </div>

      {/* OHLCV Tabular Readout */}
      {current && (
        <div className="flex items-center gap-3.5 text-[11px] text-[#8b949e]">
          <div>
            <span className="text-[#586069]">O </span>
            <span className="text-[#e6edf3] tabular-nums">{formatFigure(current.open)}</span>
          </div>
          <div>
            <span className="text-[#586069]">H </span>
            <span className="text-[#e6edf3] tabular-nums">{formatFigure(current.high)}</span>
          </div>
          <div>
            <span className="text-[#586069]">L </span>
            <span className="text-[#e6edf3] tabular-nums">{formatFigure(current.low)}</span>
          </div>
          <div>
            <span className="text-[#586069]">C </span>
            <span className="text-[#e6edf3] tabular-nums">{formatFigure(current.close)}</span>
          </div>
          <div>
            <span className="text-[#586069]">Vol </span>
            <span className="text-[#e6edf3] tabular-nums">
              {current.volume != null ? formatFigure(current.volume) : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Provider Provenance (Unboxed or Micro-tag) */}
      {providerStatus && (
        <div className="flex items-center gap-1.5 text-[10px] text-[#7d8590]">
          <span
            className={`w-1.5 h-1.5 rounded-[1px] inline-block ${
              providerStatus.isFallback ? 'bg-[#d29922]' : 'bg-[#3fb950]'
            }`}
          />
          <span className="text-[#c9d1d9] font-semibold">
            {providerStatus.isFallback ? 'FALLBACK' : 'LIVE'}
          </span>
          <span>·</span>
          <span>{providerStatus.source ?? 'Verified'}</span>
        </div>
      )}
    </div>
  );
}
