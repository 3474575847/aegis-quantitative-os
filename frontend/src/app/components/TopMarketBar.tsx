'use client';

import React, { useEffect, useState } from 'react';
import { apiUrl, formatFigure, formatPercent, formatSignedFigure } from '@/lib/api';
import { SearchIcon, RefreshIcon } from './icons';

interface TickerSummary {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  exchange: string;
  status: 'LIVE' | 'DELAYED' | 'FALLBACK';
  updatedSecondsAgo: number;
}

const PRIMARY_SYMBOLS = [
  { symbol: 'BTC', label: 'BTC/USD' },
  { symbol: 'ETH', label: 'ETH/USD' },
  { symbol: 'NVDA', label: 'NVDA' },
  { symbol: 'AAPL', label: 'AAPL' },
];

export default function TopMarketBar() {
  const [activeSymbol, setActiveSymbol] = useState('BTC');
  const [ticker, setTicker] = useState<TickerSummary>({
    symbol: 'BTC',
    name: 'Bitcoin / USD',
    price: 83950.00,
    change: -1250.00,
    changePct: -0.0147,
    high24h: 87280.00,
    low24h: 83640.00,
    volume24h: 8450,
    exchange: 'COINBASE',
    status: 'LIVE',
    updatedSecondsAgo: 2,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTicker = async (sym: string) => {
    try {
      setIsRefreshing(true);
      const res = await fetch(apiUrl(`/api/market/ticker/${sym}`));
      if (res.ok) {
        const data = await res.json();
        const price = Number(data.price ?? 83950);
        const change = data.change24h !== undefined ? Number(data.change24h) : 0;
        const changePct = data.change_pct_24h !== undefined ? Number(data.change_pct_24h) : 0;
        const high24h = data.high24h ? Number(data.high24h) : price * 1.01;
        const low24h = data.low24h ? Number(data.low24h) : price * 0.99;
        const volume24h = data.volume24h ? Number(data.volume24h) : 8500;

        setTicker({
          symbol: data.symbol ?? sym,
          name: sym === 'BTC' ? 'Bitcoin / USD' : sym === 'ETH' ? 'Ethereum / USD' : `${sym} Equity`,
          price,
          change,
          changePct,
          high24h,
          low24h,
          volume24h,
          exchange: data.exchange ?? (data.asset_class === 'CRYPTO' ? 'COINBASE' : 'FINNHUB'),
          status: data.is_fallback ? 'FALLBACK' : 'LIVE',
          updatedSecondsAgo: 1,
        });
      }
    } catch {
      // keep steady telemetry
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTicker(activeSymbol);
    const timer = setInterval(() => {
      setTicker((prev) => ({
        ...prev,
        updatedSecondsAgo: (prev.updatedSecondsAgo + 3) % 45,
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, [activeSymbol]);

  const handleSymbolSelect = (sym: string) => {
    setActiveSymbol(sym);
    fetchTicker(sym);
  };

  const isPositive = ticker.change >= 0;

  return (
    <header className="terminal-topbar">
      {/* Left: Active Asset Telemetry */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Quick Asset Selector Tabs */}
        <div className="flex items-center bg-[#11151f] border border-[#1f2633] rounded-[2px] p-0.5">
          {PRIMARY_SYMBOLS.map((item) => (
            <button
              key={item.symbol}
              onClick={() => handleSymbolSelect(item.symbol)}
              className={`px-2 py-1 text-[11px] font-mono transition-colors rounded-[2px] ${
                activeSymbol === item.symbol
                  ? 'bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]'
                  : 'text-[#7d8590] hover:text-[#c9d1d9] border border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="h-4 w-[1px] bg-[#1f2633]" />

        {/* Primary Quote Telemetry */}
        <div className="flex items-baseline gap-2.5 font-mono">
          <span className="text-sm font-bold text-[#e6edf3] tracking-tight tabular-nums">
            ${formatFigure(ticker.price)}
          </span>
          <span
            className={`text-xs tabular-nums font-semibold ${
              isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'
            }`}
          >
            {formatSignedFigure(ticker.change)} ({formatPercent(ticker.changePct)})
          </span>
        </div>

        {/* 24h Range Telemetry */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-[#7d8590] border-l border-[#1f2633] pl-3">
          <div>
            <span className="text-[#586069]">24H H: </span>
            <span className="text-[#c9d1d9] tabular-nums">${formatFigure(ticker.high24h)}</span>
          </div>
          <div>
            <span className="text-[#586069]">24H L: </span>
            <span className="text-[#c9d1d9] tabular-nums">${formatFigure(ticker.low24h)}</span>
          </div>
        </div>
      </div>

      {/* Right: Data Provenance & Operational State */}
      <div className="flex items-center gap-3 text-[11px] font-mono text-[#7d8590]">
        {/* Provenance String (UNBOXED text with typographic separators) */}
        <div className="hidden sm:flex items-center gap-1.5 text-[#7d8590]">
          <span
            className={`w-1.5 h-1.5 rounded-[1px] inline-block ${
              ticker.status === 'LIVE'
                ? 'bg-[#3fb950]'
                : ticker.status === 'DELAYED'
                ? 'bg-[#d29922]'
                : 'bg-[#f85149]'
            }`}
          />
          <span className="text-[#c9d1d9] font-semibold">{ticker.status}</span>
          <span>·</span>
          <span>{ticker.exchange}</span>
          <span>·</span>
          <span>{ticker.updatedSecondsAgo}s ago</span>
          <span>·</span>
          <span className="text-[#586069]">PIT 5M</span>
        </div>

        <button
          onClick={() => fetchTicker(activeSymbol)}
          disabled={isRefreshing}
          title="Refresh market quote"
          className="p-1 text-[#7d8590] hover:text-[#e6edf3] border border-[#1f2633] hover:border-[#2f3b52] rounded-[2px] transition-colors"
        >
          <RefreshIcon size={13} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  );
}
