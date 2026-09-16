import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ experiment_id: string }> }
) {
  const { experiment_id } = await params;
  const runResult = await aegisStore.runExperiment(experiment_id);
  if (!runResult) {
    return NextResponse.json({ detail: 'Experiment not found' }, { status: 404 });
  }

  return NextResponse.json(runResult);
}
