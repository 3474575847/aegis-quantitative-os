import { NextResponse } from 'next/server';
import { computeAssetFactorMatrix, FACTOR_REGISTRY } from '@/server/factors';
import { fetchMarketTickerHistory } from '@/server/market';
import { aegisStore } from '@/server/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol is required' }, { status: 400 });
  }

  const sym = symbol.toUpperCase().trim();
  const history = await fetchMarketTickerHistory(sym);
  const newsClusters = aegisStore.getNewsBySymbol(sym, 50);
  const macroRegime = aegisStore.getMacroRegime();
  const yieldCurve = aegisStore.getYieldCurve();

  const snapshot = computeAssetFactorMatrix(
    sym,
    history.datapoints,
    newsClusters,
    {
      yieldCurveSlopeBps: yieldCurve.slope_bps ?? 32,
      inflationDrift: macroRegime.inflation_change_3m ?? 0.2,
      regime: macroRegime.regime,
    }
  );

  return NextResponse.json({
    symbol: sym,
    snapshot,
    registry: FACTOR_REGISTRY,
    retrieved_at: new Date().toISOString(),
  });
}
