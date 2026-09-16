import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET() {
  const status = aegisStore.getSystemStatus();
  return NextResponse.json(status);
}
