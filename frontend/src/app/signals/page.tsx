"use client";

import React, { useEffect, useRef, useState } from "react";
import SentimentPriceChart, { ChartDatapoint, AegisSignalOverlay } from "../components/SentimentPriceChart";
import { apiUrl, formatFigure, formatSignedFigure } from '@/lib/api';
import { SearchIcon, RefreshIcon, LayersIcon } from '../components/icons';
import AlphaGauge from '../components/visuals/AlphaGauge';
import FactorAttributionChart from '../components/visuals/FactorAttributionChart';
import FactorCorrelationMatrix from '../components/visuals/FactorCorrelationMatrix';

interface SignalItem {
  id: string;
  name: string;
  version: string;
  parameters: Record<string, any>;
  created_at: string;
  latest_value: number | null;
  latest_timestamp: string | null;
}

interface SignalHistory {
  signal_id: string;
  name: string;
  datapoints: Array<{ timestamp: string; value: number; metadata: any }>;
}

interface TickerQuote {
  symbol: string;
  price: number;
  asset_class: string;
  exchange: string;
  timestamp: string;
  z_score_signal: number;
  is_fallback?: boolean;
  fallback_reason?: string | null;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<SignalItem | null>(null);
  const [history, setHistory] = useState<SignalHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Asset Lookup & Reactive Chart State
  const [symbolInput, setSymbolInput] = useState("BTC");
  const symbolRef = useRef("BTC");
  const [activeQuote, setActiveQuote] = useState<TickerQuote | null>(null);
  const [tickerHistory, setTickerHistory] = useState<ChartDatapoint[]>([]);
  const [chartSignals, setChartSignals] = useState<AegisSignalOverlay[]>([]);
  const [a3Evaluation, setA3Evaluation] = useState<any | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetchSignals();
    selectTicker("BTC");
    const refreshTimer = window.setInterval(() => selectTicker(symbolRef.current), 15_000);
    return () => window.clearInterval(refreshTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await fetchWithRetry(apiUrl("/api/signals"));
      if (res.ok) {
        const data = await res.json();
        setSignals(data);
        if (data.length > 0) {
          selectSignal(data[0]);
        }
      } else {
        setApiError(`Signal catalog returned ${res.status}`);
      }
    } catch (e) {
      setApiError("Cannot reach signals API service.");
      console.error("Error fetching signals", e);
    } finally {
      setLoading(false);
    }
  };

  const selectSignal = async (sig: SignalItem) => {
    setSelectedSignal(sig);
    try {
      const res = await fetchWithRetry(apiUrl(`/api/signals/${sig.id}/history?limit=60`));
      if (res.ok) {
        const histData = await res.json();
        setHistory(histData);
      }
    } catch (e) {
      console.error("Error fetching signal history", e);
    }
  };

  const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        return res;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw new Error("Max retries exceeded");
  };

  const selectTicker = async (sym: string) => {
    const cleanSym = sym.toUpperCase().trim();
    if (!cleanSym) return;
    symbolRef.current = cleanSym;
    setSymbolInput(cleanSym);
    setQuoteLoading(true);
    try {
      const resQuote = await fetchWithRetry(apiUrl(`/api/market/ticker/${cleanSym}`));
      if (resQuote.ok) {
        const q = await resQuote.json();
        setActiveQuote(q);
      }

      const resHist = await fetchWithRetry(apiUrl(`/api/market/ticker/${cleanSym}/history`));
      if (resHist.ok) {
        const hist = await resHist.json();
        const rawPoints = Array.isArray(hist) ? hist : (hist?.datapoints || []);
        if (Array.isArray(rawPoints) && rawPoints.length > 0) {
          const mapped: ChartDatapoint[] = rawPoints.map((item: any) => ({
            timestamp: item.timestamp,
            time: item.time,
            open: Number(item.open ?? item.price),
            high: Number(item.high ?? item.price),
            low: Number(item.low ?? item.price),
            close: Number(item.close ?? item.price),
            price: Number(item.price ?? item.close),
            volume: Number(item.volume ?? 0),
            sentimentZ: Number(item.sentimentZ ?? 0),
            sentiment_score: Number(item.sentiment_score ?? item.sentimentZ ?? 0),
          }));
          setTickerHistory(mapped);
        }
      }

      const resSig = await fetchWithRetry(apiUrl(`/api/signals/a3/${cleanSym}`));
      if (resSig.ok) {
        const evalData = await resSig.json();
        setA3Evaluation(evalData);
        const overlays = evalData.signal_overlays || evalData.historical_signal_overlays || [];
        if (Array.isArray(overlays)) {
          setChartSignals(overlays);
        } else {
          setChartSignals([]);
        }
      }
    } catch (err) {
      console.error(`Failed to refresh market data for ${cleanSym}`, err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    selectTicker(symbolInput);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-10">
      {/* Header Telemetry Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#1b2230]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-[1px] bg-[#d29922]" />
            <h1 className="text-base font-bold tracking-tight text-[#e6edf3] font-mono">
              Signal Engine
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Point-in-time factor attribution, calibrated weights, and asset-class applicability
          </p>
        </div>

        {/* Quick Symbol Switcher & Input */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#090c10] border border-[#1b2230] rounded-[2px] p-0.5">
            {["BTC", "ETH", "NVDA", "AAPL"].map((sym) => (
              <button
                key={sym}
                onClick={() => selectTicker(sym)}
                className={`px-2 py-0.5 text-xs font-mono rounded-[1px] transition-colors ${
                  activeQuote?.symbol === sym
                    ? "bg-[#1b2230] text-[#e6edf3] font-bold border border-[#2f3b52]"
                    : "text-[#7d8590] hover:text-[#e6edf3] border border-transparent"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center">
            <div className="relative flex items-center">
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="SYMBOL"
                className="w-24 px-2 py-1 bg-[#10141d] border border-[#1b2230] focus:border-[#d29922] text-xs font-mono text-[#e6edf3] outline-none rounded-[2px]"
              />
              <button
                type="submit"
                disabled={quoteLoading}
                className="px-2 py-1 bg-[#161c28] hover:bg-[#1f283b] text-[#8b949e] hover:text-[#e6edf3] border border-l-0 border-[#1b2230] rounded-r-[2px] text-xs"
              >
                <SearchIcon size={12} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {apiError && (
        <div className="px-3 py-2 bg-[#28161a] border border-[#482025] text-[#f85149] text-xs font-mono rounded-[2px]">
          Warning: {apiError}
        </div>
      )}

      {/* Primary Telemetry: Asset Snapshot */}
      {activeQuote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#10141d] border border-[#1b2230] p-3.5 rounded-[2px]">
          <div className="flex flex-col justify-between">
            <span className="metric-label">Asset / Class</span>
            <span className="text-base font-bold font-mono text-[#e6edf3] mt-1">
              {activeQuote.symbol} · <span className="text-xs text-[#8b949e]">{activeQuote.asset_class}</span>
            </span>
            <span className="text-[11px] text-[#586069] font-mono mt-1">Feed: {activeQuote.exchange}</span>
          </div>

          <div className="flex flex-col justify-between">
            <span className="metric-label">Live Spot Price</span>
            <span className="text-base font-bold font-mono text-[#e6edf3] tabular-nums mt-1">
              ${formatFigure(activeQuote.price)}
            </span>
            <span className="text-[11px] text-[#3fb950] font-mono mt-1">Stream active</span>
          </div>

          <div className="flex flex-col justify-between">
            <span className="metric-label">Quant Momentum Score</span>
            <span className={`text-base font-bold font-mono tabular-nums mt-1 ${
              activeQuote.z_score_signal >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
            }`}>
              {formatSignedFigure(activeQuote.z_score_signal)} σ
            </span>
            <span className="text-[11px] text-[#8b949e] font-mono mt-1">
              {activeQuote.z_score_signal > 0.3 ? "Bullish momentum" : activeQuote.z_score_signal < -0.3 ? "Bearish momentum" : "Neutral bias"}
            </span>
          </div>

          <div className="flex flex-col justify-between">
            <span className="metric-label">Provenance Status</span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeQuote.is_fallback ? "bg-[#d29922]" : "bg-[#3fb950]"
                }`}
              />
              <span className="text-xs font-mono font-semibold text-[#c9d1d9]">
                {activeQuote.is_fallback ? "Fallback Cache" : "Live Feed"}
              </span>
            </div>
            <span className="text-[11px] text-[#586069] font-mono mt-1">
              Verified {new Date(activeQuote.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* A³ Live Quantitative Intelligence Panel */}
      {a3Evaluation && (
        <div className="panel overflow-hidden">
          {/* Signal Telemetry Header Bar */}
          <div className="panel-header">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="panel-title flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d29922]" />
                A³ Systematic Alpha Engine
              </span>
              <div className="flex items-center gap-2 text-xs font-mono text-[#8b949e]">
                <span>Model: {a3Evaluation.model_version}</span>
                <span>·</span>
                <span>Horizon: {a3Evaluation.signal_horizon}</span>
              </div>
            </div>

            {/* Signal Action Telemetry Indicator */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-[#8b949e]">Signal:</span>
              <span
                className={`px-2 py-0.5 rounded-[2px] font-bold text-xs border ${
                  a3Evaluation.signal_action === "BUY"
                    ? "bg-[#132d20] text-[#3fb950] border-[#235338]"
                    : a3Evaluation.signal_action === "SELL"
                    ? "bg-[#33181c] text-[#f85149] border-[#552329]"
                    : "bg-[#252015] text-[#d29922] border-[#44381e]"
                }`}
              >
                {a3Evaluation.signal_action === "BUY" ? "LONG" : a3Evaluation.signal_action === "SELL" ? "SHORT" : "HOLD"}
              </span>
              <span className="text-[#586069]">·</span>
              <span className="text-[#8b949e]">Next-bar execution</span>
            </div>
          </div>

          {/* Quantitative Metrics & Alpha Gauge */}
          <div className="p-4 flex flex-col gap-4">
            <AlphaGauge
              score={a3Evaluation.calibrated_aegis_score}
              conviction={
                a3Evaluation.uncertainty_pct
                  ? Math.max(0.25, Math.min(0.95, 1 - a3Evaluation.uncertainty_pct / 8))
                  : 0.76
              }
              action={a3Evaluation.signal_action}
              hurdleRate={0.15}
              expectedReturn={a3Evaluation.expected_excess_return_pct / 100}
            />

            {/* Quantitative Evidence & Drivers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px]">
                <div className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Primary Alpha Driver</span>
                  <span className="text-[#e6edf3] font-mono font-bold">{a3Evaluation.primary_driver}</span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-[#8b949e]">
                  {a3Evaluation.supporting_evidence.map((ev: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-[#3fb950] font-mono font-bold">+</span>
                      <span>{ev}</span>
                    </div>
                  ))}
                  {a3Evaluation.contradicting_evidence.map((ev: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-[#586069]">
                      <span className="text-[#f85149] font-mono font-bold">-</span>
                      <span>{ev}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#10141d] border border-[#1b2230] p-3 rounded-[2px] flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
                    Calibration & Guardrails
                  </div>
                  <div className="text-xs text-[#8b949e] leading-relaxed">
                    Ridge-GAM empirical weighting applied over walk-forward point-in-time regimes without forward lookahead bias.
                  </div>
                </div>
                <div className="pt-2.5 mt-2 border-t border-[#1b2230] flex items-center justify-between text-xs font-mono text-[#8b949e]">
                  <div>
                    <span className="text-[#586069]">Quality Gates: </span>
                    <span className="text-[#e6edf3] font-semibold">{a3Evaluation.quality_gates.gate_summary}</span>
                  </div>
                  <div>
                    <span className="text-[#586069]">OOS Health: </span>
                    <span className="text-[#3fb950] font-semibold">{a3Evaluation.oos_model_health}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reactive Dual-Axis Chart with Buy/Sell Overlays */}
      <SentimentPriceChart
        data={tickerHistory}
        signals={chartSignals}
        assetName={activeQuote?.symbol || symbolInput}
      />

      {/* FACTOR ATTRIBUTION WATERFALL */}
      {a3Evaluation?.factor_contributions && (
        <FactorAttributionChart
          factors={a3Evaluation.factor_contributions.map((fc: any) => ({
            factor_name: fc.factor_id,
            weight: Number(fc.learned_beta ?? 0.2),
            z_score: Number(fc.z_score ?? (fc.net_contribution / 5)),
            contribution_bps: Number(fc.net_contribution * 100),
          }))}
        />
      )}

      {/* FACTOR MATRIX: Institutional Research Table */}
      {a3Evaluation?.factor_contributions && (
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title flex items-center gap-2">
              <LayersIcon size={14} className="text-[#d29922]" />
              Factor Attribution Matrix & Applicability
            </span>
            <span className="text-xs font-mono text-[#8b949e]">
              Asset: {activeQuote?.symbol}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Factor ID</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Execution Role</th>
                  <th className="text-right">Learned Weight (β)</th>
                  <th className="text-right">Net Contribution</th>
                  <th>Causal Provenance</th>
                </tr>
              </thead>
              <tbody>
                {a3Evaluation.factor_contributions.map((fc: any, idx: number) => {
                  const isNotApp = fc.status === "NOT_APPLICABLE";
                  const isCausal = fc.is_causal;

                  return (
                    <tr key={idx} className={isNotApp ? "opacity-40" : ""}>
                      <td className="font-mono font-bold text-[#e6edf3] text-xs">
                        {fc.factor_id}
                      </td>
                      <td className="text-xs text-[#8b949e]">
                        {fc.factor_id.includes("rsi") || fc.factor_id.includes("ema") || fc.factor_id.includes("momentum")
                          ? "Technical"
                          : fc.factor_id.includes("eps") || fc.factor_id.includes("roe") || fc.factor_id.includes("pe_ratio")
                          ? "Fundamental"
                          : fc.factor_id.includes("sentiment")
                          ? "Sentiment"
                          : "Microstructure"}
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 text-xs font-mono">
                          <span className={`w-1.5 h-1.5 rounded-full ${isNotApp ? "bg-[#586069]" : "bg-[#3fb950]"}`} />
                          <span className={isNotApp ? "text-[#7d8590]" : "text-[#c9d1d9]"}>
                            {isNotApp ? `N/A (${activeQuote?.symbol})` : "Active"}
                          </span>
                        </span>
                      </td>
                      <td>
                        {isNotApp ? (
                          <span className="text-xs text-[#586069] font-mono">Suppressed (β=0)</span>
                        ) : isCausal ? (
                          <span className="text-xs font-mono text-[#3fb950] font-semibold">Causal Executable</span>
                        ) : (
                          <span className="text-xs font-mono text-[#8b949e]">Diagnostic Only</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-xs">
                        {isNotApp ? "0.000" : Number(fc.learned_beta ?? 0).toFixed(3)}
                      </td>
                      <td className={`text-right font-mono tabular-nums font-semibold text-xs ${
                        isNotApp
                          ? "text-[#586069]"
                          : fc.net_contribution > 0
                          ? "text-[#3fb950]"
                          : fc.net_contribution < 0
                          ? "text-[#f85149]"
                          : "text-[#8b949e]"
                      }`}>
                        {isNotApp ? "0.00%" : `${formatSignedFigure(fc.net_contribution)}%`}
                      </td>
                      <td className="text-xs text-[#7d8590] font-mono">
                        {isNotApp
                          ? "Crypto invariant: Fundamental equity metrics disallowed"
                          : isCausal
                          ? "Directly feeds position sizing vector"
                          : "Informational layer only — does not execute trades"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FACTOR CROSS-CORRELATION MATRIX HEATMAP */}
      <FactorCorrelationMatrix />

      {/* Factor Catalog & Historical Inspect */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Catalog List */}
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">Catalog Factors</span>
            <span className="text-xs font-mono text-[#8b949e]">
              Total: {signals.length}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>Factor Name</th>
                  <th>Version</th>
                  <th className="text-right">Latest Value</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-[#586069] text-xs">
                      Loading factor models...
                    </td>
                  </tr>
                ) : (
                  signals.map((sig) => {
                    const isSelected = selectedSignal?.id === sig.id;
                    return (
                      <tr
                        key={sig.id}
                        onClick={() => selectSignal(sig)}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-[#192231]/80" : "hover:bg-[#121722]"}`}
                      >
                        <td className="font-semibold text-[#e6edf3] text-xs">{sig.name}</td>
                        <td className="text-[#8b949e] font-mono text-xs">{sig.version}</td>
                        <td className="text-[#3fb950] font-semibold tabular-nums text-xs text-right">
                          {sig.latest_value != null ? formatFigure(sig.latest_value) : "—"}
                        </td>
                        <td className="text-xs text-[#586069] font-mono">
                          {sig.latest_timestamp ? new Date(sig.latest_timestamp).toLocaleTimeString() : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Factor Details */}
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <span className="panel-title">
              Factor Details: {selectedSignal?.name ?? "None"}
            </span>
            <span className="text-xs font-mono text-[#8b949e]">
              ID: {selectedSignal?.id ?? "—"}
            </span>
          </div>
          <div className="p-3.5 text-xs font-mono flex flex-col gap-3">
            {selectedSignal ? (
              <>
                <div className="grid grid-cols-2 gap-3 bg-[#10141d] p-3 rounded-[2px] border border-[#1b2230]">
                  <div>
                    <span className="metric-label">Version</span>
                    <div className="text-[#e6edf3] font-bold text-sm mt-0.5">{selectedSignal.version}</div>
                  </div>
                  <div>
                    <span className="metric-label">Last Observation</span>
                    <div className="text-[#3fb950] font-bold text-sm tabular-nums mt-0.5">
                      {selectedSignal.latest_value != null ? formatFigure(selectedSignal.latest_value) : "N/A"}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="metric-label block mb-1.5">Parameters</span>
                  <pre className="bg-[#090c10] p-2.5 rounded-[2px] border border-[#1b2230] text-xs text-[#8b949e] overflow-x-auto leading-relaxed">
                    {JSON.stringify(selectedSignal.parameters, null, 2)}
                  </pre>
                </div>

                {history && history.datapoints.length > 0 && (
                  <div>
                    <span className="metric-label block mb-1.5">
                      Point-in-Time Observations ({history.datapoints.length} points)
                    </span>
                    <div className="max-h-28 overflow-y-auto border border-[#1b2230] rounded-[2px]">
                      <table className="terminal-table">
                        <tbody>
                          {history.datapoints.slice(0, 10).map((dp, i) => (
                            <tr key={i}>
                              <td className="text-xs text-[#586069] font-mono">
                                {new Date(dp.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="text-right text-[#e6edf3] tabular-nums font-semibold text-xs">
                                {formatFigure(dp.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-[#586069]">Select a factor to inspect</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
