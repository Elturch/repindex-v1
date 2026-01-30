/**
 * Graph Context Builder for Hybrid Vector + Graph RAG
 * 
 * Transforms graph expansion data into structured context for LLM consumption.
 * This module bridges the gap between SQL graph traversal and AI reasoning.
 * 
 * Architecture:
 * - expand_entity_graph_with_scores (SQL) → GraphContextBuilder → Structured JSON → LLM
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface GraphEntity {
  ticker: string;
  name: string;
  sector: string | null;
  subsector: string | null;
  ibex_family: string | null;
  depth: number;
  relation: 'ORIGIN' | 'COMPITE_CON' | 'MISMO_SUBSECTOR' | 'MISMO_SECTOR';
  strength: number;
  path: string[];
}

export interface EntityScore {
  avg_rix: number;
  min_rix: number;
  max_rix: number;
  models_count: number;
  models: string[];
  by_model: Array<{
    model: string;
    rix: number;
    rix_adj: number | null;
    period_from: string;
    period_to: string;
    metrics: {
      nvm: number | null;
      drm: number | null;
      sim: number | null;
      rmm: number | null;
      cem: number | null;
      gam: number | null;
      dcm: number | null;
      cxm: number | null;
    };
  }>;
}

export interface GraphExpansionResult {
  primary_entity: {
    ticker: string;
    name: string;
    sector: string | null;
    subsector: string | null;
    ibex_family: string | null;
  };
  graph: GraphEntity[];
  entity_scores: Record<string, EntityScore>;
  metadata: {
    generated_at: string;
    depth: number;
    weeks_requested: number;
    total_entities: number;
    entities_with_scores: number;
  };
}

export interface StructuredGraphContext {
  // Primary entity with full data
  primary_entity: {
    ticker: string;
    name: string;
    sector: string | null;
    subsector: string | null;
    avg_rix: number | null;
    rix_range: { min: number; max: number } | null;
    models_analyzed: string[];
    latest_metrics: Record<string, number | null>;
  };
  
  // Related entities grouped by relationship type
  competitors: Array<{
    ticker: string;
    name: string;
    relation_strength: number;
    avg_rix: number | null;
    rix_delta: number | null; // vs primary entity
  }>;
  
  sector_peers: Array<{
    ticker: string;
    name: string;
    subsector: string | null;
    avg_rix: number | null;
    rix_delta: number | null;
  }>;
  
  // Sector-level aggregates
  sector_context: {
    sector_name: string | null;
    subsector_name: string | null;
    avg_sector_rix: number | null;
    primary_vs_sector: number | null; // delta
    top_performer: { ticker: string; name: string; rix: number } | null;
    bottom_performer: { ticker: string; name: string; rix: number } | null;
  };
  
  // Relationship summary for LLM reasoning
  relationship_summary: {
    total_entities: number;
    verified_competitors: number;
    same_subsector: number;
    same_sector: number;
    entities_with_scores: number;
  };
  
  // Metadata
  context_metadata: {
    generated_at: string;
    traversal_depth: number;
    confidence_note: string;
  };
}

export interface VectorDocument {
  content: string;
  metadata?: {
    ticker?: string;
    model?: string;
    week?: string;
    [key: string]: unknown;
  };
  similarity?: number;
}

export interface BuildContextOptions {
  primaryEntities: Array<{ ticker: string; issuer_name: string }>;
  entityGraphs: GraphExpansionResult[];
  vectorDocs?: VectorDocument[];
  qualitativeContext?: string;
  includeMetrics?: boolean;
}

// =============================================================================
// GRAPH CONTEXT BUILDER
// =============================================================================

/**
 * Builds a structured context object from graph expansion results
 * for consumption by the LLM in the RAG pipeline.
 */
export function buildStructuredContext(options: BuildContextOptions): StructuredGraphContext[] {
  const { primaryEntities, entityGraphs, includeMetrics = true } = options;
  
  return entityGraphs.map((graphResult, index) => {
    const primaryTicker = primaryEntities[index]?.ticker || graphResult.primary_entity?.ticker;
    const primaryScore = graphResult.entity_scores?.[primaryTicker];
    
    // Extract primary entity data
    const primaryEntity = graphResult.graph?.find(e => e.relation === 'ORIGIN') || {
      ticker: primaryTicker,
      name: graphResult.primary_entity?.name || 'Unknown',
      sector: graphResult.primary_entity?.sector || null,
      subsector: graphResult.primary_entity?.subsector || null,
    };
    
    // Group entities by relationship type
    const competitors = (graphResult.graph || [])
      .filter(e => e.relation === 'COMPITE_CON')
      .map(e => ({
        ticker: e.ticker,
        name: e.name,
        relation_strength: e.strength,
        avg_rix: graphResult.entity_scores?.[e.ticker]?.avg_rix || null,
        rix_delta: calculateDelta(
          graphResult.entity_scores?.[e.ticker]?.avg_rix,
          primaryScore?.avg_rix
        ),
      }));
    
    const sectorPeers = (graphResult.graph || [])
      .filter(e => e.relation === 'MISMO_SUBSECTOR' || e.relation === 'MISMO_SECTOR')
      .map(e => ({
        ticker: e.ticker,
        name: e.name,
        subsector: e.subsector,
        avg_rix: graphResult.entity_scores?.[e.ticker]?.avg_rix || null,
        rix_delta: calculateDelta(
          graphResult.entity_scores?.[e.ticker]?.avg_rix,
          primaryScore?.avg_rix
        ),
      }));
    
    // Calculate sector-level aggregates
    const allScores = Object.entries(graphResult.entity_scores || {})
      .filter(([ticker]) => ticker !== primaryTicker)
      .map(([ticker, score]) => ({
        ticker,
        name: graphResult.graph?.find(e => e.ticker === ticker)?.name || ticker,
        rix: score.avg_rix,
      }))
      .filter(e => e.rix !== null && e.rix !== undefined);
    
    const avgSectorRix = allScores.length > 0
      ? Math.round(allScores.reduce((sum, e) => sum + e.rix, 0) / allScores.length * 10) / 10
      : null;
    
    const sortedByRix = [...allScores].sort((a, b) => b.rix - a.rix);
    const topPerformer = sortedByRix[0] || null;
    const bottomPerformer = sortedByRix[sortedByRix.length - 1] || null;
    
    // Build latest metrics from primary entity
    const latestMetrics: Record<string, number | null> = {};
    if (includeMetrics && primaryScore?.by_model?.[0]?.metrics) {
      const metrics = primaryScore.by_model[0].metrics;
      latestMetrics.nvm = metrics.nvm;
      latestMetrics.drm = metrics.drm;
      latestMetrics.sim = metrics.sim;
      latestMetrics.rmm = metrics.rmm;
      latestMetrics.cem = metrics.cem;
      latestMetrics.gam = metrics.gam;
      latestMetrics.dcm = metrics.dcm;
      latestMetrics.cxm = metrics.cxm;
    }
    
    // Relationship summary
    const relationshipSummary = {
      total_entities: graphResult.metadata?.total_entities || graphResult.graph?.length || 0,
      verified_competitors: competitors.length,
      same_subsector: (graphResult.graph || []).filter(e => e.relation === 'MISMO_SUBSECTOR').length,
      same_sector: (graphResult.graph || []).filter(e => e.relation === 'MISMO_SECTOR').length,
      entities_with_scores: graphResult.metadata?.entities_with_scores || 0,
    };
    
    // Confidence note based on data quality
    const confidenceNote = buildConfidenceNote(relationshipSummary, competitors.length);
    
    return {
      primary_entity: {
        ticker: primaryTicker,
        name: primaryEntity.name,
        sector: primaryEntity.sector || graphResult.primary_entity?.sector,
        subsector: primaryEntity.subsector || graphResult.primary_entity?.subsector,
        avg_rix: primaryScore?.avg_rix || null,
        rix_range: primaryScore ? { min: primaryScore.min_rix, max: primaryScore.max_rix } : null,
        models_analyzed: primaryScore?.models || [],
        latest_metrics: latestMetrics,
      },
      competitors,
      sector_peers: sectorPeers,
      sector_context: {
        sector_name: primaryEntity.sector || graphResult.primary_entity?.sector,
        subsector_name: primaryEntity.subsector || graphResult.primary_entity?.subsector,
        avg_sector_rix: avgSectorRix,
        primary_vs_sector: calculateDelta(primaryScore?.avg_rix, avgSectorRix),
        top_performer: topPerformer,
        bottom_performer: bottomPerformer,
      },
      relationship_summary: relationshipSummary,
      context_metadata: {
        generated_at: graphResult.metadata?.generated_at || new Date().toISOString(),
        traversal_depth: graphResult.metadata?.depth || 2,
        confidence_note: confidenceNote,
      },
    };
  });
}

/**
 * Formats structured context as a string for LLM system prompt injection
 */
export function formatGraphContextForPrompt(contexts: StructuredGraphContext[]): string {
  if (!contexts || contexts.length === 0) {
    return '';
  }
  
  const sections: string[] = [];
  
  for (const ctx of contexts) {
    const lines: string[] = [];
    
    // Primary entity section
    lines.push(`## ENTIDAD PRINCIPAL: ${ctx.primary_entity.name} (${ctx.primary_entity.ticker})`);
    lines.push(`- Sector: ${ctx.primary_entity.sector || 'N/A'}`);
    lines.push(`- Subsector: ${ctx.primary_entity.subsector || 'N/A'}`);
    if (ctx.primary_entity.avg_rix !== null) {
      lines.push(`- RIX Promedio: ${ctx.primary_entity.avg_rix} pts`);
      if (ctx.primary_entity.rix_range) {
        lines.push(`- Rango RIX: ${ctx.primary_entity.rix_range.min} - ${ctx.primary_entity.rix_range.max}`);
      }
    }
    if (ctx.primary_entity.models_analyzed.length > 0) {
      lines.push(`- Modelos analizados: ${ctx.primary_entity.models_analyzed.join(', ')}`);
    }
    
    // Metrics if available - using CANONICAL metric names
    if (Object.values(ctx.primary_entity.latest_metrics).some(v => v !== null)) {
      lines.push('\n### Métricas Detalladas:');
      // CANONICAL metric labels from rixMetricsGlossary.ts
      const metricLabels: Record<string, string> = {
        nvm: 'NVM (Calidad de la Narrativa)',
        drm: 'DRM (Fortaleza de Evidencia)',
        sim: 'SIM (Autoridad de Fuentes)',
        rmm: 'RMM (Actualidad y Empuje)',
        cem: 'CEM (Gestión de Controversias)',
        gam: 'GAM (Percepción de Gobierno)',
        dcm: 'DCM (Coherencia Informativa)',
        cxm: 'CXM (Ejecución Corporativa)',
      };
      for (const [key, value] of Object.entries(ctx.primary_entity.latest_metrics)) {
        if (value !== null) {
          lines.push(`- ${metricLabels[key] || key}: ${value} pts`);
        }
      }
    }
    
    // Competitors section
    if (ctx.competitors.length > 0) {
      lines.push('\n### COMPETIDORES VERIFICADOS (COMPITE_CON):');
      for (const comp of ctx.competitors) {
        const deltaStr = comp.rix_delta !== null 
          ? ` (${comp.rix_delta >= 0 ? '+' : ''}${comp.rix_delta} vs primaria)` 
          : '';
        lines.push(`- ${comp.name} (${comp.ticker}): RIX ${comp.avg_rix || 'N/A'}${deltaStr}`);
      }
    }
    
    // Sector peers section
    if (ctx.sector_peers.length > 0) {
      lines.push('\n### PEERS SECTORIALES (MISMO_SUBSECTOR / MISMO_SECTOR):');
      const subsectorPeers = ctx.sector_peers.filter(p => p.subsector === ctx.primary_entity.subsector);
      const sectorOnlyPeers = ctx.sector_peers.filter(p => p.subsector !== ctx.primary_entity.subsector);
      
      if (subsectorPeers.length > 0) {
        lines.push('*Mismo subsector:*');
        for (const peer of subsectorPeers.slice(0, 5)) {
          lines.push(`- ${peer.name} (${peer.ticker}): RIX ${peer.avg_rix || 'N/A'}`);
        }
      }
      if (sectorOnlyPeers.length > 0) {
        lines.push('*Mismo sector (otro subsector):*');
        for (const peer of sectorOnlyPeers.slice(0, 5)) {
          lines.push(`- ${peer.name} (${peer.ticker}): RIX ${peer.avg_rix || 'N/A'}`);
        }
      }
    }
    
    // Sector context
    if (ctx.sector_context.avg_sector_rix !== null) {
      lines.push('\n### CONTEXTO SECTORIAL:');
      lines.push(`- RIX promedio del sector: ${ctx.sector_context.avg_sector_rix}`);
      if (ctx.sector_context.primary_vs_sector !== null) {
        const comparison = ctx.sector_context.primary_vs_sector >= 0 ? 'por encima' : 'por debajo';
        lines.push(`- ${ctx.primary_entity.name} está ${Math.abs(ctx.sector_context.primary_vs_sector)} pts ${comparison} del promedio sectorial`);
      }
      if (ctx.sector_context.top_performer) {
        lines.push(`- Líder sectorial: ${ctx.sector_context.top_performer.name} (RIX ${ctx.sector_context.top_performer.rix})`);
      }
      if (ctx.sector_context.bottom_performer && ctx.sector_context.bottom_performer.ticker !== ctx.sector_context.top_performer?.ticker) {
        lines.push(`- Rezagado sectorial: ${ctx.sector_context.bottom_performer.name} (RIX ${ctx.sector_context.bottom_performer.rix})`);
      }
    }
    
    // Relationship summary
    lines.push('\n### RESUMEN DEL GRAFO:');
    lines.push(`- Total entidades conectadas: ${ctx.relationship_summary.total_entities}`);
    lines.push(`- Competidores verificados: ${ctx.relationship_summary.verified_competitors}`);
    lines.push(`- Mismo subsector: ${ctx.relationship_summary.same_subsector}`);
    lines.push(`- Mismo sector: ${ctx.relationship_summary.same_sector}`);
    lines.push(`- Entidades con scores RIX: ${ctx.relationship_summary.entities_with_scores}`);
    
    // Confidence note
    lines.push(`\n⚠️ ${ctx.context_metadata.confidence_note}`);
    
    sections.push(lines.join('\n'));
  }
  
  return sections.join('\n\n---\n\n');
}

/**
 * Generates the graph-aware system prompt section
 */
export function getGraphAwarePromptSection(): string {
  return `
## GRAFO DE CONOCIMIENTO EMPRESARIAL

Tienes acceso a un **grafo de conocimiento estructurado** que conecta empresas a través de relaciones verificadas:

### Tipos de Relaciones (edges)

| Relación | Significado | Confianza |
|----------|-------------|-----------|
| COMPITE_CON | Competidor directo verificado manualmente | Alta (0.9) |
| MISMO_SUBSECTOR | Empresa del mismo subsector específico | Media-Alta (0.7) |
| MISMO_SECTOR | Empresa del mismo sector amplio | Media (0.5) |

### Cómo Usar el Grafo

1. **Para comparativas competitivas**: Usa SOLO entidades con relación COMPITE_CON
2. **Para análisis sectorial**: Incluye MISMO_SUBSECTOR y MISMO_SECTOR
3. **Para benchmarking**: Compara RIX de la entidad primaria vs competidores y promedio sectorial
4. **Para detección de oportunidades**: Identifica gaps entre primaria y líder sectorial

### REGLAS CRÍTICAS

- **NUNCA inventes relaciones** que no estén explícitas en el grafo
- **NUNCA asumas competencia** solo porque dos empresas estén en el mismo sector
- Si una conexión no existe, dilo explícitamente: "No hay relación verificada entre X e Y"
- Los competidores COMPITE_CON son la fuente de verdad para comparativas directas
- Las relaciones MISMO_SECTOR son contextuales, no implican competencia directa
`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateDelta(value1: number | null | undefined, value2: number | null | undefined): number | null {
  if (value1 === null || value1 === undefined || value2 === null || value2 === undefined) {
    return null;
  }
  return Math.round((value1 - value2) * 10) / 10;
}

function buildConfidenceNote(summary: { verified_competitors: number; entities_with_scores: number }, competitorCount: number): string {
  if (competitorCount > 0 && summary.entities_with_scores > competitorCount) {
    return 'ALTA CONFIANZA: Competidores verificados + datos RIX completos disponibles.';
  }
  if (competitorCount > 0) {
    return 'CONFIANZA MEDIA: Competidores verificados disponibles, algunos sin scores RIX recientes.';
  }
  if (summary.entities_with_scores > 0) {
    return 'CONFIANZA BAJA: Sin competidores verificados, usando peers de categoría. Las comparativas son contextuales, no competencia directa.';
  }
  return 'CONFIANZA MÍNIMA: Datos limitados. Usar solo para contexto general.';
}
