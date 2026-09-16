import { aegisStore } from './store';

export type EntityType =
  | 'COMPANY'
  | 'TICKER'
  | 'SECTOR'
  | 'INDUSTRY'
  | 'NEWS_CLUSTER'
  | 'EVENT'
  | 'MACRO_SERIES'
  | 'SIGNAL'
  | 'EXPERIMENT';

export type RelationshipType =
  | 'HAS_TICKER'
  | 'IN_SECTOR'
  | 'IN_INDUSTRY'
  | 'MENTIONS'
  | 'AFFECTS'
  | 'GENERATED_FOR'
  | 'USES_SIGNAL'
  | 'MACRO_INFLUENCES'
  | 'CORRELATED_WITH';

export interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  properties: Record<string, any>;
  provenance: {
    source: string;
    timestamp: string;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: RelationshipType;
  weight: number;
  properties?: Record<string, any>;
  provenance: {
    source: string;
    timestamp: string;
  };
}

export interface AegisKnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    generated_at: string;
    node_count: number;
    edge_count: number;
    entity_counts: Record<EntityType, number>;
  };
}

export class KnowledgeGraphEngine {
  /**
   * Compiles the full live knowledge graph from ground-truth Aegis data structures.
   */
  public buildGraph(): AegisKnowledgeGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Set<string>();

    const addNode = (node: GraphNode) => {
      if (!nodeMap.has(node.id)) {
        nodeMap.add(node.id);
        nodes.push(node);
      }
    };

    const addEdge = (edge: GraphEdge) => {
      edges.push(edge);
    };

    const now = new Date().toISOString();

    // 1. Sectors & Industries
    const sectors = [
      { id: 'SEC_CRYPTO', label: 'Digital Assets & Web3', type: 'SECTOR' as EntityType },
      { id: 'SEC_TECH', label: 'Technology & Computing', type: 'SECTOR' as EntityType },
      { id: 'SEC_AUTO', label: 'Automotive & Clean Energy', type: 'SECTOR' as EntityType },
      { id: 'SEC_MACRO', label: 'Global Sovereign & Central Banking', type: 'SECTOR' as EntityType },
    ];
    for (const sec of sectors) {
      addNode({
        id: sec.id,
        label: sec.label,
        type: sec.type,
        properties: { classification: 'GICS Sector' },
        provenance: { source: 'Aegis Core Taxonomy', timestamp: now },
      });
    }

    // 2. Companies & Tickers
    const assetRegistry: Array<{
      companyId: string;
      companyName: string;
      ticker: string;
      sectorId: string;
      industry: string;
      assetClass: string;
    }> = [
      {
        companyId: 'COMP_BTC',
        companyName: 'Bitcoin Network',
        ticker: 'BTC',
        sectorId: 'SEC_CRYPTO',
        industry: 'Store of Value / Layer 1',
        assetClass: 'CRYPTO',
      },
      {
        companyId: 'COMP_ETH',
        companyName: 'Ethereum Protocol',
        ticker: 'ETH',
        sectorId: 'SEC_CRYPTO',
        industry: 'Smart Contract Platforms',
        assetClass: 'CRYPTO',
      },
      {
        companyId: 'COMP_SOL',
        companyName: 'Solana Foundation',
        ticker: 'SOL',
        sectorId: 'SEC_CRYPTO',
        industry: 'High-Throughput PoS Blockchain',
        assetClass: 'CRYPTO',
      },
      {
        companyId: 'COMP_NVDA',
        companyName: 'Nvidia Corporation',
        ticker: 'NVDA',
        sectorId: 'SEC_TECH',
        industry: 'Semiconductors & AI Hardware',
        assetClass: 'EQUITY',
      },
      {
        companyId: 'COMP_AAPL',
        companyName: 'Apple Inc.',
        ticker: 'AAPL',
        sectorId: 'SEC_TECH',
        industry: 'Consumer Electronics & Services',
        assetClass: 'EQUITY',
      },
      {
        companyId: 'COMP_MSFT',
        companyName: 'Microsoft Corporation',
        ticker: 'MSFT',
        sectorId: 'SEC_TECH',
        industry: 'Enterprise Software & Cloud',
        assetClass: 'EQUITY',
      },
      {
        companyId: 'COMP_TSLA',
        companyName: 'Tesla Inc.',
        ticker: 'TSLA',
        sectorId: 'SEC_AUTO',
        industry: 'Electric Vehicles & Energy Storage',
        assetClass: 'EQUITY',
      },
      {
        companyId: 'COMP_GOOGL',
        companyName: 'Alphabet Inc.',
        ticker: 'GOOGL',
        sectorId: 'SEC_TECH',
        industry: 'Search, Advertising & Cloud',
        assetClass: 'EQUITY',
      },
      {
        companyId: 'COMP_AMZN',
        companyName: 'Amazon.com Inc.',
        ticker: 'AMZN',
        sectorId: 'SEC_TECH',
        industry: 'E-Commerce & Cloud Infrastructure',
        assetClass: 'EQUITY',
      },
    ];

    for (const asset of assetRegistry) {
      // Company node
      addNode({
        id: asset.companyId,
        label: asset.companyName,
        type: 'COMPANY',
        properties: {
          asset_class: asset.assetClass,
          industry: asset.industry,
        },
        provenance: { source: 'Aegis Entity Registry', timestamp: now },
      });

      // Ticker node
      const tickerNodeId = `TICKER_${asset.ticker}`;
      addNode({
        id: tickerNodeId,
        label: asset.ticker,
        type: 'TICKER',
        properties: {
          symbol: asset.ticker,
          asset_class: asset.assetClass,
        },
        provenance: { source: 'Aegis Market Directory', timestamp: now },
      });

      // Edge: Company -> HAS_TICKER -> Ticker
      addEdge({
        id: `EDGE_${asset.companyId}_HAS_TICKER_${tickerNodeId}`,
        source: asset.companyId,
        target: tickerNodeId,
        relationship: 'HAS_TICKER',
        weight: 1.0,
        provenance: { source: 'Aegis Security Master', timestamp: now },
      });

      // Edge: Company -> IN_SECTOR -> Sector
      addEdge({
        id: `EDGE_${asset.companyId}_IN_SECTOR_${asset.sectorId}`,
        source: asset.companyId,
        target: asset.sectorId,
        relationship: 'IN_SECTOR',
        weight: 0.9,
        provenance: { source: 'Aegis Taxonomy', timestamp: now },
      });
    }

    // 3. Macro Series Nodes & Influences
    const macroItems = [
      { id: 'MACRO_DGS10', label: '10-Year Treasury Constant Maturity Rate', symbol: 'DGS10', affects: ['SEC_TECH', 'SEC_CRYPTO'] },
      { id: 'MACRO_FEDFUNDS', label: 'Effective Federal Funds Rate', symbol: 'FEDFUNDS', affects: ['SEC_TECH', 'SEC_AUTO', 'SEC_CRYPTO'] },
      { id: 'MACRO_CPIAUCSL', label: 'Consumer Price Index (Inflation)', symbol: 'CPIAUCSL', affects: ['SEC_CRYPTO', 'SEC_TECH'] },
      { id: 'MACRO_UNRATE', label: 'Civilian Unemployment Rate', symbol: 'UNRATE', affects: ['SEC_TECH', 'SEC_AUTO'] },
    ];

    for (const m of macroItems) {
      addNode({
        id: m.id,
        label: m.label,
        type: 'MACRO_SERIES',
        properties: { series_id: m.symbol, provider: 'FRED St. Louis' },
        provenance: { source: 'Federal Reserve Bank of St. Louis', timestamp: now },
      });

      for (const targetSec of m.affects) {
        addEdge({
          id: `EDGE_${m.id}_INFLUENCES_${targetSec}`,
          source: m.id,
          target: targetSec,
          relationship: 'MACRO_INFLUENCES',
          weight: 0.75,
          provenance: { source: 'Aegis Macroeconomic Correlation Model', timestamp: now },
        });
      }
    }

    // 4. Signals from Store
    const signals = aegisStore.getSignals();
    for (const sig of signals) {
      const sigNodeId = `SIG_${sig.id}`;
      addNode({
        id: sigNodeId,
        label: sig.name,
        type: 'SIGNAL',
        properties: {
          version: sig.version,
          parameters: sig.parameters,
          latest_value: sig.latest_value,
        },
        provenance: { source: 'Aegis Quantitative Signal Engine', timestamp: sig.created_at },
      });

      // Connect Signal -> GENERATED_FOR -> Ticker based on name
      const targetTicker =
        sig.name.includes('BTC') ? 'TICKER_BTC' :
        sig.name.includes('ETH') ? 'TICKER_ETH' :
        sig.name.includes('SOL') ? 'TICKER_SOL' :
        sig.name.includes('NVDA') ? 'TICKER_NVDA' :
        'TICKER_BTC';

      if (nodeMap.has(targetTicker)) {
        addEdge({
          id: `EDGE_${sigNodeId}_FOR_${targetTicker}`,
          source: sigNodeId,
          target: targetTicker,
          relationship: 'GENERATED_FOR',
          weight: 0.85,
          provenance: { source: 'Aegis Factor Pipeline', timestamp: sig.created_at },
        });
      }
    }

    // 5. Experiments from Store
    const experiments = aegisStore.getExperiments();
    for (const exp of experiments) {
      const expNodeId = `EXP_${exp.experiment_id}`;
      const symbol = (exp as any).symbol || (exp as any).parameters?.symbol || 'BTC';
      const signalId = (exp as any).signal_id || (exp as any).parameters?.signal_id;
      const createdAt = (exp as any).created_at || (exp as any).latest_run?.started_at || now;

      addNode({
        id: expNodeId,
        label: exp.name,
        type: 'EXPERIMENT',
        properties: {
          description: exp.description,
          symbol,
        },
        provenance: { source: 'Aegis Experimentation Engine', timestamp: createdAt },
      });

      // Edge: Experiment -> USES_SIGNAL -> Signal
      if (signalId) {
        const sigNodeId = `SIG_${signalId}`;
        if (nodeMap.has(sigNodeId)) {
          addEdge({
            id: `EDGE_${expNodeId}_USES_${sigNodeId}`,
            source: expNodeId,
            target: sigNodeId,
            relationship: 'USES_SIGNAL',
            weight: 1.0,
            provenance: { source: 'Aegis Experimentation Registry', timestamp: createdAt },
          });
        }
      }

      // Edge: Experiment -> EVALUATES -> Ticker
      const tickerNodeId = `TICKER_${symbol.toUpperCase()}`;
      if (nodeMap.has(tickerNodeId)) {
        addEdge({
          id: `EDGE_${expNodeId}_FOR_${tickerNodeId}`,
          source: expNodeId,
          target: tickerNodeId,
          relationship: 'GENERATED_FOR',
          weight: 0.9,
          provenance: { source: 'Aegis Experimentation Registry', timestamp: createdAt },
        });
      }
    }

    // 6. News Clusters from Store
    const newsArticles = aegisStore.getLatestNews(100);
    for (const article of newsArticles) {
      const newsNodeId = `NEWS_${article.cluster_id}`;
      addNode({
        id: newsNodeId,
        label: article.primary_headline,
        type: 'NEWS_CLUSTER',
        properties: {
          cluster_id: article.cluster_id,
          publisher: article.primary_publisher,
          publisher_count: article.publisher_count,
          sentiment_polarity: article.sentiment_polarity,
          corroboration_score: article.corroboration_score,
          first_available_at: article.first_available_at,
        },
        provenance: { source: article.primary_publisher, timestamp: article.first_available_at },
      });

      // Connect NEWS_CLUSTER -> MENTIONS -> Ticker / Company
      for (const ent of article.entities) {
        const tickerNodeId = `TICKER_${ent.toUpperCase()}`;
        if (nodeMap.has(tickerNodeId)) {
          addEdge({
            id: `EDGE_${newsNodeId}_MENTIONS_${tickerNodeId}`,
            source: newsNodeId,
            target: tickerNodeId,
            relationship: 'MENTIONS',
            weight: Math.abs(article.sentiment_polarity) || 0.5,
            properties: { sentiment: article.sentiment_polarity },
            provenance: { source: 'Aegis News NLP Entity Extractor', timestamp: article.first_available_at },
          });
        }
      }
    }

    // 7. Events from Store
    const events = aegisStore.getEvents();
    for (const evt of events) {
      const evtNodeId = `EVT_${evt.event_id}`;
      addNode({
        id: evtNodeId,
        label: `${evt.event_type}: ${evt.source}`,
        type: 'EVENT',
        properties: {
          event_type: evt.event_type,
          source: evt.source,
          correlation_id: evt.correlation_id,
          payload: evt.payload,
        },
        provenance: { source: evt.source, timestamp: evt.timestamp },
      });

      // If event payload has symbol, connect EVENT -> AFFECTS -> Ticker
      const sym = evt.payload?.symbol;
      if (sym) {
        const tickerNodeId = `TICKER_${sym.toUpperCase()}`;
        if (nodeMap.has(tickerNodeId)) {
          addEdge({
            id: `EDGE_${evtNodeId}_AFFECTS_${tickerNodeId}`,
            source: evtNodeId,
            target: tickerNodeId,
            relationship: 'AFFECTS',
            weight: 0.8,
            provenance: { source: 'Aegis Event Bus', timestamp: evt.timestamp },
          });
        }
      }
    }

    // Calculate node counts by entity type
    const entityCounts: Record<EntityType, number> = {
      COMPANY: 0,
      TICKER: 0,
      SECTOR: 0,
      INDUSTRY: 0,
      NEWS_CLUSTER: 0,
      EVENT: 0,
      MACRO_SERIES: 0,
      SIGNAL: 0,
      EXPERIMENT: 0,
    };

    for (const n of nodes) {
      entityCounts[n.type] = (entityCounts[n.type] || 0) + 1;
    }

    return {
      nodes,
      edges,
      metadata: {
        generated_at: now,
        node_count: nodes.length,
        edge_count: edges.length,
        entity_counts: entityCounts,
      },
    };
  }

  /**
   * Retrieves a focused neighborhood subgraph around a specific entity.
   */
  public queryNeighborhood(
    entityId: string,
    options: { depth?: number; maxNodes?: number } = {}
  ): { nodes: GraphNode[]; edges: GraphEdge[]; centerNode: GraphNode | null } {
    const fullGraph = this.buildGraph();
    const depth = options.depth ?? 1;
    const maxNodes = options.maxNodes ?? 50;

    const normId = entityId.toUpperCase().trim();
    // Look up center node by id or by ticker symbol
    let center = fullGraph.nodes.find(
      (n) => n.id.toUpperCase() === normId || n.label.toUpperCase() === normId
    );
    if (!center && !normId.startsWith('TICKER_')) {
      center = fullGraph.nodes.find((n) => n.id === `TICKER_${normId}`);
    }
    if (!center && !normId.startsWith('COMP_')) {
      center = fullGraph.nodes.find((n) => n.id === `COMP_${normId}`);
    }

    if (!center) {
      return { nodes: [], edges: [], centerNode: null };
    }

    const visitedNodeIds = new Set<string>([center.id]);
    let currentHop = new Set<string>([center.id]);

    const collectedEdges = new Set<GraphEdge>();

    for (let d = 0; d < depth; d++) {
      const nextHop = new Set<string>();
      for (const edge of fullGraph.edges) {
        if (currentHop.has(edge.source) && !visitedNodeIds.has(edge.target)) {
          collectedEdges.add(edge);
          nextHop.add(edge.target);
          visitedNodeIds.add(edge.target);
        } else if (currentHop.has(edge.target) && !visitedNodeIds.has(edge.source)) {
          collectedEdges.add(edge);
          nextHop.add(edge.source);
          visitedNodeIds.add(edge.source);
        } else if (visitedNodeIds.has(edge.source) && visitedNodeIds.has(edge.target)) {
          collectedEdges.add(edge);
        }
      }
      currentHop = nextHop;
      if (visitedNodeIds.size >= maxNodes) break;
    }

    const filteredNodes = fullGraph.nodes.filter((n) => visitedNodeIds.has(n.id));
    return {
      nodes: filteredNodes,
      edges: Array.from(collectedEdges),
      centerNode: center,
    };
  }
}

export const knowledgeGraphEngine = new KnowledgeGraphEngine();
