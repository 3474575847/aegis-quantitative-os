import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketTickerHistory } from '@/server/market';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || 'BTC').toUpperCase().trim();
    const history = await fetchMarketTickerHistory(symbol);

    // Return the complete history response containing datapoints array
    return NextResponse.json(history);
  } catch (error: any) {
    console.error('Error fetching market history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market history', detail: error?.message },
      { status: 500 }
    );
  }
}
