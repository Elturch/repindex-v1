## Plan Fase 1 — Acotación de datos quirúrgica

Objetivo único: que para cualquier combinación de filtros, el dataset que llega al LLM sea exactamente el que esos filtros definen, demostrable bit a bit. Ni peers, ni medianas, ni semanas adyacentes, ni tickers fuera de scope. Si no se puede garantizar, el pipeline aborta antes de llamar al modelo.

Fase 2 (relato directivo) **no se toca** hasta que Fase 1 esté 100% verde.

---

### 1. Scope Contract inmutable

**Archivo nuevo:** `supabase/functions/chat-intelligence-v2/scope/scopeContract.ts`

Construye y devuelve un objeto `ScopeContract` congelado con `Object.freeze`:

```text
ScopeContract {
  universe:    "IBEX-35" | "IBEX-MC" | ...,
  sector:      string | null,
  subsector:   string | null,
  tickers:     string[],          // resueltos contra repindex_root_issuers
  models:      ModelName[],        // 1..6, default = los 6
  window:      { from: ISO, to: ISO },
  resolved_from: {
    universe_source, sector_source, subsector_source,
    tickers_source, models_source, window_source
  }
}
```

Reglas duras:

- Resolución determinista universo → sector → subsector → tickers, validada **contra una vista SQL compartida** (ver §8), no con lógica TS local.
- Cualquier ticker que no exista en `repindex_root_issuers` se descarta y se loguea en `resolved_from.tickers_dropped`.
- Si `tickers.length === 0` tras resolver → `throw ScopeResolutionError` con detalle. **Nunca scope parcial. Nunca relleno con peers.**
- `models = [gemini, deepseek, grok, qwen, perplexity, chatgpt]` salvo `model_filter` explícito.
- `window` siempre acotada al floor `2026-01-01`.

### 2. RPC blindado de lectura

**Archivo nuevo:** `supabase/functions/chat-intelligence-v2/data/scopedQuery.ts`

`runScopedQuery(scope: ScopeContract, opts?)` es la **única** vía de acceso a `rix_runs_v2` desde el agente. Cualquier otra lectura directa queda prohibida (a eliminar de skills).

- Si `scope` no es un `ScopeContract` válido → `throw`.
- Aplica **siempre**:
  - `"05_ticker" = ANY(scope.tickers)`
  - `"02_model_name" = ANY(scope.models)`
  - `batch_execution_date BETWEEN scope.window.from AND scope.window.to`
- Rechaza opciones que intenten añadir filtros fuera del scope.
- Pagina internamente (>1000 filas).
- Devuelve estructura fija:

```text
{
  rows: Row[],
  coverage_report: {
    tickers_requested: string[],
    tickers_returned:  string[],
    models_requested:  string[],
    models_returned:   string[],
    weeks_requested:   string[],
    weeks_returned:    string[],
    missing_cells: Array<{ ticker, model, week }>
  }
}
```

### 3. Refactor de skills críticas

**Archivos:** `skills/sectorRanking.ts` y `skills/periodEvolution.ts` (la skill de evolución se llama así, no companyEvolution).

- Reciben SOLO el `ScopeContract`. Eliminada toda resolución local de tickers/sectores/peers.
- Lectura única vía `runScopedQuery`.
- **Prohibida toda imputación**: ni peers, ni mediana, ni semana adyacente. Celda sin dato → `null` y entrada en `coverage_report.missing_cells`.
- Eliminar fallback "verified_competitors vacío → peers de subsector" en código (memoria de proyecto ya lo prohíbe, aquí lo blindamos).
- El render numérico distingue visualmente `null` ("sin dato esa semana") de `0`.

### 4. Auditoría scope-vs-output (S1–S5)

**Archivo nuevo:** `supabase/functions/chat-intelligence-v2/guards/scopeAudit.ts` (`scopeGuard.ts` actual queda como helper interno o se absorbe).

Asserts ejecutados **antes** de inyectar datos en el prompt:

- **S1 tickers_in_scope**: ∀ row, `row.ticker ∈ scope.tickers`.
- **S2 models_in_scope**: ∀ row, `row.model ∈ scope.models`.
- **S3 dates_in_window**: ∀ row, `row.batch_execution_date ∈ scope.window`.
- **S4 no_peer_leak**: ningún ticker presente fuera del subsector/sector declarado (cruzando contra la vista SQL de §8).
- **S5 coverage_report_consistent**: `coverage_report` presente, con todas las claves, y `tickers_requested`/`models_requested`/`weeks_requested` coinciden exactamente con el scope.

Si **cualquier** assert falla → abortar pipeline, **no** llamar al LLM, devolver error estructurado al frontend.

### 5. outputGuard congelado

`guards/outputGuard.ts` queda **congelado** durante Fase 1:

- Sin frase MEL forzada.
- Sin reescrituras cosméticas (8 métricas, bibliografía mínima, etc.).
- Mantener solo sanitización mínima de seguridad (no borrar el módulo, solo desactivar los inyectores deterministas añadidos en sprints previos).

Esto evita seguir maquillando salidas sobre datos potencialmente contaminados.

### 6. Persistencia de `resolved_from` en BD

Migración nueva: añadir columnas a la tabla donde se persiste cada run del agente (a confirmar, candidata: `chat_runs_v2` o equivalente):

- `scope_contract jsonb` — el ScopeContract completo.
- `coverage_report jsonb` — el coverage_report devuelto por `scopedQuery`.
- `scope_audit jsonb` — resultado S1–S5.

Esto permite auditoría posterior sin depender de logs efímeros.

### 7. Validación SQL automatizada (no manual)

**Archivo nuevo:** `supabase/functions/stress-matrix-runner/validators/scopeIntegrityValidator.ts` invocado por el runner para cada celda.

- Toma N=5 filas aleatorias del dataset entregado al LLM.
- Reconsulta `rix_runs_v2` con `(ticker, model, batch_execution_date)` exactos.
- Compara campo a campo (`09_rix_score`, `51_rix_score_adjusted`, sub-métricas).
- Si hay cualquier divergencia → assert falla con diff explícito.

Resultado se guarda en `stress_results.scope_validation jsonb`.

### 8. Vista SQL compartida universo↔sector↔subsector↔ticker

Migración nueva: `CREATE VIEW v_issuer_scope` con columnas `(ticker, issuer_name, universe, sector_category, subsector, ibex_family_code)` derivada de `repindex_root_issuers`.

- `scopeContract.ts` y `scopeAudit.ts` consultan **esta vista**, no replican lógica de matching en TS.
- Garantiza que la definición de "qué tickers pertenecen a qué subsector" es única en todo el sistema.

### 9. Stress runner como validador de Fase 1

`supabase/functions/stress-matrix-runner/asserts.ts` y `StressTestsPanel.tsx`:

- Sustituir A1–A10 cosméticos por **S1–S5 + validador SQL bit a bit** durante Fase 1.
- Guardar A1–A10 actuales como "Fase 2 asserts" desactivados.
- El panel muestra por celda: scope_contract resuelto, coverage_report, S1–S5, diff SQL.

Criterio de paso de fase: **100% verde en S1–S5 y validador SQL** sobre las 21 celdas.

---

## Archivos previstos Fase 1

Nuevos:
- `supabase/functions/chat-intelligence-v2/scope/scopeContract.ts`
- `supabase/functions/chat-intelligence-v2/data/scopedQuery.ts`
- `supabase/functions/chat-intelligence-v2/guards/scopeAudit.ts`
- `supabase/functions/stress-matrix-runner/validators/scopeIntegrityValidator.ts`
- Migración: vista `v_issuer_scope` + columnas `scope_contract / coverage_report / scope_audit` en tabla de runs del agente.

Editados:
- `supabase/functions/chat-intelligence-v2/orchestrator.ts` (cablear scope al pipeline, abortar si audit falla)
- `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts` (refactor: solo recibe scope, prohibida imputación)
- `supabase/functions/chat-intelligence-v2/skills/periodEvolution.ts` (idem)
- `supabase/functions/chat-intelligence-v2/guards/outputGuard.ts` (congelar inyectores cosméticos)
- `supabase/functions/stress-matrix-runner/index.ts` y `asserts.ts` (S1–S5 + validador SQL)
- `src/components/admin/StressTestsPanel.tsx` (mostrar scope, coverage_report, diff SQL por celda)

## Validación de Fase 1

1. Lanzar matriz `small` (subsectores N≤5) → revisar S1–S5 y diff SQL por celda.
2. Lanzar matriz `hotels-reits` → confirmar que MEL aparece como único ticker resuelto sin invención de peers.
3. Lanzar matriz `sanity` (ranking sectorial completo) → confirmar coverage_report consistente.
4. Solo si **21/21 verdes** en S1–S5 + validador SQL, abrir Fase 2 (relato directivo).

## Fuera de alcance Fase 1

- Reescritura del prompt narrativo, headline, TL;DR, "Lectura:" — entran en Fase 2.
- Cambios de esquema en `rix_runs_v2`.
- Tocar V1 / chat-intelligence legacy.
- Sweep, ingestión, vector store, sales agent.
- Ampliar la matriz de estrés con nuevas familias.
