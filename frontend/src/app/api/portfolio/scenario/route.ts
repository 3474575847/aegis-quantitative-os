import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const holdings = body?.holdings || {};
    const shocks = body?.shocks || {};

    const totalWeight = Object.values(holdings).reduce((acc: number, v) => acc + Number(v), 0);
    if (Object.values(holdings).some((v) => Number(v) < 0) || Math.abs(totalWeight - 1.0) > 0.001) {
      return NextResponse.json(
        { detail: 'Holding weights must be non-negative and sum to 1' },
        { status: 422 }
      );
    }

    const scenario = await aegisStore.runPortfolioScenario(holdings, shocks);
    return NextResponse.json(scenario);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Invalid scenario request' },
      { status: 500 }
    );
  }
}
