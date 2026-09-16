import { NextResponse } from 'next/server';
import { fetchMarketTickerHistory } from '@/server/market';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol required' }, { status: 400 });
  }

  const history = await fetchMarketTickerHistory(symbol);
  return NextResponse.json(history);
}
