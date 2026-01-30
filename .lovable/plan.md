# Arquitectura Híbrida Vector + Grafo para Agente Rix

## Estado de Implementación: ✅ COMPLETADO

### Resumen

El Agente Rix ha sido evolucionado de un sistema RAG puramente vectorial a una **arquitectura híbrida Vector + Grafo** que combina:

1. **Vector Search** (existente): Localiza documentos relevantes por similitud semántica
2. **Graph Expansion** (NUEVO): Descubre relaciones verificadas entre entidades empresariales
3. **Structured Context** (NUEVO): Proporciona al LLM una vista estructurada del ecosistema corporativo

---

## Componentes Implementados

### 1. Funciones PostgreSQL de Grafo

| Función | Propósito | Estado |
|---------|-----------|--------|
| `expand_entity_graph(ticker, depth)` | Traversal de grafo desde empresa semilla | ✅ |
| `expand_entity_graph_with_scores(ticker, depth, weeks)` | Grafo + scores RIX de todas las entidades | ✅ |
| `get_sector_graph(sector, include_scores)` | Grafo completo de un sector | ✅ |

**Tipos de Relaciones:**
- `COMPITE_CON` (confianza 0.9): Competidores verificados de `verified_competitors`
- `MISMO_SUBSECTOR` (confianza 0.7): Peers del mismo subsector específico
- `MISMO_SECTOR` (confianza 0.5): Empresas del mismo sector amplio

### 2. Integración en chat-intelligence

**Flujo Actualizado:**
```
Pregunta Usuario
      │
      ├─────────────────┬────────────────────┐
      ▼                 ▼                    ▼
 Vector Search   Entity Detection   Graph Expansion
      │                 │                    │
      ▼                 ▼                    ▼
┌─────────────────────────────────────────────────┐
│     STRUCTURED CONTEXT (JSON para LLM)          │
│  - primary_entity + scores                      │
│  - competitors (COMPITE_CON)                    │
│  - sector_peers (MISMO_SUBSECTOR/SECTOR)        │
│  - sector_context (avg, top/bottom performer)   │
│  - relationship_summary                         │
└─────────────────────────────────────────────────┘
      │
      ▼
   LLM (GPT-4o / Gemini)
   Razona sobre ESTRUCTURA, no texto plano
```

### 3. Graph-Aware System Prompt

El system prompt ahora incluye:
- Explicación de tipos de relaciones
- Reglas para comparativas (solo COMPITE_CON para competencia directa)
- Instrucciones para benchmarking con grafo
- Prohibición de inventar relaciones no existentes

### 4. Frontend Utilities

**Archivo:** `src/lib/graphContextBuilder.ts`

Tipos y funciones para trabajar con el grafo en frontend:
- `GraphEntity`, `EntityScore`, `GraphExpansionResult`
- `buildStructuredContext()`: Transforma grafo en contexto estructurado
- `formatGraphContextForPrompt()`: Formatea para inyección en prompt
- `getGraphAwarePromptSection()`: Sección de instrucciones del grafo

---

## Beneficios Logrados

| Métrica | Antes | Después |
|---------|-------|---------|
| Preguntas multi-empresa | Contexto fragmentado | Grafo conecta entidades |
| Descubrimiento de relaciones | Implícito (LLM adivina) | Explícito (edges verificados) |
| Comparativas sectoriales | Manual (sin estructura) | Automático (scores + rankings) |
| Alucinaciones relacionales | Frecuentes | Controladas (reglas estrictas) |
| Transparencia de razonamiento | Baja | Alta (justificación de tier usado) |

---

## Ejemplo de Uso

**Pregunta:** "¿Cómo afectó la controversia de Grifols a la percepción del sector farmacéutico?"

**Flujo Anterior (Vector-Only):**
1. Vector search → documentos de "Grifols"
2. LLM "adivina" conexiones con PharmaMar, Rovi, etc.

**Flujo Actual (Híbrido):**
1. Vector search → documentos de "Grifols"
2. Graph expansion → `(Grifols)-[COMPITE_CON]->(PharmaMar, Rovi)` + peers de subsector "Farmacéutico"
3. Scores RIX de todas las entidades conectadas
4. LLM recibe grafo estructurado con:
   - Competidores verificados y sus scores
   - Promedio sectorial
   - Líder y rezagado del sector
   - Delta vs competidores

---

## Notas de Performance

- Graph expansion con `depth=2`: ~50-100ms
- Se ejecuta en paralelo con vector search
- Solo se activa para `complete` y `exhaustive` (no `quick`)
- Máximo 3 empresas detectadas para expansión simultánea

---

## Próximas Mejoras Potenciales

1. **Caché de grafos**: Cachear por ticker + semana para respuestas más rápidas
2. **Grafos temporales**: Añadir edges `PRECEDIDA_POR` para tendencias históricas
3. **Migración a Apache AGE**: Si escala > 10K empresas, considerar grafo nativo
4. **Visualización de grafos**: Componente frontend para mostrar relaciones al usuario
