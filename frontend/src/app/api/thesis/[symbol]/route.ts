import { NextResponse } from 'next/server';
import { generateAegisCompanyThesis } from '@/server/thesisEngine';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!symbol) {
    return NextResponse.json({ detail: 'Symbol is required' }, { status: 400 });
  }

  try {
    const thesis = await generateAegisCompanyThesis(symbol);
    return NextResponse.json(thesis);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate thesis' }, { status: 500 });
  }
}
