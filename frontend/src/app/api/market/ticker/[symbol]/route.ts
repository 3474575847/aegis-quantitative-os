import { NextResponse } from 'next/server';
import { fetchMarketTicker } from '@/server/market';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol required' }, { status: 400 });
  }

  const quote = await fetchMarketTicker(symbol);
  return NextResponse.json(quote);
}
