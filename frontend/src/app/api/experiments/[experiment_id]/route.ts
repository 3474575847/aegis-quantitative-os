import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ experiment_id: string }> }
) {
  const { experiment_id } = await params;
  const exp = aegisStore.getExperiment(experiment_id);
  if (!exp) {
    return NextResponse.json({ detail: 'Experiment not found' }, { status: 404 });
  }

  return NextResponse.json(exp);
}
