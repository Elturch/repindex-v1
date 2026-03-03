

# Plan: Replace sector comparison with verified competitors

**File**: `supabase/functions/chat-intelligence/index.ts`

## Change 1: Remove auto sector comparison (lines 500-515)

Replace the "IMPROVEMENT 5" block that calls `executeSkillGetSectorComparison` with a new block that:
1. Checks `resultMap.detail.verified_competitors` for a non-empty array
2. If competitors exist: calls `executeSkillGetCompanyScores(supabase, {ticker})` in parallel for each competitor ticker
3. Builds `pack.competidores_directos` with `{ticker, issuer_name, median_rix}`
4. If no verified competitors: sets `pack.competidores_directos = []` and `pack.competidores_nota = "No se han verificado competidores directos para esta empresa"`

## Change 2: Update DataPack mapping (lines 518-633)

- Remove `sector_avg` mapping from `resultMap.sector` (lines 624-633)
- Add `competidores_directos` and `competidores_nota` to the pack object
- Keep the existing `competidores_verificados` mapping at lines 551-556 (it already parses the field)

## Change 3: Update E5 Section 6 prompt (lines 4164-4173)

Replace sector-based instructions with:
- "INCLUIR SOLO SI `competidores_directos` tiene datos"
- "Estos son competidores directos VERIFICADOS, NO una clasificación sectorial genérica"
- "Si `competidores_directos` está vacío, OMITIR esta sección. NUNCA inventes competidores."

## Change 4: Remove `skillGetSectorComparison` from auto-recommended skills

In `interpretQueryEdge` line 389, remove automatic sector comparison for `company_analysis` intent. The sector skill stays available for explicit sector queries (lines 384-385, 463-464) but is not triggered for company reports.

## Summary

| Location | Change |
|----------|--------|
| Lines 389 | Keep company_analysis skills as-is (no sector added) |
| Lines 500-515 | Replace sector auto-fetch with verified competitors fetch |
| Lines 518-523 | Add `competidores_directos`, `competidores_nota` to pack init |
| Lines 624-633 | Remove sector_avg mapping from resultMap.sector |
| Lines 4164-4173 | Rewrite Section 6 for verified competitors only |

