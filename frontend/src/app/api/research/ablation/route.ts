import { NextResponse } from 'next/server';
import { runFactorAblationStudy } from '@/server/ablation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'BTC';
  const tCost = Number(searchParams.get('transaction_cost_bps')) || 5.0;
  const slippage = Number(searchParams.get('slippage_bps')) || 0.0;

  try {
    const study = await runFactorAblationStudy(symbol, tCost, slippage);
    return NextResponse.json(study);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to run ablation study' }, { status: 500 });
  }
}
