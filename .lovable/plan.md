

# Plan: Skills-Based System — Phase 1 (New Files Only)

## Summary

Create a modular skills system in `src/lib/skills/` and `src/lib/` with 7 data skills, 1 logic skill, an orchestrator, a registry, and an admin page. No existing files are modified.

## New Files to Create

### 1. `src/lib/rixSkills.ts` — Types and Registry

- Define `RixSkill` interface with `id`, `name`, `description`, `layer`, `inputSchema`, `outputSchema`, `status`, `execute`
- Define typed input/output interfaces for each skill
- Export a `SKILLS_REGISTRY: Map<string, RixSkill>` populated by importing all skills
- Export helper: `getSkillsByLayer(layer)`, `getActiveSkills()`

### 2. Data Skills (`src/lib/skills/`)

All 7 data skills share the same pattern:
- Accept a typed params object + Supabase client
- Query the DB using the Supabase JS client (not raw SQL)
- Apply Sunday snapshot rule: filter `batch_execution_date` on Sundays with >=180 records
- Return typed JSON with `{success: boolean, data?: T, error?: string}`
- Never throw — always return structured errors

| File | Table(s) | Key Logic |
|------|----------|-----------|
| `skillGetCompanyScores.ts` | `rix_runs_v2` | Scores per model for one company, latest valid Sunday |
| `skillGetCompanyRanking.ts` | `rix_runs_v2` + `repindex_root_issuers` | Median RIX ranking, filterable by sector/family |
| `skillGetCompanyEvolution.ts` | `rix_trends` | Temporal series, paginated to avoid 1000-row limit |
| `skillGetCompanyDetail.ts` | `repindex_root_issuers` + `corporate_snapshots` | Master data + corporate info |
| `skillGetSectorComparison.ts` | `rix_runs_v2` + `repindex_root_issuers` | All companies in a sector with per-model scores |
| `skillGetDivergenceAnalysis.ts` | `rix_runs_v2` | Inter-model spread per metric for one company |
| `skillGetRawTexts.ts` | `rix_runs_v2` | Raw `10_resumen`, `11_puntos_clave` per model |

**Sunday snapshot helper** (shared): A reusable function `getLatestValidSunday(supabase)` that finds the most recent `batch_execution_date` where `EXTRACT(dow) = 0` and `COUNT(*) >= 180`. Used by all skills that query `rix_runs_v2`.

### 3. `src/lib/skills/skillInterpretQuery.ts` — Logic Skill

- Regex-first classification for known patterns (IBEX, sector names, company tickers from a static list)
- Returns `{intent, entities[], time_range, filters, recommended_skills[]}`
- Intent enum: `company_analysis | ranking | evolution | sector_comparison | divergence | general_question | off_topic`
- Maps intents to skill IDs deterministically (no LLM needed for most cases)
- Optional Gemini call (temperature 0.1) only for ambiguous queries that regex can't classify

### 4. `src/lib/skillOrchestrator.ts` — Deterministic Orchestrator

Three-layer execution:
1. **Layer 1 (Skills)**: Run `skillInterpretQuery` → get `recommended_skills[]` → execute them in parallel via `Promise.allSettled` → merge results into a unified DataPack
2. **Layer 2 (F2 SQL Expert)**: If Layer 1 returns insufficient data, delegate to existing `generateAndExecuteSQLQueries` (will be wired in Phase 2)
3. **Layer 3 (Graceful fallback)**: If both fail, return `skillGetCompanyDetail` context + honest "limited data" message

Output: A `UnifiedDataPack` object compatible with the existing E5/E6 stages.

All routing is pure TypeScript (switch/if). No LLM decides which skills to call.

### 5. `src/pages/SkillsAdmin.tsx` — Admin Panel

- Table listing all skills from `SKILLS_REGISTRY`
- Columns: name, layer (badge), status (badge), description
- "Test" button per skill → opens dialog with JSON input textarea + "Run" button → displays raw JSON output
- Uses existing `Card`, `Badge`, `Button`, `Dialog` components
- Route: `/admin/skills` added to `App.tsx` — **exception**: this is the one existing file we add a route to (inside the existing `isDevOrPreview()` block)

**Note**: Adding the route to App.tsx is a minimal 2-line change. If strict "no existing file changes" is required, we skip the route and the page is only accessible by direct URL navigation.

### 6. File Tree

```text
src/lib/
  rixSkills.ts              ← types + registry
  skillOrchestrator.ts      ← 3-layer orchestrator
  skills/
    shared.ts               ← getLatestValidSunday, types
    skillGetCompanyScores.ts
    skillGetCompanyRanking.ts
    skillGetCompanyEvolution.ts
    skillGetCompanyDetail.ts
    skillGetSectorComparison.ts
    skillGetDivergenceAnalysis.ts
    skillGetRawTexts.ts
    skillInterpretQuery.ts
src/pages/
  SkillsAdmin.tsx
```

## Technical Decisions

- **Client-side Supabase queries**: Skills use the anon client (`@/integrations/supabase/client`). All tables queried have public SELECT RLS policies, so no service_role needed.
- **Sunday snapshot**: Each skill that needs it calls `getLatestValidSunday()` which does a single query to find the valid date, then passes it as filter.
- **PostgREST 1000-row limit**: Skills use `.range()` for large datasets (evolution, ranking). Ranking caps at `top_n` (default 50). Evolution uses pagination like `getLatestRixTrendWeeks.ts`.
- **Column names with numbers**: Queries use exact column names like `09_rix_score` with proper quoting in `.select()`.
- **No edge function changes**: Everything runs client-side. Phase 2 will port skills to the edge function.

## Constraints Respected

- No existing files modified (except minimal App.tsx route addition)
- Current pipeline continues working untouched
- All new code in new files
- Strict TypeScript types throughout
- Structured error handling, never throws

