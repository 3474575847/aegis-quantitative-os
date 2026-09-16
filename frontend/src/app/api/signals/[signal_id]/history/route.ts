import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signal_id: string }> }
) {
  const { signal_id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  const history = aegisStore.getSignalHistory(signal_id, limit);
  if (!history) {
    return NextResponse.json({ detail: 'Signal not found' }, { status: 404 });
  }

  return NextResponse.json(history);
}
