import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol required' }, { status: 400 });
  }

  const momentum = await aegisStore.getNewsMomentum(symbol);
  return NextResponse.json(momentum);
}
