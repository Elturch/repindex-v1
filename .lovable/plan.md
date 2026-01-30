
# Reflexión Arquitectónica: De RAG Vectorial a Sistema de Conocimiento Híbrido

## Estado Actual del Agente Rix

### Arquitectura Existente

El Agente Rix opera actualmente como un sistema **RAG tradicional basado exclusivamente en vectores**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO ACTUAL (Vector-Only RAG)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pregunta Usuario                                                           │
│        │                                                                    │
│        ▼                                                                    │
│  ┌──────────────┐     ┌─────────────────────────────────────────────────┐  │
│  │ Embedding    │────►│ match_documents(query, count=200)               │  │
│  │ OpenAI       │     │ Búsqueda por similaridad coseno                 │  │
│  └──────────────┘     │ documents (11,862 documentos)                   │  │
│                       └───────────────────────┬─────────────────────────┘  │
│                                               │                             │
│                                               ▼                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ RECUPERACIÓN PARALELA (sin conexión entre fuentes)                 │    │
│  │                                                                    │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │    │
│  │  │ rix_runs        │  │ corporate_news  │  │ corporate_      │    │    │
│  │  │ rix_runs_v2     │  │ (noticias)      │  │ snapshots       │    │    │
│  │  │ (scores RIX)    │  │                 │  │ (CEOs, datos)   │    │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘    │    │
│  │           │                    │                    │              │    │
│  │           │ SQL directo        │ SQL directo        │ SQL directo  │    │
│  │           │ (sin relaciones)   │ (sin relaciones)   │ (sin rels)   │    │
│  │           ▼                    ▼                    ▼              │    │
│  │      ┌──────────────────────────────────────────────────────┐     │    │
│  │      │         CONCATENACIÓN TEXTUAL (sin estructura)       │     │    │
│  │      │         "📰 NOTICIAS: ... 📊 DATOS: ..."             │     │    │
│  │      └──────────────────────────────────────────────────────┘     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│                           ┌─────────────────┐                               │
│                           │   LLM (GPT-4o)  │                               │
│                           │   Razona sobre  │                               │
│                           │   texto plano   │                               │
│                           └─────────────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Métricas del Sistema Actual

| Componente | Estado |
|------------|--------|
| Documentos vectorizados | 11,862 |
| Empresas indexadas | 174 |
| Dimensiones embedding | 1,536 (text-embedding-3-small) |
| Relaciones competidor verificadas | 32 (tabla) + 122 (campo JSONB) |
| Modelos IA integrados | 6 (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen) |

### Fortalezas Actuales

1. **Búsqueda semántica funcional**: `match_documents` encuentra contexto relevante
2. **Datos estructurados ricos**: 8 métricas RIX por empresa/semana/modelo
3. **Multimodalidad de fuentes**: Combina 6 IAs + noticias corporativas + snapshots
4. **Sistema de competidores en capas**: TIER 0-5 con priorización inteligente

### Limitaciones Críticas (Punto de Dolor)

El texto que compartes diagnostica perfectamente las debilidades actuales:

| Problema | Manifestación en Agente Rix |
|----------|----------------------------|
| "Un sistema RAG que solo recupera texto siempre será frágil" | El contexto se construye concatenando strings, perdiendo estructura relacional |
| "Funciona hasta que una pregunta abarca más de un documento" | Preguntas multi-empresa o multi-semana fragmentan el contexto |
| "Los vectores encuentran las agujas" | ✓ Esto funciona bien con `match_documents` |
| "Los gráficos explican su importancia" | ✗ **NO existe**: Las relaciones competidor, sector, temporal son implícitas |

**Ejemplo concreto de fallo:**

Pregunta: *"¿Cómo afectó la controversia de Grifols a la percepción del sector farmacéutico español?"*

**Flujo actual:**
1. Vector search encuentra documentos de "Grifols"
2. Carga rix_runs de Grifols
3. **PROBLEMA**: No hay camino para descubrir que Grifols impacta a PharmaMar, Rovi, Almirall
4. El LLM recibe contexto fragmentado y debe "adivinar" las conexiones

**Flujo ideal (con grafo):**
1. Vector search → Grifols
2. Grafo traversal → `(Grifols)-[COMPITE_CON]->(PharmaMar, Rovi)` + `(Grifols)-[PERTENECE_A]->(Sector Salud)`
3. El LLM recibe un subgrafo estructurado con todas las entidades relacionadas

---

## Propuesta: Arquitectura Híbrida Vector + Grafo

### Principio Rector

> "Las bases de datos vectoriales se utilizan para localizar lo que podría importar, mientras que las bases de datos de grafos se utilizan para determinar cómo se conectan."

### Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA HÍBRIDA VECTOR + GRAFO                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pregunta Usuario                                                           │
│        │                                                                    │
│        ├──────────────────────────────────────────────────────┐             │
│        ▼                                                      ▼             │
│  ┌──────────────────┐                              ┌────────────────────┐   │
│  │ 1. VECTOR SEARCH │                              │ 2. ENTITY DETECT   │   │
│  │ "Localizar qué   │                              │ Regex + NER        │   │
│  │ podría importar" │                              │ Detectar empresas  │   │
│  └────────┬─────────┘                              └─────────┬──────────┘   │
│           │                                                  │              │
│           │ Documentos relevantes                           │ Entidades    │
│           │ (texto cualitativo)                             │ detectadas   │
│           ▼                                                  ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    3. GRAPH EXPANSION                               │   │
│  │                    "Determinar cómo se conectan"                    │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │                     KNOWLEDGE GRAPH                           │ │   │
│  │  │                                                               │ │   │
│  │  │   (Grifols)──COMPITE_CON───>(PharmaMar)                      │ │   │
│  │  │      │                           │                            │ │   │
│  │  │      │                           │                            │ │   │
│  │  │   PERTENECE_A              PERTENECE_A                        │ │   │
│  │  │      │                           │                            │ │   │
│  │  │      ▼                           ▼                            │ │   │
│  │  │   (Sector Salud)◄──PERTENECE_A──(Rovi)                       │ │   │
│  │  │      │                                                        │ │   │
│  │  │      │                                                        │ │   │
│  │  │   TIENE_SCORE_EN                                              │ │   │
│  │  │      │                                                        │ │   │
│  │  │      ▼                                                        │ │   │
│  │  │   (Semana 2025-01-20)──PRECEDIDA_POR──>(Semana 2025-01-13)   │ │   │
│  │  │                                                               │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │  Traversal Query:                                                   │   │
│  │  MATCH (e:Empresa {ticker: 'GRF'})                                 │   │
│  │        -[:COMPITE_CON*1..2]-(competidores)                         │   │
│  │        -[:PERTENECE_A]->(sector)                                   │   │
│  │        -[:TIENE_SCORE_EN]->(semana)                                │   │
│  │  RETURN e, competidores, sector, semana                            │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  4. STRUCTURED CONTEXT BUILDER                      │   │
│  │                                                                     │   │
│  │  {                                                                  │   │
│  │    "primary_entity": { "name": "Grifols", "rix": 58, ... },        │   │
│  │    "related_entities": [                                            │   │
│  │      { "name": "PharmaMar", "relation": "COMPITE_CON", "rix": 72 },│   │
│  │      { "name": "Rovi", "relation": "MISMO_SECTOR", "rix": 65 }     │   │
│  │    ],                                                               │   │
│  │    "sector_context": { "name": "Salud", "avg_rix": 64 },           │   │
│  │    "temporal_context": { "trend": "down", "delta": -5 },           │   │
│  │    "qualitative_context": [ /* vectorDocs */ ]                      │   │
│  │  }                                                                  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│                  ┌─────────────────┐                                        │
│                  │   LLM (GPT-4o)  │                                        │
│                  │   Opera con     │                                        │
│                  │   vista         │                                        │
│                  │   ESTRUCTURADA  │                                        │
│                  └─────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementación: Opciones Tecnológicas

### Opción A: Graph DB Nativo (Neo4j Aura / Memgraph)

**Ventajas:**
- Lenguaje Cypher optimizado para traversals complejos
- Visualización nativa de relaciones
- Escalabilidad para grafos grandes

**Desventajas:**
- Coste adicional (~$65-200/mes para Aura)
- Sincronización Supabase ↔ Neo4j
- Complejidad operativa

### Opcion B: PostgreSQL con Apache AGE (Recomendada)

**Ventajas:**
- Se mantiene dentro de Supabase (sin infraestructura adicional)
- Apache AGE es extensión oficial para grafos en PostgreSQL
- Compatible con Cypher queries
- Sin coste adicional

**Desventajas:**
- Performance inferior a Neo4j para traversals muy profundos
- Menos maduro que Neo4j

### Opcion C: Grafo Virtual (Materializado en queries)

**Ventajas:**
- Zero infrastructure change
- Implementable inmediatamente
- Usa las tablas existentes como fuente de verdad

**Desventajas:**
- Performance subóptima para grafos complejos
- Queries SQL más verbosas

---

## Plan de Implementación (Opcion C - Pragmática)

Dado el contexto de Lovable, recomiendo **Opción C** como MVP, evolucionable a Opción B.

### Fase 1: Grafo Virtual con Funciones PostgreSQL

Crear funciones RPC que simulen traversals de grafo usando las tablas existentes.

**Nueva función: `expand_entity_graph`**

```sql
CREATE OR REPLACE FUNCTION expand_entity_graph(
  p_ticker TEXT,
  p_depth INT DEFAULT 2
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  WITH RECURSIVE entity_graph AS (
    -- Seed: entidad inicial
    SELECT 
      ticker,
      issuer_name,
      sector_category,
      subsector,
      0 as depth,
      ARRAY[ticker] as path,
      'ORIGIN' as relation_type
    FROM repindex_root_issuers
    WHERE ticker = p_ticker
    
    UNION ALL
    
    -- Expansion: competidores verificados
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      eg.depth + 1,
      eg.path || r.ticker,
      'COMPITE_CON'
    FROM entity_graph eg
    CROSS JOIN LATERAL (
      SELECT c.value::text as competitor_ticker
      FROM repindex_root_issuers ri,
           LATERAL jsonb_array_elements_text(ri.verified_competitors) c
      WHERE ri.ticker = eg.ticker
    ) comp
    JOIN repindex_root_issuers r ON r.ticker = comp.competitor_ticker
    WHERE eg.depth < p_depth
      AND NOT r.ticker = ANY(eg.path)
      
    UNION ALL
    
    -- Expansion: mismo subsector
    SELECT 
      r.ticker,
      r.issuer_name,
      r.sector_category,
      r.subsector,
      eg.depth + 1,
      eg.path || r.ticker,
      'MISMO_SUBSECTOR'
    FROM entity_graph eg
    JOIN repindex_root_issuers r ON r.subsector = eg.subsector
    WHERE eg.depth < p_depth
      AND NOT r.ticker = ANY(eg.path)
      AND eg.relation_type = 'ORIGIN'
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'ticker', ticker,
      'name', issuer_name,
      'sector', sector_category,
      'subsector', subsector,
      'depth', depth,
      'relation', relation_type
    )
  ) INTO result
  FROM entity_graph
  WHERE depth <= p_depth;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

### Fase 2: Enriquecer con Scores RIX

**Nueva función: `expand_entity_graph_with_scores`**

```sql
CREATE OR REPLACE FUNCTION expand_entity_graph_with_scores(
  p_ticker TEXT,
  p_depth INT DEFAULT 2,
  p_weeks INT DEFAULT 4
)
RETURNS JSONB AS $$
  -- Combina expand_entity_graph con:
  -- - Últimos N scores RIX por modelo
  -- - Tendencia (delta vs semana anterior)
  -- - Métricas destacadas (min/max)
$$
```

### Fase 3: Integrar en chat-intelligence

Modificar el flujo en `chat-intelligence/index.ts`:

```typescript
// ANTES (actual)
const vectorDocs = await supabaseClient.rpc('match_documents', {...});
const rixData = await fetchUnifiedRixData({...});
// Concatenar todo en texto plano

// DESPUÉS (con grafo)
// 1. Vector search (sin cambios)
const vectorDocs = await supabaseClient.rpc('match_documents', {...});

// 2. Detectar entidades (sin cambios, ya existe)
const detectedCompanies = detectCompanies(question, companiesCache);

// 3. NUEVO: Expandir grafo para cada entidad detectada
const entityGraphs = await Promise.all(
  detectedCompanies.slice(0, 3).map(c => 
    supabaseClient.rpc('expand_entity_graph_with_scores', {
      p_ticker: c.ticker,
      p_depth: 2,
      p_weeks: 4
    })
  )
);

// 4. NUEVO: Construir contexto estructurado (no texto plano)
const structuredContext = buildStructuredContext({
  primaryEntities: detectedCompanies,
  entityGraphs,
  vectorDocs,
  qualitativeContext: vectorStoreContext
});

// 5. Pasar JSON estructurado al LLM
const systemPrompt = `
Tienes acceso a un grafo de conocimiento estructurado:
${JSON.stringify(structuredContext, null, 2)}

Las relaciones entre entidades están explícitas.
Usa esta estructura para razonar sobre conexiones.
`;
```

### Fase 4: Prompt Engineering para Grafos

Actualizar el system prompt para que el LLM "entienda" la estructura:

```typescript
const GRAPH_AWARE_SYSTEM_PROMPT = `
Eres un analista de inteligencia reputacional con acceso a un GRAFO DE CONOCIMIENTO.

## Estructura del Grafo

El contexto incluye:
- **primary_entity**: La empresa principal de la consulta
- **related_entities**: Entidades conectadas con tipo de relación:
  - COMPITE_CON: Competidores directos verificados
  - MISMO_SUBSECTOR: Empresas del mismo subsector
  - MISMO_SECTOR: Empresas del mismo sector (más amplio)
- **temporal_edges**: Conexiones temporales (semana actual → anterior)
- **qualitative_context**: Documentos vectoriales relevantes

## Cómo Usar el Grafo

1. Para comparativas: Sigue edges COMPITE_CON
2. Para tendencias sectoriales: Sigue edges MISMO_SECTOR
3. Para evolución temporal: Sigue edges TEMPORAL
4. Para contexto cualitativo: Usa qualitative_context

NUNCA inventes relaciones que no estén en el grafo.
Si una conexión no existe, dilo explícitamente.
`;
```

---

## Beneficios Esperados

| Métrica | Antes (Vector-Only) | Después (Híbrido) |
|---------|---------------------|-------------------|
| Preguntas multi-empresa | Fragmentadas | Coherentes |
| Descubrimiento de relaciones | Implícito | Explícito |
| Comparativas sectoriales | Manual | Automático |
| Transparencia de razonamiento | Baja | Alta |
| Halluncinaciones relacionales | Frecuentes | Controladas |

---

## Archivos a Crear/Modificar

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| **NUEVO** `supabase/migrations/XXXX_graph_functions.sql` | Migration | Funciones `expand_entity_graph*` |
| `supabase/functions/chat-intelligence/index.ts` | Modificar | Integrar graph expansion en flujo RAG |
| **NUEVO** `src/lib/graphContextBuilder.ts` | Crear | Construir contexto estructurado desde grafo |

---

## Consideraciones Técnicas

### Performance

- Graph expansion con `depth=2` en ~150 empresas: ~50-100ms
- Cacheable por ticker + semana
- No bloquea flujo principal (puede ejecutarse en paralelo con vector search)

### Escalabilidad

- Opción C (grafo virtual) escala hasta ~10K empresas
- Para mayor escala, migrar a Apache AGE (Opción B)

### Compatibilidad

- 100% retrocompatible: el flujo actual sigue funcionando
- Graph context es aditivo, no sustitutivo

---

## Resultado Final

Transformar el Agente Rix de un "buscador de agujas" a un **sistema de conocimiento** que:

1. **Encuentra** las entidades relevantes (Vector Search - ya existe)
2. **Conecta** las entidades entre sí (Graph Expansion - nuevo)
3. **Enriquece** con contexto temporal y cualitativo (ya existe)
4. **Razona** sobre una vista estructurada, no texto plano (mejorado)

Esto alinea RepIndex con la arquitectura descrita: "Los vectores encuentran las agujas y los gráficos explican su importancia."
