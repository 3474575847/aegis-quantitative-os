import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signal_id: string }> }
) {
  const { signal_id } = await params;
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'BTC';
  const transactionCostBps = parseFloat(searchParams.get('transaction_cost_bps') || '5.0');
  const slippageBps = parseFloat(searchParams.get('slippage_bps') || '0.0');

  try {
    const res = await aegisStore.executeBacktest(
      signal_id,
      symbol,
      transactionCostBps,
      slippageBps
    );
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Backtest execution failed' },
      { status: 422 }
    );
  }
}
