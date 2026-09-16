import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const events = aegisStore.getEvents(limit);
  return NextResponse.json(events);
}
