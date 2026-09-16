import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET() {
  const experiments = aegisStore.getExperiments();
  return NextResponse.json(experiments);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json({ detail: 'Experiment name is required' }, { status: 422 });
    }

    const created = aegisStore.createExperiment({
      name: body.name,
      description: body.description,
      signal_id: body.signal_id,
      symbol: body.symbol,
      transaction_cost_bps: body.transaction_cost_bps,
      slippage_bps: body.slippage_bps,
      tags: body.tags,
      initial_result: body.initial_result,
      methodology: body.methodology,
    });

    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Failed to create experiment' },
      { status: 500 }
    );
  }
}
