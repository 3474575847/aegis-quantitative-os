import { NextResponse } from 'next/server';
import { aegisStore } from '@/server/store';

export async function GET() {
  const regime = aegisStore.getMacroRegime();
  return NextResponse.json(regime);
}
