import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketTickerHistory } from '@/server/market';
import { aegisStore } from '@/server/store';
import { evaluateA3AdaptiveAlpha } from '@/server/a3Engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cleanSymbol = (searchParams.get('symbol') || 'BTC').toUpperCase().trim();

    const history = await fetchMarketTickerHistory(cleanSymbol);
    const candles = history.datapoints;
    const newsClusters = aegisStore.getLatestNews(100);

    const evaluation = evaluateA3AdaptiveAlpha(cleanSymbol, candles, newsClusters);

    // Compute point-in-time signal overlays across historical candles for chart display
    const signalOverlays = [];
    let curPos = 0.0;
    let entryBar = 0;
    let trailingStop = 0.0;

    for (let i = 0; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      const ev = evaluateA3AdaptiveAlpha(cleanSymbol, slice, newsClusters, undefined, undefined, {
        position: curPos,
        entryBar,
        trailingStop,
        currentBarIdx: i,
      });

      const prevPos = curPos;
      curPos = ev.recommended_position ?? 0.0;
      if (ev.active_trailing_stop !== undefined) trailingStop = ev.active_trailing_stop;

      if (curPos !== prevPos && curPos !== 0.0) {
        entryBar = i;
        const c = candles[i];
        signalOverlays.push({
          id: `sig-${c.time}-${i}`,
          action: curPos > 0 ? 'BUY' : 'SELL',
          confidence: Math.min(1.0, Math.max(0.5, (Math.abs(ev.calibrated_aegis_score) / 3.0) * 0.5 + 0.5)),
          rationale: `${ev.signal_action}: ${ev.primary_driver || 'A³ Adaptive Alpha Multi-Factor Entry'}`,
          market_timestamp: new Date(c.time * 1000).toISOString(),
          score: ev.calibrated_aegis_score,
          headline: `A³ ${curPos > 0 ? 'BUY' : 'SELL'} Signal @ ${c.close.toFixed(2)}`,
        });
      }
    }

    return NextResponse.json({
      ...evaluation,
      signal_overlays: signalOverlays,
      historical_signal_overlays: signalOverlays,
    });
  } catch (error: any) {
    console.error('Error computing A3 signal evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate signal', detail: error?.message },
      { status: 500 }
    );
  }
}
