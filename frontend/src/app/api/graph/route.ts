import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphEngine } from '../../../server/knowledgeGraph';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entity_id') || searchParams.get('symbol');
    const depthStr = searchParams.get('depth');
    const depth = depthStr ? Math.max(1, Math.min(3, parseInt(depthStr, 10))) : 1;
    const typeFilter = searchParams.get('type')?.toUpperCase();
    const searchTerm = searchParams.get('search')?.toLowerCase();

    if (entityId) {
      const subgraph = knowledgeGraphEngine.queryNeighborhood(entityId, { depth });
      return NextResponse.json({
        success: true,
        data: subgraph,
        provenance: {
          retrieved_at: new Date().toISOString(),
          query: { entity_id: entityId, depth },
          system: 'Aegis Knowledge Graph Engine',
        },
      });
    }

    const graph = knowledgeGraphEngine.buildGraph();

    let filteredNodes = graph.nodes;
    if (typeFilter) {
      filteredNodes = filteredNodes.filter((n) => n.type === typeFilter);
    }
    if (searchTerm) {
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(searchTerm) ||
          n.id.toLowerCase().includes(searchTerm) ||
          JSON.stringify(n.properties).toLowerCase().includes(searchTerm)
      );
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graph.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return NextResponse.json({
      success: true,
      data: {
        nodes: filteredNodes,
        edges: filteredEdges,
        metadata: {
          ...graph.metadata,
          filtered_nodes_count: filteredNodes.length,
          filtered_edges_count: filteredEdges.length,
        },
      },
      provenance: {
        retrieved_at: new Date().toISOString(),
        system: 'Aegis Knowledge Graph Engine',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to query Aegis Knowledge Graph',
      },
      { status: 500 }
    );
  }
}
