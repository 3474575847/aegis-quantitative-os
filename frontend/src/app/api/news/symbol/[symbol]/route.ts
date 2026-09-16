import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const news = aegisStore.getNewsBySymbol(symbol, limit);
  return NextResponse.json(news);
}
