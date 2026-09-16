import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ experiment_id: string }> }
) {
  const { experiment_id } = await params;
  const runs = aegisStore.getExperimentRuns(experiment_id);
  return NextResponse.json(runs);
}
