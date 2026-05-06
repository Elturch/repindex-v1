## Objetivo

En el Visor (`/visor`), cuando el usuario seleccione una empresa que tenga rellena la columna `verified_competitors` (competencia directa) en `repindex_root_issuers`, ofrecer un botón para **añadir esa competencia directa** a la selección de tickers de un solo clic.

## Comportamiento

1. Bajo el bloque "Empresa / Ticker", aparecerá una nota contextual cuando **al menos una** de las empresas seleccionadas tenga competidores verificados.
2. La nota lista los competidores propuestos (por nombre legible si existe en el universo, ticker en su defecto), excluyendo los que ya estén seleccionados.
3. Botón **"+ Añadir competencia directa (N)"** que añade esos tickers a `state.tickers` (origen `user-set`).
4. Si hay varias empresas seleccionadas con competidores, se unifica el conjunto (deduplicado).
5. Si todos los competidores ya están seleccionados, el bloque no se muestra.
6. Si la empresa seleccionada no tiene competidores en BBDD, no aparece nada (consistente con la regla de memoria: nunca rellenar competidores por sector).

## Cambios

### 1. `src/hooks/useCompanies.ts`
- Añadir `verified_competitors?: string[] | null` al interface `Company`.
- Incluir `verified_competitors` en el `select(...)` de Supabase.

### 2. `src/lib/reports/coherenceEngine.ts`
- Añadir `verified_competitors?: string[] | null` al interface `CompanyMeta` (sólo tipo, sin lógica nueva — se respeta la regla anti-fallback).

### 3. `src/pages/RixReports.tsx`
- En el mapeo de `companies → CompanyMeta` propagar el campo `verified_competitors` (Casteo: si llega como `unknown[]`/jsonb, normalizar a `string[]`).

### 4. `src/components/reports/FilterPanel.tsx`
- Tras `<FilterBlock title="Empresa / Ticker">`, calcular `competitorSuggestions`:
  - Para cada ticker en `state.tickers.value`, leer `byTicker.get(t)?.verified_competitors`.
  - Unión, filtrar los ya presentes en `state.tickers.value`, mantener sólo los que existan en `companies` (por si hay tickers obsoletos).
- Si `competitorSuggestions.length > 0`, renderizar un panel compacto dentro del mismo `FilterBlock` (debajo del `MultiChipSelect`) con:
  - Texto: "Competencia directa verificada de tu selección:"
  - Lista chips read-only con nombre + ticker
  - Botón `+ Añadir competencia directa (N)` que llama:
    `setState(setFilter(state, "tickers", [...state.tickers.value, ...competitorSuggestions]))`

### 5. Sin cambios en backend
- No se toca `chat-intelligence-v2`. El agente ya consume `verified_competitors` por su lado; aquí sólo enriquecemos la selección del usuario antes de compilar la pregunta.
- La pregunta resultante seguirá listando empresas concretas, lo que mantiene la coherencia con la regla "nunca asumir competidores de sector".

## Validación

- Seleccionar **SAN**: aparece la barra con BBVA, CABK, SAB, BKT, UNI y botón "Añadir competencia directa (5)".
- Click en el botón → los 5 tickers se añaden y la barra desaparece (todos presentes).
- Seleccionar una empresa sin `verified_competitors`: no se muestra nada.
