'use client';

import React from 'react';
import AegisChart from './charts/AegisChart/AegisChart';
import {
  AegisEventOverlay,
  AegisSignalOverlay,
  BacktestTradeOverlay,
  ChartDatapoint,
  RangeShortcut,
  Timeframe,
} from './charts/AegisChart/types';

export * from './charts/AegisChart/types';
export type { AegisSignalOverlay as ChartSignal } from './charts/AegisChart/types';

interface BackwardCompatibleProps {
  symbol?: string;
  assetName?: string;
  data?: ChartDatapoint[];
  signals?: AegisSignalOverlay[];
  events?: AegisEventOverlay[];
  backtests?: BacktestTradeOverlay[];
  providerStatus?: { isFallback: boolean; reason: string | null; source: string | null };
  onTimeframeChange?: (tf: Timeframe) => void;
  onRangeChange?: (range: RangeShortcut) => void;
}

export default function SentimentPriceChart({
  symbol,
  assetName,
  data = [],
  signals = [],
  events = [],
  backtests = [],
  providerStatus,
  onTimeframeChange,
  onRangeChange,
}: BackwardCompatibleProps) {
  const displaySymbol = symbol ?? assetName ?? 'BTC/USD';
  return (
    <AegisChart
      symbol={displaySymbol}
      data={data}
      signals={signals}
      events={events}
      backtests={backtests}
      providerStatus={providerStatus}
      onTimeframeChange={onTimeframeChange}
      onRangeChange={onRangeChange}
    />
  );
}
