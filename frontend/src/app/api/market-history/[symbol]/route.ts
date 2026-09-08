import { NextResponse } from 'next/server';

const EQUITY_SYMBOL = /^[A-Z]{1,5}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase().trim();
  if (!EQUITY_SYMBOL.test(symbol)) {
    return NextResponse.json({ datapoints: [], source: 'unavailable' }, { status: 400 });
  }

  try {
    const requestOptions = {
      headers: { 'User-Agent': 'Aegis-Alpha/0.1' },
      next: { revalidate: 60 },
    };
    let interval = '5m';
    let response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=1d`,
      requestOptions,
    );
    if (!response.ok) {
      interval = '1d';
      response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=1mo`,
        requestOptions,
      );
    }
    if (!response.ok) {
      return NextResponse.json({ datapoints: [], source: 'unavailable' }, { status: 200 });
    }

    const result = (await response.json())?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const datapoints = timestamps.flatMap((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if ([open, high, low, close].some((value) => value == null)) return [];
      return [{
        timestamp: new Date(timestamp * 1000).toISOString().slice(0, 10),
        time: timestamp,
        open,
        high,
        low,
        close,
        price: close,
        volume: quote.volume?.[index] ?? 0,
        sentimentZ: 0,
      }];
    });

    return NextResponse.json({
      symbol,
      datapoints,
      source: `Yahoo Finance ${interval} candles (frontend fallback)`,
      is_fallback: true,
    });
  } catch {
    return NextResponse.json({ datapoints: [], source: 'unavailable' }, { status: 200 });
  }
}
