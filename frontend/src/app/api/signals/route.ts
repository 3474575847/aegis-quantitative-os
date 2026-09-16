import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET() {
  const signals = aegisStore.getSignals();
  return NextResponse.json(signals);
}
