# P0-3 — OutputValidator común (`guards/outputGuard.ts`)

## Objetivo
Validar de forma uniforme la salida de cada skill ANTES de que llegue
al cliente: detectar respuestas obviamente rotas (vacías, truncadas,
sin secciones canónicas, marker leakage) y registrar avisos
estructurados que el orchestrator puede loguear/anexar. Pure function
sin side effects en P0; las acciones correctivas (auto-append) ya
viven en cada skill (caso companyAnalysis con la sección 7).

## Contrato
```ts
interface OutputValidationIssue {
  level: "error" | "warning" | "info";
  code: string;          // p.ej. "EMPTY_OUTPUT", "MARKER_LEAK", "MISSING_SECTION_7"
  message: string;
}
interface OutputValidationResult {
  ok: boolean;             // true si no hay errors (warnings permitidos)
  issues: OutputValidationIssue[];
  meta: {
    length: number;
    hasSection7: boolean;
    hasCitedSources: boolean;
    hasMarkerLeak: boolean;
  };
}
function validateSkillOutput(
  content: string | null | undefined,
  opts?: { requireSection7?: boolean; requireCitedSources?: boolean }
): OutputValidationResult
```

## Reglas (P0)
1. `EMPTY_OUTPUT` (error): `content` ausente o length < 200.
2. `MARKER_LEAK` (error): el contenido aún incluye
   `<!--CITEDSOURCESHERE-->` o variantes regex (la sustitución falló).
3. `MISSING_SECTION_7` (warning): `requireSection7 && !hasSection7`
   (`/^|\n##\s*7\.|Recomendaciones\s+priorizadas/i`).
4. `MISSING_CITED_SOURCES` (warning): `requireCitedSources` y no se
   detecta encabezado de fuentes/bibliografía/referencias.

## Uso (P0 — solo logging)
`orchestrator.ts` invoca `validateSkillOutput(finalContent, opts)` después
de cada skill y hace `console.warn` por cada issue. NO modifica el
contenido (el auto-fix de sección 7 ya vive en companyAnalysis y la
unificación queda para P1 con el reportAssembler).

## Archivos
- NUEVO: `supabase/functions/chat-intelligence-v2/guards/outputGuard.ts` (pure, < 100 LOC).
- MODIFICADO: `supabase/functions/chat-intelligence-v2/orchestrator.ts`
  - import + 1 llamada después de procesar la respuesta del skill.
- NO TOCADO: skills (su lógica interna queda intacta).
- NO TOCADO: `index.ts`, `ChatContext.tsx`, routing, etc.

## Criterios de aceptación
| # | Criterio | Verificable |
|---|----------|-------------|
| 1 | `outputGuard.ts` exporta `validateSkillOutput` pure | code review |
| 2 | `orchestrator.ts` llama el validador y loguea issues | grep `validateSkillOutput` en orchestrator |
| 3 | Una respuesta vacía produce `code:"EMPTY_OUTPUT"` | unit test inline en logs durante smoke |
| 4 | Marker leak (`<!--CITEDSOURCESHERE-->`) se detecta | unit test |
| 5 | No hay regresión funcional (es observabilidad pura) | smoke matrix |

## Smoke
- Lanzar Mahou en preview: en logs de la edge function debe aparecer
  `[outputGuard] companyAnalysis: ok=true issues=[…]` o similar.
- Si la respuesta es válida, no debe haber `level:"error"`.

## Roadmap futuro (P1)
- El validador devolverá un `corrected` con auto-fix unificado y se
  promoverá a bloqueante (`ok=false` ⇒ retry o fallback explícito).
