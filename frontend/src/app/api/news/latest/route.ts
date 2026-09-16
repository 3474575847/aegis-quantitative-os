import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const minCorroboration = parseFloat(searchParams.get('min_corroboration') || '0.0');

  const news = aegisStore.getLatestNews(limit, minCorroboration);
  return NextResponse.json(news);
}
