import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketTickerHistory } from '@/server/market';
import { generateA3DiagnosticReport } from '@/server/researchDiagnostic';
import { aegisStore } from '@/server/store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BTC').toUpperCase().trim();

    const historyRes = await fetchMarketTickerHistory(symbol);
    const candles = historyRes.datapoints || [];

    const articles = aegisStore.getCanonicalNews();

    const diagnosticReport = generateA3DiagnosticReport(symbol, candles, articles);

    return NextResponse.json(diagnosticReport, {
      headers: {
        'Cache-Control': 'public, max-age=15, s-maxage=30',
      },
    });
  } catch (err: any) {
    console.error('Error generating A3 research diagnostic report:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate research diagnostic report' },
      { status: 500 }
    );
  }
}
