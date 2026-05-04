## Auditoría sistemática de calidad — Agente RIX V2

Has marcado los 4 frentes como prioritarios y prefieres auditar antes de tocar código. La propuesta es montar una **batería de evaluación reproducible** que clasifique fallos por tipo y nos dé una matriz objetiva de dónde duele más, antes de invertir esfuerzo de refactor.

### Fase 1 — Diseño de la batería (sin tocar producción)

**1.1 Catálogo de 24 queries canónicas** organizadas en 6 familias, cubriendo los 4 frentes:

| Familia | Nº | Mide |
|---|---|---|
| Snapshot empresa concreta | 4 | Precisión + narrativa |
| Periodo agregado (Q1, último mes) | 4 | Anti-mediana, doctrina temporal |
| Ranking sectorial / IBEX | 4 | Cobertura skills, scope integrity |
| Comparación 2-3 entidades | 4 | Competidores verificados, no fallback |
| Divergencia / consenso entre IAs | 4 | Profundidad analítica |
| Casos límite (out-of-scope, follow-up, ticker ambiguo, datos parciales) | 4 | Robustez + sanitización |

Las queries quedan versionadas en `specs/quality-audit-queries.md` con el output esperado por cada una (entidad, intent, mode, métricas clave que deben aparecer, prohibiciones).

**1.2 Rúbrica de evaluación de 7 dimensiones** (0-2 puntos cada una, total /14):

1. **Grounding numérico** — ¿Los números coinciden con el DataPack? ¿Hay invenciones?
2. **Doctrina temporal** — ¿Fechas correctas? ¿Respeta floor 2026-01-01?
3. **Anti-mediana / multi-modelo** — ¿Compara las 6 IAs o colapsa a un promedio?
4. **Competidores verificados** — ¿Usa solo `verified_competitors` o inventa peers?
5. **Estructura canónica** — Headline → Diagnóstico → 6 IAs → Patrones → GEO accionable
6. **Sanitización** — ¿Filtra jerga interna, marcadores, "mediana"?
7. **Fiabilidad técnica** — ¿Termina sin timeout? ¿SSE limpio? ¿Tiempo razonable?

### Fase 2 — Ejecución del audit

**2.1 Edge function nueva `quality-audit-runner`** que:
- Lee el catálogo desde `specs/quality-audit-queries.md`
- Llama a `chat-intelligence-v2` por cada query (modo no-stream para capturar todo el output)
- Persiste resultados en una tabla nueva `audit_runs` (run_id, query_id, output, latency_ms, datapack_snapshot, error)
- Espaciado: 1 query cada 5s para no saturar

**2.2 Panel admin `/admin` → pestaña "Quality Audit"**:
- Botón "Ejecutar batería completa" (corre las 24 en background)
- Vista por run: tabla query × dimensión con scoring manual + auto-checks
- **Auto-checks programáticos** (no requieren leer el texto):
  - regex prohibidas: `/mediana/i`, `/según mi conocimiento/i`, `/F[0-9]_/`
  - presencia de las 6 IAs nombradas
  - latencia > umbral
  - `datapack.cited_sources_report` no vacío en intents que lo requieren
  - `models_coverage.with_data.length === 6`
- **Scoring manual**: campos de 0-2 + nota libre por dimensión, persistido en `audit_scores`

**2.3 Comparación entre runs**: vista de diff entre dos `run_id` para medir regresiones tras cada cambio.

### Fase 3 — Diagnóstico y priorización

Tras el primer run completo:
- Heatmap fallo × familia × dimensión
- Top-5 patrones de fallo recurrentes
- Backlog priorizado P0/P1/P2 con etiqueta de frente (precisión / narrativa / cobertura / fiabilidad)

A partir de ahí decidimos **juntos** qué atacamos primero con un plan de cambios concreto. Los specs `P1-A` (unificación sección 7), `P1-B` (verifiedSources cross-skill) y `P1-C` (scrub residual) ya existen y casi seguro caerán dentro del backlog — los integramos como candidatos preexistentes en vez de inventar trabajo paralelo.

### Lo que NO entra en este plan

- Refactor de `orchestrator.ts` (680 LOC) o `sectorRanking.ts` (664 LOC): es deuda real pero la atacamos solo si la auditoría demuestra que causa fallos de calidad, no por estética.
- Cambios en prompts o skills: no tocamos nada hasta tener el primer informe del audit.
- Nuevas skills: idem.

### Detalles técnicos

- Tabla `audit_runs`: `id uuid pk, started_at, finished_at, git_sha text, notes text`
- Tabla `audit_results`: `run_id fk, query_id text, output text, datapack jsonb, latency_ms int, auto_checks jsonb, error text`
- Tabla `audit_scores`: `result_id fk, dimension text, score int (0-2), note text, scored_by text, scored_at`
- Edge function `quality-audit-runner` con `verify_jwt = false` invocable solo desde admin (gate por header firmado)
- Panel React en `src/components/admin/QualityAuditPanel.tsx` cargado dentro de `Admin.tsx` como tab nuevo
- Migración SQL para las 3 tablas + RLS solo admin

### Entregable de esta primera iteración

1. Migración SQL (3 tablas + RLS)
2. `specs/quality-audit-queries.md` con las 24 queries
3. Edge function `quality-audit-runner`
4. `QualityAuditPanel.tsx` en /admin
5. Primer run ejecutado + informe inicial de hallazgos en chat

Tiempo estimado de la primera entrega: 1 iteración de build. El primer informe de fallos lo discutimos juntos antes de decidir qué arreglar.
