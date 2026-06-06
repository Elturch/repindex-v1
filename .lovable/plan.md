## Objetivo

Eliminar la regresión sistémica de R20 (acrónimos sueltos en fichas de empresa) con un parche **determinista post-LLM**, sin tocar prompts, glosario ni R21-R25.

## Cambios (sub-commit atómico, 2 archivos)

### 1. `supabase/functions/chat-intelligence-v2/prompts/narrativeQuality.ts` (modificado)

Añadir al final del archivo, **sin tocar** la export `NARRATIVE_QUALITY_PROMPT` ni el diccionario de la regla 20 del prompt:

- **Constante local** `R20_GLOSSARY_MAP: Record<string, string>` espejo exacto del diccionario canónico ya embebido en la regla 20:
  - `NVM → Calidad de la Narrativa`
  - `DRM → Fortaleza de Evidencia`
  - `SIM → Autoridad de Fuentes`
  - `RMM → Actualidad y Empuje Mediático`
  - `CEM → Gestión de Controversias`
  - `GAM → Percepción de Gobernanza`
  - `DCM → Coherencia Informativa`
  - `CXM → Ejecución Corporativa`
  - `RIX → Índice de Reputación Algorítmica`

- **Función exportada** `enforceR20Acronyms(markdown: string, glossary?: Record<string,string>): { output: string; substitutions: number; warnings: string[] }`:
  1. Trocea el markdown por líneas, manteniendo orden.
  2. **Salta** (no procesa) líneas que cumplan cualquiera de:
     - Empieza por `|` (filas de tabla)
     - Empieza por `#` (encabezados)
     - Empieza por `>` (blockquotes — alertas/citas)
     - Está dentro de un bloque de código (toggle por <code>```</code>)
     - Pertenece a una sección glosario/metodología (toggle activado al ver un `## ...Glosario...` o `## ...Metodología...` hasta el siguiente `##`)
  3. En el resto de líneas (prosa narrativa), mantiene un `Set<string> seen` **por bloque ficha** (resetea al detectar `## ` o `### ` que abra ficha nueva, criterio markdown estándar).
  4. Para cada sigla del mapa, busca la **primera** ocurrencia "suelta" en la línea — patrón: `\b(SIGLA)\b` que NO esté ya precedida por `(` ni inmediatamente seguida por `)` con nombre completo delante. Si la sigla no está en `seen` para el bloque actual, sustituye `SIGLA` por `Nombre completo (SIGLA)` y marca `seen.add(SIGLA)`.
  5. **Nunca** toca números, decimales, ni texto dentro de paréntesis ya formados (R23 intacta).
  6. Si encuentra una sigla candidata que no está en el glosario, **no rompe**: empuja `warnings.push("[R20] sigla sin glosario: XXX")` y la deja como está.
  7. Devuelve `{ output, substitutions, warnings }`.

### 2. `supabase/functions/chat-intelligence-v2/orchestrator.ts` (cableado mínimo)

En el bloque post-stream existente (~línea 1009-1035), **después** de la llamada actual a `sanitizeFinalMarkdown(content, ...)` y antes de cerrar el `try`:

```ts
try {
  const r20 = enforceR20Acronyms(content);
  if (r20.substitutions > 0) {
    console.log(`[R20] skill=${skill.name} substitutions=${r20.substitutions}`);
    content = r20.output;
  }
  if (r20.warnings.length) console.warn(`[R20] warnings:`, r20.warnings);
} catch (r20Err) {
  console.warn("[R20] enforceR20Acronyms failed (non-fatal):", r20Err);
}
```

Añadir import al top del archivo:
```ts
import { enforceR20Acronyms } from "./prompts/narrativeQuality.ts";
```

## Fuera de alcance (no se toca)

- R21-R25 del prompt (intactas)
- Glosario y diccionario embebido en la regla 20 del prompt (intacto)
- `src/lib/rixMetricsGlossary.ts` (no se importa, no se modifica)
- Cualquier otro archivo de skills, guards, frontend
- R24 (queda pendiente para el siguiente sub-commit)

## Verificación

Tras el commit, el usuario lanza Sanity IBEX. Debería seguir verde (3/3) y los nuevos logs `[R20] substitutions=N` aparecerán en `edge_function_logs` confirmando que el parche se está disparando en fichas largas.

## Reporte al cerrar

Indicaré las líneas exactas modificadas en `narrativeQuality.ts` (append al final del archivo + ningún cambio en la export del prompt) y las líneas exactas insertadas en `orchestrator.ts` (1 import + ~10 líneas en el bloque post-stream).
