import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cluster_id: string }> }
) {
  const { cluster_id } = await params;
  const detail = aegisStore.getNewsCluster(cluster_id);
  if (!detail) {
    return NextResponse.json({ detail: 'Cluster not found' }, { status: 404 });
  }

  return NextResponse.json(detail);
}
