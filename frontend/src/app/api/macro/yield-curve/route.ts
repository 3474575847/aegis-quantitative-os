import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET() {
  const snapshot = aegisStore.getYieldCurve();
  return NextResponse.json(snapshot);
}
