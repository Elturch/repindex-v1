

# Seccion Tecnica Informativa en /admin (Corregido)

## Correcciones aplicadas

- **35 fases** (no 34) en el barrido semanal
- **179 empresas** en el censo actual (no 174), incluyendo registros historicos

## Nuevo archivo: `src/components/admin/TechnicalDocPanel.tsx`

Componente con 4 secciones colapsables (Accordion) con documentacion tecnica estatica:

### Seccion 1: Arquitectura del Agente RIX

- **Tipo**: RAG hibrido de produccion combinando 5 patrones:
  - **Adaptive RAG**: Enrutador de complejidad (`categorizeQuestion`) con 3 niveles (quick/complete/exhaustive)
  - **GraphRAG**: Traversal de relaciones COMPITE_CON, MISMO_SUBSECTOR, MISMO_SECTOR
  - **Corrective RAG (CRAG)**: Guardrails de calidad (validacion IBEX-35, seleccion inteligente de periodo con umbral minimo de 10 registros)
  - **Fusion RAG**: Recuperacion paralela de 7 fuentes (Keywords, Vector Store, Rankings, Snapshots corporativos, Noticias, Grafo, Estadisticas)
  - **Conversational RAG**: Memoria de sesion via `conversationHistory`
- **Flujo de datos**: Pregunta -> Categorizacion -> Deteccion de empresas -> Carga unificada (rix_runs + rix_runs_v2) -> Contexto -> LLM -> Respuesta
- **Anti-alucinacion**: Filtrado off-topic, pre-filtrado por modelo/indice, ordenamiento determinista, guardrail IBEX-35
- **LLMs**: OpenAI GPT-4o (primario), Google Gemini (fallback)
- **Modo Rix Press**: Periodista integrado para informes editoriales

### Seccion 2: Barrido Semanal de Datos (Domingos)

- **Cuando**: Domingos 00:00 UTC, **35 fases** escalonadas cada 5 minutos
- **Que hace**: Evalua **179 empresas** con 6 modelos de IA
- **Como funciona**:
  1. Cada fase procesa ~5 empresas (35 fases x ~5 = 175+ empresas con margen)
  2. Para cada empresa: busqueda web (rix-search-v2) + analisis IA (rix-analyze-v2) con 8 metricas RIX
  3. Cadencia hibrida: 3 simultaneas (primero 70%) -> 1 (ultimo 30%)
  4. Reintentos automaticos hasta 1000 intentos por empresa
  5. Watchdog cada 5 minutos como red de seguridad
- **Post-barrido automatico**:
  1. 100% -> auto_sanitize
  2. Sanitizado OK -> auto_populate_vectors
  3. Vectores OK -> auto_generate_newsroom
- **Duracion tipica**: 11-22 horas (baseline 17h)
- **Tablas**: sweep_progress, rix_runs_v2, rix_trends

### Seccion 3: Conexiones con IAs

Tabla con 8 proveedores IA + 3 servicios auxiliares:

| Proveedor | Modelo | Uso principal | Secret |
|-----------|--------|---------------|--------|
| OpenAI | GPT-4o | Agente Rix, analisis RIX, noticias | OPENAI_API_KEY |
| Google | Gemini 2.0 Flash | Fallback Agente, audit emisores, scraping | GOOGLE_GEMINI_API_KEY |
| Perplexity | Sonar Pro | Busqueda web en barrido RIX | PERPLEXITY_API_KEY |
| DeepSeek | DeepSeek V3 | Modelo analisis RIX | DEEPSEEK_API_KEY |
| xAI | Grok 3 | Modelo analisis RIX | XAI_API_KEY |
| Alibaba | Qwen Max | Modelo analisis RIX | DASHSCOPE_API_KEY |
| Anthropic | Claude | Agente comercial | ANTHROPIC_API_KEY |
| Firecrawl | - | Scraping webs corporativas | FIRECRAWL_API_KEY |

Otros: Resend (emails), Tavily (busqueda web), EODHD (precios acciones)

### Seccion 4: CRONs del Sistema

**Barrido RIX (35 jobs + watchdog)**
- `rix-sweep-phase-01` a `rix-sweep-phase-35`: Domingos 00:00-02:50 UTC, cada 5 min
- `rix-sweep-watchdog-15min`: Cada 5 min, 24/7

**Vector Store**
- `populate-vector-store-weekly`: Domingos 23:00 UTC
- Continuaciones cada 5 min hasta completar

**Noticias**
- `generate-news-story-weekly`: Lunes 06:00 UTC

**Corporate Scraping**
- `corporate-scrape-watchdog-15min`: Cada 15 min

**Mantenimiento**
- `refresh-issuer-status-monthly`: Dia 1 cada mes, 03:00 UTC

## Cambios en Admin.tsx

1. Importar `TechnicalDocPanel`
2. Nuevo `TabsTrigger` con icono `BookOpen` y texto "Docs Tecnica"
3. `TabsContent` renderizando `<TechnicalDocPanel />`

## Implementacion

- Componentes existentes: Card, Accordion, Badge, Table
- Todo estatico, sin llamadas a API
- Iconos lucide-react: Brain, RefreshCw, Cpu, Clock, BookOpen
- Sin cambios en BD ni edge functions

