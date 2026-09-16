import { describe, expect, it } from 'vitest';
import { aegisResearchOrchestrator } from '../researchEngine';

describe('Aegis Research Orchestrator', () => {
  it('executes a fully grounded research query without hallucination', async () => {
    const report = await aegisResearchOrchestrator.executeResearchQuery(
      'Analyze momentum and macro valuation risks for NVDA',
      'NVDA'
    );

    expect(report).toBeDefined();
    expect(report.subject_symbol).toBe('NVDA');
    expect(report.workflow.execution_plan.length).toBe(7);
    expect(report.asset_intelligence.symbol).toBe('NVDA');
    expect(report.asset_intelligence.current_price).toBeGreaterThan(0);
    expect(report.evidence_citations.length).toBeGreaterThan(3);

    // Verify all evidence items have verifiable timestamps and source provenance
    for (const ev of report.evidence_citations) {
      expect(ev.source).toBeTruthy();
      expect(ev.observation_timestamp).toBeTruthy();
      expect(ev.verified_point_in_time).toBe(true);
    }

    // Verify macro fields are present
    expect(report.macro_regime.treasury_10y).toBeDefined();
    expect(typeof report.macro_regime.regime_interpretation).toBe('string');
  });

  it('correctly auto-extracts symbol from unstructured query', async () => {
    const report = await aegisResearchOrchestrator.executeResearchQuery(
      'What are the risk factors and momentum metrics for BTC right now?'
    );
    expect(report.subject_symbol).toBe('BTC');
  });
});
