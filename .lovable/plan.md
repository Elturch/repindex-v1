

## Plan: Poblar rix_semantic_glossary con el Diccionario Semántico completo

### Alcance

El documento contiene ~350+ entradas distribuidas en 9 secciones + 2 apéndices + diccionario corporativo (~108 términos). Todo debe insertarse en `rix_semantic_glossary` con categorías que permitan al `lookupGlossaryTerms` resolver cualquier consulta conversacional.

### Estructura de categorías

| Categoría | Sección del doc | Ejemplo |
|---|---|---|
| `agrupacion` | §1 Agrupaciones conceptuales | "grupos hospitalarios" → lista de issuer_ids |
| `marca_matriz` | §2 Marcas → empresa | "Zara" → Inditex (ITX) |
| `nombre_historico` | §3 Nombres anteriores | "Cepsa" → Moeve |
| `acronimo` | §4 Acrónimos | "SOCIMI" → inmobiliarias |
| `sector_coloquial` | §5 Términos sectoriales | "farma" → issuers específicos |
| `filtro` | §6 Filtros conceptuales | "cotizadas" → cotiza_en_bolsa=true |
| `persona_empresa` | §7 Personas → empresa | "Amancio Ortega" → ITX |
| `propiedad` | §8 Relaciones propiedad | "Quirónsalud" → Fresenius |
| `no_disponible` | Apéndice B | "Abengoa" → en liquidación |
| `reputacion_algoritmica` | Diccionario corp. | "Brecha narrativa" |
| `optimizacion` | Diccionario corp. | "GEO" |
| `comunicacion` | Diccionario corp. | "Portavoz" |
| `corporativo` | Diccionario corp. | "OPA", "M&A" |
| `financiero` | Diccionario corp. | "Profit warning" |
| `legal` | Diccionario corp. | "Litigio" |
| `institucional` | Diccionario corp. | "Lobby" |
| `digital` | Diccionario corp. | "Fake news" |
| `esg` | Diccionario corp. | "Huella de carbono" |
| `pericial` | Diccionario corp. | "Informe pericial" |
| `roles` | Diccionario corp. | "CEO", "CFO" |

### Implementación

**Paso 1 — Script de inserción masiva** (usando `psql` vía `code--exec`)

Generar un script SQL con ~350 INSERT statements. Cada entrada tendrá:
- `term`: término principal (ej. "grupos hospitalarios")
- `term_en`: equivalente en inglés si aplica
- `aliases`: array de sinónimos (ej. `{"hospitales privados","sanidad privada","cadenas hospitalarias"}`)
- `definition`: definición + issuer_ids/tickers relevantes para que el LLM los use
- `category`: una de las categorías de arriba
- `repindex_relevance`: cómo conecta con RepIndex (para agrupaciones: los issuer_ids; para personas: la empresa)
- `related_metrics`: métricas RIX relacionadas si aplica

**Paso 2 — Ampliar categorías en CATEGORY_TO_INTENT**

En `chat-intelligence/index.ts` (línea 2157), añadir las nuevas categorías al mapeo:
```
agrupacion → ranking (para buscar varias empresas)
marca_matriz → company_analysis
nombre_historico → company_analysis
persona_empresa → company_analysis
sector_coloquial → sector_comparison
filtro → ranking
propiedad → company_analysis
no_disponible → general_question (respuesta explicativa)
```

**Paso 3 — Mejorar lookupGlossaryTerms para nuevos tipos**

Cuando se detecta una categoría `agrupacion`, `marca_matriz`, `nombre_historico` o `persona_empresa`, el sistema debe:
- Extraer los tickers/issuer_ids del campo `repindex_relevance`
- Inyectarlos como entidades en `interpret.entities` y `interpret.filters`
- Para `no_disponible`: generar una respuesta directa sin intentar buscar datos

### Volumen estimado

~350 registros. Coste: 0 (INSERT directo en BD). Sin impacto en rendimiento porque el glossary se cachea 10 min.

### Archivos a modificar

1. Script de inserción SQL ejecutado con `psql` (datos)
2. `supabase/functions/chat-intelligence/index.ts`:
   - `CATEGORY_TO_INTENT` → añadir 8 categorías nuevas
   - `lookupGlossaryTerms` → extraer tickers de `repindex_relevance` para inyectar en filters
   - Bloque glossary fallback → manejar `no_disponible` con respuesta directa

