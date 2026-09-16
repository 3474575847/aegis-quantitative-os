import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketTickerHistory } from '@/server/market';
import { aegisStore } from '@/server/store';
import { evaluateA3AdaptiveAlpha } from '@/server/a3Engine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const cleanSymbol = (symbol || 'BTC').toUpperCase().trim();

    const history = await fetchMarketTickerHistory(cleanSymbol);
    const candles = history.datapoints;
    const newsClusters = aegisStore.getLatestNews(100);

    const evaluation = evaluateA3AdaptiveAlpha(cleanSymbol, candles, newsClusters);
    return NextResponse.json(evaluation);
  } catch (error: any) {
    console.error('Error computing A3 signal evaluation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to compute A3 Adaptive Alpha evaluation' },
      { status: 500 }
    );
  }
}
