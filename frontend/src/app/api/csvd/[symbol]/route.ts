import { NextResponse } from 'next/server';
import { computeCSVDSeries, DEFAULT_CSVD_PARAMS } from '@/server/csvd';
import { fetchMarketTickerHistory } from '@/server/market';
import { aegisStore } from '@/server/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol is required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const halfLifeHours = Number(searchParams.get('halfLifeHours')) || DEFAULT_CSVD_PARAMS.halfLifeHours;
  const velocityFastSpan = Number(searchParams.get('velocityFastSpan')) || DEFAULT_CSVD_PARAMS.velocityFastSpan;
  const velocitySlowSpan = Number(searchParams.get('velocitySlowSpan')) || DEFAULT_CSVD_PARAMS.velocitySlowSpan;
  const divergenceZWindow = Number(searchParams.get('divergenceZWindow')) || DEFAULT_CSVD_PARAMS.divergenceZWindow;
  const divergenceThreshold = Number(searchParams.get('divergenceThreshold')) || DEFAULT_CSVD_PARAMS.divergenceThreshold;
  const minCorroboration = Number(searchParams.get('minCorroboration')) || DEFAULT_CSVD_PARAMS.minCorroboration;

  const sym = symbol.toUpperCase().trim();
  const history = await fetchMarketTickerHistory(sym);
  const newsClusters = aegisStore.getNewsBySymbol(sym, 100);

  const series = computeCSVDSeries(history.datapoints, newsClusters, {
    halfLifeHours,
    velocityFastSpan,
    velocitySlowSpan,
    divergenceZWindow,
    divergenceThreshold,
    minCorroboration,
  });

  const latest = series[series.length - 1] || null;

  return NextResponse.json({
    symbol: sym,
    source: history.source,
    parameters: {
      halfLifeHours,
      velocityFastSpan,
      velocitySlowSpan,
      divergenceZWindow,
      divergenceThreshold,
      minCorroboration,
    },
    latest,
    datapoints: series,
    methodology:
      'Aegis C-SVD: Corroboration-Weighted Sentiment Index (CWSI), Sentiment Velocity (SAV), and Information-Price Divergence Oscillator (NPDO) computed strictly point-in-time.',
  });
}
