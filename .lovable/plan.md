

# Plan: Fix 6 Bugs/Improvements in chat-intelligence Skills Pipeline

**File**: `supabase/functions/chat-intelligence/index.ts`

## BUG 1: Evolution fallback to rix_runs_v2

**Problem**: `executeSkillGetCompanyEvolution` only queries `rix_trends`. If that table has no data for a ticker, evolution is empty even though `rix_runs_v2` has weekly snapshots.

**Fix**: After the `rix_trends` query returns 0 rows, add a fallback block that queries `rix_runs_v2` grouped by `batch_execution_date`. Steps:
- Query `rix_runs_v2` for the ticker, ordered by `batch_execution_date` desc, paginated
- Group rows by `batch_execution_date` (date portion only)
- For each date, collect all `09_rix_score` values across models
- Return the same `{batch_week, model_name, rix_score}` shape so downstream aggregation works unchanged
- Limit to `weeksBack` distinct dates

This is ~30 lines added inside `executeSkillGetCompanyEvolution`, after the `if (allData.length === 0)` check at line 179.

## BUG 2: Aggregate evolution per-week before DataPack

**Status**: Already handled. Lines 499-514 in `buildDataPackFromSkills` already aggregate by week using median. The issue was BUG 1 (no data from rix_trends). Once BUG 1 is fixed, the aggregation works correctly. No change needed here, but switch from mean to median in the aggregation (line 510 currently uses arithmetic mean).

**Fix**: Change line 510 from `scores.reduce((a,b) => a+b,0) / scores.length` to `medianEdge(scores)`.

## IMPROVEMENT 3: Auto-compute delta_rix

**Fix**: After building `pack.evolucion` (line 514), add a `delta_rix` field to the DataPack:
```
if (pack.evolucion.length >= 2) {
  const last = pack.evolucion[pack.evolucion.length - 1];
  const prev = pack.evolucion[pack.evolucion.length - 2];
  pack.delta_rix = { current: last.rix_avg, previous: prev.rix_avg, delta: round(last.rix_avg - prev.rix_avg, 1) };
} else if (pack.evolucion.length === 1) {
  pack.delta_rix = { current: pack.evolucion[0].rix_avg, previous: null, delta: 0, note: "single_week" };
}
```
Add `delta_rix` as optional field in the DataPack interface (line 2221).

## IMPROVEMENT 4: Structured sections in E5 prompt

**Fix**: Replace the `buildDepthPrompt` section structure (lines 3994-4110) with explicit numbered sections:

- Section 1: "Resumen Ejecutivo" — MANDATORY. Must include: titular-diagnostico, 3 KPIs with delta, 3 hallazgos, veredicto
- Section 2: "Vision de las 6 IAs" — MANDATORY. Table ordered by median RIX desc
- Section 3: "Las 8 Metricas" — MANDATORY. Table with metric, score, semaforo, explanation
- Section 4: "Divergencia entre Modelos" — CONDITIONAL: only if divergencias_detalle available
- Section 5: "Evolucion Temporal" — CONDITIONAL: only if evolucion has >1 week
- Section 6: "Contexto Competitivo" — CONDITIONAL: only for company queries (vs sector peers)
- Section 7: "Recomendaciones Basadas en Datos" — MANDATORY. Max 4, each with gap + evidence + action
- Section 8: "Cierre: Fuentes y Metodologia" — MANDATORY

Add explicit rule: "NUNCA omitas las secciones 1, 2, 3, 7 y 8. Las secciones 4, 5 y 6 son condicionales."

## IMPROVEMENT 5: Auto-fetch sector comparison for company_analysis

**Fix**: In `buildDataPackFromSkills` (around line 422, after the skill calls loop), add:
```
// Auto-add sector comparison for company queries
if (interpret.intent === "company_analysis" && resolvedTicker && !skillCalls.sector) {
  // Get sector from detail result after all skills complete
  // → Move sector call to a second phase after detail resolves
}
```

Better approach: after `Promise.allSettled` resolves (line 435), check if `resultMap.detail` has a `sector_category` and if `!resultMap.sector`. If so, make a second call to `executeSkillGetSectorComparison` with that sector. Then merge the result into pack.

## IMPROVEMENT 6: Company name → ticker resolution

**Fix**: The current code at line 384 uses `detectCompaniesInQuestion()` which relies on `companiesCacheLocal`. Verify this works by also checking: if `resolvedTicker` is still null after `detectCompaniesInQuestion`, do a fuzzy match on the question against `companiesCacheLocal` entries' `issuer_name` (lowercase includes). This catches cases where "Airtificial" doesn't match the exact regex but is in the cache as "Airtificial Intelligence Structures".

Add ~10 lines after line 390: iterate `companiesCacheLocal`, check if `question.toLowerCase().includes(name.toLowerCase())` for each issuer_name or common short forms.

## Summary of Changes

All in `supabase/functions/chat-intelligence/index.ts`:

| Location | Change |
|----------|--------|
| Lines 163-189 | Add rix_runs_v2 fallback in `executeSkillGetCompanyEvolution` |
| Line 510 | Switch evolution aggregation from mean to median |
| Lines 514-515 | Add `delta_rix` computation |
| Lines 384-390 | Add fuzzy company name matching fallback |
| Lines 422-427 | Add auto sector comparison for company_analysis intent |
| Lines 435-445 | Add second-phase sector call after detail resolves |
| Line 2221 | Add `delta_rix` to DataPack interface |
| Lines 3994-4110 | Rewrite `buildDepthPrompt` section structure with mandatory/conditional sections |

No existing fallback logic is removed. No other files are modified.

