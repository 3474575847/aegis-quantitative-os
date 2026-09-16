import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.experiment_ids) ? body.experiment_ids : [];
    const comparison = aegisStore.compareExperiments(ids);
    return NextResponse.json(comparison);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Invalid comparison request' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.getAll('id');
  const comparison = aegisStore.compareExperiments(ids);
  return NextResponse.json(comparison);
}
