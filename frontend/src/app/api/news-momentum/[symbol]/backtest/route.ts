import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const costBps = parseFloat(searchParams.get('transaction_cost_bps') || '5.0');
  const slipBps = parseFloat(searchParams.get('slippage_bps') || '0.0');
  const posSize = parseFloat(searchParams.get('position_size') || '1.0');
  const holdPeriod = parseInt(searchParams.get('holding_period') || '1', 10);

  try {
    const result = await aegisStore.backtestNewsMomentum(
      symbol,
      costBps,
      slipBps,
      posSize,
      holdPeriod
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Backtest failed' },
      { status: 422 }
    );
  }
}
