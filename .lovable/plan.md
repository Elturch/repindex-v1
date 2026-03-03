

# Plan: Phase 2 — Wire Skills Orchestrator into chat-intelligence

## Summary

Modify `supabase/functions/chat-intelligence/index.ts` to use skills as the PRIMARY data source, with existing E1+F2+E2 as fallback. The file is ~7169 lines. Changes are surgical insertions, not rewrites.

## Changes

### 1. Feature flag (top of file, after imports ~line 8)

```typescript
const USE_SKILLS_PIPELINE = true;
```

### 2. Inline skill functions (~line 10, after flag)

Insert ~400 lines of inlined skill code adapted for Deno (using `supabaseAdmin` instead of imported client). These are direct copies from `src/lib/skills/` with import statements removed:

- `getLatestValidSundayEdge(supabase)` — cached Sunday resolver
- `buildDateFilterEdge(dateStr)` — date range helper  
- `medianEdge(values)` — median calculator
- `METRIC_COLUMNS_EDGE` — metric column map
- `SCORE_SELECT_EDGE` — select string
- `executeSkillGetCompanyScores(supabase, params)`
- `executeSkillGetCompanyRanking(supabase, params)`
- `executeSkillGetCompanyEvolution(supabase, params)`
- `executeSkillGetCompanyDetail(supabase, params)`
- `executeSkillGetSectorComparison(supabase, params)`
- `executeSkillGetDivergenceAnalysis(supabase, params)`
- `executeSkillGetRawTexts(supabase, params)`
- `interpretQueryEdge(question)` — regex classifier (no LLM, deterministic)

All functions suffixed with `Edge` or prefixed with `execute` to avoid name collisions with existing code.

### 3. New function `buildDataPackFromSkills()` (~after the inlined skills)

```typescript
async function buildDataPackFromSkills(
  question: string,
  supabaseClient: any,
  companiesCache: any[] | null,
  logPrefix: string
): Promise<DataPack | null>
```

Logic:
1. Call `interpretQueryEdge(question)` → get `{intent, entities, filters, recommended_skills}`
2. Resolve ticker from `companiesCache` if entities found
3. Based on `recommended_skills[]`, call skill functions in parallel via `Promise.allSettled`
4. Map results into existing `DataPack` structure:
   - `pack.snapshot` ← scores from `executeSkillGetCompanyScores` (mapped: `model_name→modelo`, `rix_score→rix`, etc.)
   - `pack.ranking` ← from `executeSkillGetCompanyRanking` (mapped: `company→nombre`, `median_rix→rix_avg`)
   - `pack.evolucion` ← from `executeSkillGetCompanyEvolution` (aggregated by week)
   - `pack.divergencia` ← from `executeSkillGetDivergenceAnalysis` (pick rix_score divergence)
   - `pack.raw_texts` ← from `executeSkillGetRawTexts`
   - `pack.empresa_primaria` ← from `executeSkillGetCompanyDetail`
   - `pack.memento` ← from company detail's corporate data
   - `pack.competidores_verificados` ← from company detail's verified_competitors + scores
   - NEW `pack.divergencias_detalle` ← full divergence array for E5
5. If all skills fail → return `null` (triggers fallback)
6. Console.log every skill call with timing

### 4. Modify `handleStandardChat()` (~line 5949)

Insert skills-first block BEFORE the existing E1 classifier:

```typescript
// --- SKILLS PIPELINE (primary) ---
let dataPack: DataPack | null = null;
let usedSkillsPipeline = false;

if (USE_SKILLS_PIPELINE) {
  console.log(`${logPrefix} [SKILLS] Attempting skills-based pipeline...`);
  const skillsStart = Date.now();
  dataPack = await buildDataPackFromSkills(question, supabaseClient, companiesCache, logPrefix);
  if (dataPack && (dataPack.snapshot.length > 0 || dataPack.ranking.length > 0)) {
    usedSkillsPipeline = true;
    console.log(`${logPrefix} [SKILLS] Success in ${Date.now() - skillsStart}ms`);
  } else {
    console.log(`${logPrefix} [SKILLS] Insufficient data, falling back to legacy pipeline`);
    dataPack = null;
  }
}

if (!usedSkillsPipeline) {
  // --- LEGACY: E1 + F2 + E2 (existing code, unchanged) ---
  const classifier = await runClassifier(...);
  ...
  dataPack = await buildDataPack(...);
  // ... existing F2 merge, graph expansion, etc.
}
```

The existing E1→F2→E2 block becomes the `else` branch. E3, E5, E6 remain identical — they just receive `dataPack`.

The `classifier` variable must still be available for downstream code (suggestions, drumroll). When skills pipeline is used, we create a minimal classifier from the interpret result.

### 5. Add divergence support to E5 prompt (~line 2730)

In `buildOrchestratorPrompt`, add divergence data to the serialized DataPack:

```typescript
divergencias_detalle: (dataPack as any).divergencias_detalle || null,
```

And in the E5 systemPrompt (~line 2800), add a new section:

```
DIVERGENCIAS INTER-MODELO (si disponibles):
Cuando el DataPack incluya datos de divergencia entre modelos de IA, ÚSALOS:
- Consenso "alto" (rango < 10): "Las seis IAs coinciden..."
- Consenso "bajo" (rango > 20): "Existe divergencia significativa..."
- Prioriza divergencias en rix_score y métricas con mayor rango
- NUNCA ignores las divergencias
```

### 6. DataPack interface extension (~line 1649)

Add optional field to existing `DataPack` interface:

```typescript
divergencias_detalle?: Array<{metric: string; max_model: string; max_value: number; min_model: string; min_value: number; range: number; consensus: string}>;
```

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Feature flag, inlined skills, `buildDataPackFromSkills()`, modified `handleStandardChat()`, extended DataPack interface, E5 divergence prompt |

## Risk Mitigation

- Feature flag `USE_SKILLS_PIPELINE` toggles instantly
- Old pipeline is the `else` branch, completely intact
- If skills return insufficient data, automatic fallback
- All skill calls wrapped in try/catch, never throw
- Console.log for every skill execution

