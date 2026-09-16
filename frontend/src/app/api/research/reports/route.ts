import { NextRequest, NextResponse } from 'next/server';
import { aegisResearchOrchestrator, GroundedResearchReport } from '../../../../server/researchEngine';

// Stored reports repository
const storedReports = new Map<string, GroundedResearchReport>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('id');

    if (reportId) {
      const report = storedReports.get(reportId);
      if (!report) {
        return NextResponse.json(
          { success: false, error: 'Report not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: report });
    }

    // Seed default baseline reports if empty
    if (storedReports.size === 0) {
      const btcReport = await aegisResearchOrchestrator.executeResearchQuery(
        'Comprehensive quantitative profile for BTC under high-rate macro regime',
        'BTC'
      );
      storedReports.set(btcReport.report_id, btcReport);

      const nvdaReport = await aegisResearchOrchestrator.executeResearchQuery(
        'Evaluation of NVDA momentum and AI hardware valuation multiples',
        'NVDA'
      );
      storedReports.set(nvdaReport.report_id, nvdaReport);
    }

    const reportsList = Array.from(storedReports.values()).map((r) => ({
      report_id: r.report_id,
      title: r.title,
      symbol: r.subject_symbol,
      generated_at: r.generated_at,
      executive_summary: r.executive_summary,
      evidence_count: r.evidence_citations.length,
    }));

    return NextResponse.json({
      success: true,
      data: reportsList,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list reports' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = body?.symbol || 'BTC';
    const query = body?.query || `Deep quantitative dossier for ${symbol}`;

    const report = await aegisResearchOrchestrator.executeResearchQuery(query, symbol);
    storedReports.set(report.report_id, report);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate research report' },
      { status: 500 }
    );
  }
}
