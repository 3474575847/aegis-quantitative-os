import { describe, expect, it } from 'vitest';
import { knowledgeGraphEngine } from '../knowledgeGraph';

describe('Aegis Knowledge Graph Engine', () => {
  it('builds a valid graph with connected nodes and edges from store data', () => {
    const graph = knowledgeGraphEngine.buildGraph();
    expect(graph.nodes.length).toBeGreaterThan(10);
    expect(graph.edges.length).toBeGreaterThan(10);

    // Verify company nodes exist
    const btcCompany = graph.nodes.find((n) => n.id === 'COMP_BTC');
    expect(btcCompany).toBeDefined();
    expect(btcCompany?.type).toBe('COMPANY');

    // Verify ticker nodes exist
    const btcTicker = graph.nodes.find((n) => n.id === 'TICKER_BTC');
    expect(btcTicker).toBeDefined();
    expect(btcTicker?.type).toBe('TICKER');

    // Verify edge HAS_TICKER exists
    const hasTickerEdge = graph.edges.find(
      (e) => e.source === 'COMP_BTC' && e.target === 'TICKER_BTC' && e.relationship === 'HAS_TICKER'
    );
    expect(hasTickerEdge).toBeDefined();

    // Verify metadata counts match
    expect(graph.metadata.node_count).toBe(graph.nodes.length);
    expect(graph.metadata.edge_count).toBe(graph.edges.length);
  });

  it('queries neighborhood subgraph for an entity', () => {
    const subgraph = knowledgeGraphEngine.queryNeighborhood('BTC', { depth: 1 });
    expect(subgraph.centerNode).toBeDefined();
    expect(subgraph.centerNode?.id).toBe('TICKER_BTC');
    expect(subgraph.nodes.length).toBeGreaterThan(1);
    expect(subgraph.edges.length).toBeGreaterThan(0);

    // Should include connected company
    const connectedCompany = subgraph.nodes.find((n) => n.id === 'COMP_BTC');
    expect(connectedCompany).toBeDefined();
  });
});
