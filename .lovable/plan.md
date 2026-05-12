# Plan Fase 2 — RepIndex Chat Intelligence v2

> **Estado:** borrador ejecutable, pendiente de aprobación.
> **Precondición:** Fase 1 cerrada con 29/29 verdes (8/8 small + 21/21 full) en S1–S5 + SQL_DIFF.
> **Default de los 3 flags Fase 2 en producción:** OFF. Activación una a una, manual, con ventana de observación 7 días.

---

## 0. Principios innegociables (heredados de Fase 1)

1. **Gating obligatorio**: ningún Paso de Fase 2 se da por cerrado sin `phase1-full = 21/21` verde en S1–S5 + SQL_DIFF.
2. **Inyectores cosméticos congelados**: `FREEZE_COSMETIC_INJECTORS=true` permanece. Nada de frase MEL, nada de tabla determinista de 8 métricas, nada de bibliografía auto-inyectada.
3. **Cero fabricación**: el LLM nunca recibe instrucción de inventar dato, sub-métrica, fecha o competidor. Solo se enriquece el dataset; el modelo decide qué citar.
4. **Legacy intacto**: `sectorRanking.ts` y `periodEvolution.ts` no se tocan. Toda la lógica nueva vive en `*.scoped.ts` o en módulos nuevos bajo `scope/policies/` y `guards/`.

---

## 1. Endurecimientos obligatorios incorporados

### E1 — Umbral explícito en A9.3 (cobertura sub-métricas)

- **Constante**: `SUBMETRICS_COVERAGE_MIN = 0.70` (70%).
- **Archivo**: `supabase/functions/chat-intelligence-v2/scope/policies/submetricsCoverageThreshold.ts`.
- **Definición de cobertura**: para cada sub-métrica `m ∈ {NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM}`, `coverage(m) = filas no nulas / (tickers × models × weeks)` dentro del `dataset` entregado.
- **Regla A9.3**: una sub-métrica solo es **exigible** (puede aparecer en `expected_submetrics` del assert) si `coverage(m) ≥ 0.70`. Si no, queda fuera y no se reporta como missing.
- **Justificación documentada en el archivo**: 70% equilibra (a) evitar exigir métricas con huecos estructurales (típicamente CXM, GAM en universos pequeños) y (b) impedir que el modelo cite sub-métricas marginales como si fueran consenso. Ajuste posterior solo con evidencia empírica de ≥2 ejecuciones full.

### E2 — Lista cerrada y versionada de términos prohibidos en B.1 (tiny universe)

- **Archivo**: `supabase/functions/chat-intelligence-v2/scope/policies/tinyUniverseProhibited.ts`.
- **Lista v1 (mínimo obligatorio)**:
  `"líder"`, `"rezagado"`, `"destaca"`, `"se distancia"`, `"se aleja"`, `"lidera el grupo"`, `"queda detrás"`, `"el mejor"`, `"el peor"`, `"el primero"`, `"el último"`, `"sobresale"`, `"se descuelga"`.
- **Formato**: `export const TINY_UNIVERSE_PROHIBITED_V1: readonly string[] = [...]` + `export const TINY_UNIVERSE_PROHIBITED_VERSION = 1`.
- **Versionado**: añadir términos = nuevo array `_V2` + bump de versión. Nunca mutar `_V1`.
- **Activación**: solo aplica si `scope.tickers.length ≤ 3` y `TINY_UNIVERSE_GUARD=true`.

### E3 — Límite de reintentos en C.2 (validador EXEC_NARRATIVE)

- **Máximo 2 reintentos por celda** (3 intentos totales).
- Si el intento 3 falla validación estructural:
  - Devolver al usuario el **output crudo** del último intento.
  - Emitir vía SSE `{ type: "warning", warning: "exec_narrative_validation_failed", attempts: 3, last_violation: <string> }`.
  - Persistir en `chat_logs.scope_audit.exec_narrative` el detalle.
- Nunca bloquear silenciosamente ni servir respuesta vacía.

### E4 — Gate Fase 1 sin regresión entre Pasos

- Tras cerrar **cada uno** de los Pasos 2.1, 2.2, 2.3, 2.4, ejecutar `phase1-full` (21 celdas).
- **Criterio de cierre de Paso**: 21/21 verde en S1–S5 + SQL_DIFF. Cualquier celda en rojo = **stop + rollback** del Paso (revertir flag + revertir commits del Paso).
- Resultado del gate se anota en `stress_runs.notes` con prefijo `phase2-gate:<paso>`.

### E5 — Rollback plan por flag

| Flag | Cómo desactivar | Tiempo máx. respuesta | Criterio objetivo desactivación | Decide |
|---|---|---|---|---|
| `ENRICH_RANKING_SUBMETRICS` | Supabase Dashboard → Edge Functions → Secrets → set `false` | < 5 min desde detección | Tasa de fallo A9.3 > 10% en ventana de 30 min, **o** regresión phase1-full | Usuario |
| `TINY_UNIVERSE_GUARD` | Supabase Dashboard Secrets → `false` | < 5 min | `tiny_universe_violation` > 5% en ventana 30 min, **o** falsos positivos > 2 reportados manualmente | Usuario |
| `EXEC_NARRATIVE` | Supabase Dashboard Secrets → `false` | < 5 min | `exec_narrative_validation_failed` > 15% en ventana 60 min, **o** latencia p95 > 90s | Usuario |

Detección: panel `StressTestsPanel.tsx` + `chat_logs.scope_audit` + `Edge Function logs`. La activación inicial de cada flag se hace en horario laboral con monitorización en vivo de los primeros 30 min.

---

## 2. Pasos ejecutables

### Paso 2.1 — Eje A: enriquecimiento de payload con sub-métricas (flag `ENRICH_RANKING_SUBMETRICS`, default OFF)

**Objetivo**: que el modelo pueda citar sub-métricas correctamente sin que un inyector cosmético las pegue al final.

**Cambios**:
- `scope/policies/submetricsCoverageThreshold.ts` (nuevo, E1).
- `skills/sectorRanking.scoped.ts`: añadir `submetrics_coverage` al `coverage_report` (porcentaje por sub-métrica sobre el dataset). No modifica el ranking.
- `data/scopedQuery.ts`: extender `RANKING_COLUMNS` ya cubre las 8 sub-métricas; calcular cobertura post-fetch.
- `orchestrator.ts`: si `ENRICH_RANKING_SUBMETRICS=true`, añade `submetrics_available` al `dataset` que se pasa al LLM, filtrado por umbral 70%.
- `stress-matrix-runner/asserts.ts`: reescribir A9 como **anti-fabricación**:
  - A9.1 (legacy, observabilidad): mantenida con prefijo `L:`.
  - A9.3 (Fase 2 gating cuando flag ON): "ninguna sub-métrica citada en el output con `coverage(m) < 0.70`".

**Cierre del Paso 2.1**: ejecutar `phase1-full` con flag OFF → debe seguir 21/21. Después, ejecución manual con flag ON sobre 1 caso piloto.

---

### Paso 2.2 — Eje B: tiny universe guard (flag `TINY_UNIVERSE_GUARD`, default OFF)

**Objetivo**: en universos `N ≤ 3`, prohibir lenguaje ordinal/comparativo absoluto.

**Cambios**:
- `scope/policies/tinyUniverseProhibited.ts` (nuevo, E2).
- `guards/tinyUniverseGuard.ts` (nuevo): post-validador pasivo. Recibe markdown final + scope. Si `scope.tickers.length ≤ 3` y `TINY_UNIVERSE_GUARD=true`:
  - Escanea con regex word-boundary case-insensitive cada término de la lista v1.
  - Si encuentra ≥1, emite SSE `{ type: "warning", warning: "tiny_universe_violation", terms: [...] }` y persiste en `chat_logs.scope_audit.tiny_universe`. **No reescribe**.
- `index.ts`: invocar el guard antes del `done` final si flag ON.
- `stress-matrix-runner/asserts.ts`: nuevo assert Fase 2 `B1_tiny_universe_clean` que falla si hay términos prohibidos detectados con `scope.tickers.length ≤ 3`.

**Cierre del Paso 2.2**: re-ejecutar `phase1-full` (debe seguir 21/21). Stress family `phase2-tiny` (subset de subsectores con N≤3) debe pasar B1 al 100% con flag ON.

---

### Paso 2.3 — Eje C: relato directivo opcional (flag `EXEC_NARRATIVE`, default OFF)

**Objetivo**: que el modelo escriba (no se le inyecta) headline ≤12 palabras + TL;DR de 3 bullets + "Lectura:" ≤60 palabras.

**Cambios**:
- `prompts/execNarrativePrelude.ts` (nuevo): bloque de instrucciones añadido al system prompt cuando flag ON. Incluye contrato de formato y trazabilidad numérica obligatoria (cada cifra citada debe existir en el `dataset`).
- `guards/execNarrativeValidator.ts` (nuevo): valida estructura (headline, 3 bullets, sección Lectura, longitudes) y trazabilidad (regex de números → match en dataset). Devuelve `{ ok, violation }`.
- `orchestrator.ts`: si flag ON y validación falla → reintento (max 2). Tras 3er intento fallido aplica E3 (output crudo + warning estructurado).
- `stress-matrix-runner/asserts.ts`: nuevo `C1_exec_narrative_structure` y `C2_exec_narrative_traceability`.

**Cierre del Paso 2.3**: re-ejecutar `phase1-full` con flag OFF (21/21). Ejecución `phase2-exec` con flag ON sobre 5 celdas, C1+C2 verde.

---

### Paso 2.4 — UI y mantenimiento del gating

**Cambios**:
- `StressTestsPanel.tsx`: tercera columna "FASE 2 · GATING (flags ON)" separada visualmente de Fase 1 y Legacy. Toggle visible por flag (solo lectura del estado actual; activación sigue siendo via Supabase Secrets).
- `stress-matrix-runner/spec.ts`: nuevas families `phase2-tiny`, `phase2-exec`, `phase2-full` (= phase1-full + asserts Fase 2).
- Documentación de cierre Fase 2 en `stress-matrix-runner/index.ts` (bloque comentario espejo del cierre Fase 1).

**Cierre del Paso 2.4**: `phase1-full` 21/21 + `phase2-full` con los 3 flags OFF debe igualar phase1-full (no debe introducir asserts adicionales activos cuando los flags están OFF).

---

## 3. Orden de activación en producción (post-merge)

1. Día D+0: `ENRICH_RANKING_SUBMETRICS=true`. Ventana observación 7 días. Rollback según E5.
2. Día D+7 (si verde): `TINY_UNIVERSE_GUARD=true`. Ventana 7 días.
3. Día D+14 (si verde): `EXEC_NARRATIVE=true`. Ventana 7 días.
4. Día D+21: cierre Fase 2 documentado.

Cada activación requiere `phase1-full = 21/21` ejecutado en las 24h previas.

---

## 4. Lo que este plan NO hace

- No reactiva `sanitizeFinalMarkdown`, `deterministicDimensionsTable`, `buildTickerCitedSourcesBlock`, footnote MEL ni `<!--CITEDSOURCESHERE-->`.
- No modifica `sectorRanking.ts` ni `periodEvolution.ts` legacy.
- No cambia el contrato de `ScopeContract`, `runScopedQuery` ni `scopeAudit`.
- No activa flags en producción al hacer merge: los 3 quedan OFF por defecto.

---

## 5. Criterio global de éxito Fase 2

- 4 Pasos cerrados con `phase1-full = 21/21` en cada gate (E4).
- 3 flags activables y desactivables en < 5 min (E5).
- Ningún assert legacy A1–A10 promovido a gating sin justificación documentada.
- 0 inyectores cosméticos reactivados.
