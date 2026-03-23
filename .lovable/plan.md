

## Auditoría completa: Vector Store, Embeddings y fragilidad del sistema de Skills

### Estado actual del Vector Store

| Fuente | Registros en BD | Documentos vectorizados | Cobertura |
|--------|----------------|------------------------|-----------|
| rix_runs_v2 | 10,423 | 13,277 | 127% (incluye semanas anteriores) |
| rix_runs (V1) | 9,548 | 1,327 | 13.9% |
| corporate_news | 462 | 457 | 98.9% |
| **Total** | | **23,831** | |

**Sí se está vectorizando**, y el embedding usado es `text-embedding-3-small` de OpenAI (1536 dimensiones). Todos los 23,831 documentos tienen embedding (0 sin embedding).

### Problema 1: El embedding `text-embedding-3-small` es correcto pero el uso del Vector Store es marginal

El vector store se usa en 2 sitios del pipeline:
1. **Legacy E1-E6** (línea 8178): busca 30 docs por nombre de empresa para contexto cualitativo
2. **Skills pipeline** (línea 9146): busca 50 docs por la pregunta del usuario

Pero en ambos casos el vector store solo aporta **contexto narrativo complementario**. Los datos numéricos (scores, métricas, rankings) vienen de **consultas SQL directas** a `rix_runs_v2`. Si la consulta SQL falla o no se construye correctamente, el vector store no puede compensar porque no contiene datos estructurados.

### Problema 2: La fragilidad real - El sistema depende de un clasificador regex frágil

La causa raíz de que consultas "inusuales" fallen es que el pipeline de skills usa una cadena de `if/else if` con patrones regex estáticos (`RANKING_PATTERNS_EDGE`, `EVOLUTION_PATTERNS_EDGE`, etc.) para decidir qué skill ejecutar. Si una consulta no coincide exactamente con los patrones, el sistema:
- Cae al intent `general_question` con confianza 0.3
- No ejecuta `skillGetCompanyRanking` ni `skillGetCompanyScores`
- El DataPack queda vacío (`snapshot:0`)
- El LLM genera un informe "inventado" sin datos

El Semantic Bridge (thesaurus de ~500 palabras) ayuda pero es **determinístico**: solo funciona si el usuario usa exactamente una de las palabras del diccionario. Cualquier paráfrasis, sinónimo nuevo o combinación inusual lo rompe.

### Problema 3: La función `match_documents` no filtra por metadata

En la línea 9149, el `filter: {}` significa que la búsqueda vectorial devuelve documentos de **cualquier empresa, modelo o semana**. Cuando se pregunta por "ranking IBEX de Gemini", el vector store devuelve los 50 docs más similares semánticamente, que pueden ser de cualquier empresa y modelo. No hay filtrado por `model_name`, `ibex_family_code` ni `ticker`.

### Propuesta de solución: 3 niveles

**Nivel 1 — Fallback LLM para clasificación (impacto inmediato)**
Cuando el clasificador regex tiene confianza < 0.7, enviar la pregunta a `gpt-4o-mini` con un prompt estructurado que devuelva `{intent, filters, entities}` en JSON. Esto cubre todas las consultas "inusuales" sin necesidad de ampliar el diccionario infinitamente.

Coste: ~$0.001 por consulta adicional. Latencia: ~500ms.

Cambio en: `supabase/functions/chat-intelligence/index.ts` — función `interpretQueryEdge` — añadir bloque de fallback LLM tras la clasificación regex.

**Nivel 2 — Filtrado inteligente del Vector Store**
Pasar filtros de metadata a `match_documents` según el contexto de la consulta:
- Si hay ticker detectado: `filter: { ticker: "BBVA" }`
- Si hay modelo: filtrar post-query por `metadata.ai_model`
- Si hay sector: `filter: { sector_category: "Banca y Servicios Financieros" }`

Cambio en: `supabase/functions/chat-intelligence/index.ts` — las 2 llamadas a `match_documents` (líneas 8178 y 9146).

**Nivel 3 — Migrar a `text-embedding-3-large` (opcional, a futuro)**
El modelo actual (`text-embedding-3-small`, 1536 dims) tiene buena relación calidad/precio. `text-embedding-3-large` (3072 dims) mejoraría la relevancia semántica pero requiere re-indexar los 23,831 documentos ($4-5 de coste) y duplicar el almacenamiento vectorial. No es prioritario ahora.

### Recomendación inmediata

Implementar **Nivel 1** (fallback LLM) y **Nivel 2** (filtrado de metadata) en `chat-intelligence/index.ts`. El fallback LLM resuelve de raíz el problema de fragilidad: cualquier consulta en lenguaje natural se clasifica correctamente por un LLM cuando el regex falla, eliminando la necesidad de mantener un diccionario infinito.

### Archivos a modificar
- `supabase/functions/chat-intelligence/index.ts`:
  - `interpretQueryEdge`: añadir fallback a `gpt-4o-mini` cuando confianza < 0.7
  - Llamadas a `match_documents`: pasar filtros de metadata contextuales
- Redesplegar `chat-intelligence`

### Sobre MCP y Vector Store
El MCP (Model Context Protocol) no es necesario para mejorar el vector store. El vector store ya está correctamente poblado. Lo que falla es la **capa de interpretación** (regex) que decide qué datos buscar, no la capa de almacenamiento vectorial.

