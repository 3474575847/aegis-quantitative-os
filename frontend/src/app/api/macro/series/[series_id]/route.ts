import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ series_id: string }> }
) {
  const { series_id } = await params;
  if (!series_id) {
    return NextResponse.json({ detail: 'Series ID required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '60', 10);

  const series = aegisStore.getMacroSeries(series_id, limit);
  return NextResponse.json(series);
}
