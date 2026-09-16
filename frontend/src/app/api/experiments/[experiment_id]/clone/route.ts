import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ experiment_id: string }> }
) {
  const { experiment_id } = await params;
  const { searchParams } = new URL(request.url);

  const name = searchParams.get('name');
  if (!name) {
    return NextResponse.json({ detail: 'Experiment clone name required' }, { status: 422 });
  }

  const symbol = searchParams.get('symbol');
  const costBps = searchParams.has('transaction_cost_bps')
    ? parseFloat(searchParams.get('transaction_cost_bps')!)
    : null;
  const slippageBps = searchParams.has('slippage_bps')
    ? parseFloat(searchParams.get('slippage_bps')!)
    : null;

  const cloned = aegisStore.cloneExperiment(experiment_id, {
    name,
    symbol,
    transaction_cost_bps: costBps,
    slippage_bps: slippageBps,
  });

  if (!cloned) {
    return NextResponse.json({ detail: 'Source experiment not found' }, { status: 404 });
  }

  return NextResponse.json(cloned);
}
