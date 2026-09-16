import { NextRequest, NextResponse } from 'next/server';
import { aegisResearchOrchestrator } from '../../../../server/researchEngine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body?.query;
    const symbol = body?.symbol;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A research query string is required' },
        { status: 400 }
      );
    }

    const report = await aegisResearchOrchestrator.executeResearchQuery(query, symbol);

    return NextResponse.json({
      success: true,
      data: report,
      provenance: {
        orchestrator: 'Aegis Grounded AI Research Engine',
        verified_point_in_time: true,
        generated_at: report.generated_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Research orchestration failed' },
      { status: 500 }
    );
  }
}
