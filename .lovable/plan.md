

## Problem

When the skills-based pipeline handles a query, **verified sources (bibliography) are never included in PDF exports**. The root cause:

1. `executeSkillGetRawTexts` (line ~404) only selects `02_model_name, 03_target_name, 10_resumen, 11_puntos_clave` — it does NOT fetch `20_res_gpt_bruto` or `21_res_perplex_bruto` (the raw AI responses containing source URLs)
2. The reconstructed `allRixData` (line ~6950) maps from `dataPack.snapshot` which also lacks these fields
3. So `extractSourcesFromRixData(detectedCompanyFullData)` at line 7281 always returns 0 sources when the skills pipeline is used
4. The `done` SSE event sends `verifiedSources: undefined`, and the PDF export has no bibliography

## Plan

### 1. Expand `executeSkillGetRawTexts` to fetch raw AI columns

In the `.select()` call (line ~404), add `20_res_gpt_bruto, 21_res_perplex_bruto, 06_period_from, 07_period_to` to the selected columns. Return these in the result alongside the existing `texts` array — add a new `raw_runs` field containing the full rows needed for source extraction.

### 2. Pass raw runs through `buildDataPackFromSkills`

Add a new field to the returned pack (e.g., `_rawRunsForSources`) populated from `resultMap.rawTexts.raw_runs`. This is an internal field used only for source extraction downstream.

### 3. Extract sources from skills pipeline data

At line ~6968 where `detectedCompanyFullData` is constructed, check if `dataPack._rawRunsForSources` exists. If so, use those rows (which contain the raw GPT/Perplexity text) for `extractSourcesFromRixData` instead of the reconstructed snapshot data.

### Files to modify

- `supabase/functions/chat-intelligence/index.ts`:
  - `executeSkillGetRawTexts`: expand select to include raw AI columns + period fields; return `raw_runs`
  - `buildDataPackFromSkills`: pass through `raw_runs` as `_rawRunsForSources`
  - Line ~6968: use `dataPack._rawRunsForSources` for source extraction when available
- Deploy `chat-intelligence` after changes

