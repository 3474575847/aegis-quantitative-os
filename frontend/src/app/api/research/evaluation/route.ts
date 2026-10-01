import { NextRequest, NextResponse } from 'next/server';
import { runComprehensiveRegimeExperiment } from '@/server/experimentEngine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = (searchParams.get('asset') || 'BTC').toUpperCase().trim();
    const barsPerRegime = Math.min(1000, Math.max(50, Number(searchParams.get('bars') || 300)));
    const baseCostBps = Math.max(0, Number(searchParams.get('cost') || 5));
    const seed = Number(searchParams.get('seed') || 42);

    const report = runComprehensiveRegimeExperiment(asset, barsPerRegime, baseCostBps, seed);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error running comprehensive regime experiment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute experiment evaluation' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const asset = (body.asset || 'BTC').toUpperCase().trim();
    const barsPerRegime = Math.min(1000, Math.max(50, Number(body.barsPerRegime || 300)));
    const baseCostBps = Math.max(0, Number(body.transactionCostBps ?? 5));
    const seed = Number(body.randomSeed || 42);

    const report = runComprehensiveRegimeExperiment(asset, barsPerRegime, baseCostBps, seed);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error running comprehensive regime experiment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute experiment evaluation' },
      { status: 500 }
    );
  }
}
