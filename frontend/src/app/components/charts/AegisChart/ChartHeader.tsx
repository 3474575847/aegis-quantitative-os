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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: '#080a0f',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      {/* Symbol & Primary Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#f8fafc',
            fontFamily: 'var(--font-mono, monospace)',
            letterSpacing: '0.5px',
          }}
        >
          {symbol}
        </span>
        {current ? (
          <>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#f8fafc',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              ${formatFigure(price)}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font-mono, monospace)',
                color: change >= 0 ? '#10b981' : '#f43f5e',
              }}
            >
              {formatSignedFigure(change)} ({formatPercent(pctChange)})
            </span>
          </>
        ) : (
          <span style={{ fontSize: 14, color: '#64748b' }}>No market data available</span>
        )}
      </div>

      {/* OHLCV Readout */}
      {current && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#94a3b8',
          }}
        >
          <div>
            <span style={{ color: '#64748b' }}>O </span>
            <span style={{ color: '#f8fafc' }}>{formatFigure(current.open)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>H </span>
            <span style={{ color: '#f8fafc' }}>{formatFigure(current.high)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>L </span>
            <span style={{ color: '#f8fafc' }}>{formatFigure(current.low)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>C </span>
            <span style={{ color: '#f8fafc' }}>{formatFigure(current.close)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Vol </span>
            <span style={{ color: '#f8fafc' }}>
              {current.volume != null ? formatFigure(current.volume) : 'Unavailable'}
            </span>
          </div>
        </div>
      )}

      {/* Provider Provenance Badge */}
      {providerStatus && (
        <div
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono, monospace)',
            padding: '2px 8px',
            borderRadius: 4,
            background: providerStatus.isFallback ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            color: providerStatus.isFallback ? '#f59e0b' : '#10b981',
            border: `1px solid ${providerStatus.isFallback ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          }}
        >
          {providerStatus.isFallback
            ? `FALLBACK: ${providerStatus.source ?? 'Alternative'}`
            : `LIVE: ${providerStatus.source ?? 'Verified'}`}
        </div>
      )}
    </div>
  );
}
