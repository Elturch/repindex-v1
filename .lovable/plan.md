

## Plan: Fix normalize-query rejecting valid INDEX/ranking queries

### Problem
The query "¿Qué empresa del ibex 35 tiene más consenso entre las IAs?" is being **rejected** by the `normalize-query` edge function. GPT-4o-mini marks it as `needs_clarification=true` because it can't identify a specific company. But this is a perfectly valid INDEX ranking query that the legacy pipeline handles.

The exported HTML confirms: the entire report body is just the rejection message "Solo puedo analizar la reputación de empresas monitorizadas por RepIndex". No InfoBar or sources appear because there was never a real analysis.

### Root Cause
The `normalize-query` system prompt (line 10-32) lacks a skill for **index-wide ranking queries** (e.g., "best company in IBEX 35", "which company has most consensus", "ranking del IBEX"). It only lists `sectorComparison` with trigger "Top N del SECTOR", and rule #7 says to reject anything that doesn't match a company — so general index questions get rejected.

### Changes

**File: `supabase/functions/normalize-query/index.ts`**

1. **Add `indexRanking` skill** to the SKILLS DISPONIBLES list:
   - `indexRanking`: Ranking general de un índice o universo completo. Trigger: 'Ranking del [ÍNDICE]' or 'Qué empresa del [ÍNDICE] tiene mejor/peor [MÉTRICA]'

2. **Update rule #5/7** to clarify that questions about indices (IBEX 35, IBEX Medium Cap, etc.) or the full RepIndex universe are valid — they should NOT be marked as `needs_clarification`. Only truly off-topic queries (weather, sports, etc.) should be rejected.

3. **Add explicit examples** of valid index queries that should NOT be rejected:
   - "¿Qué empresa del ibex 35 tiene más consenso?"
   - "¿Cuál es la empresa con mejor reputación?"
   - "Ranking de las 10 mejores"

**Redeploy**: `normalize-query`

### Expected Result
Index/ranking queries will be normalized to a `sectorComparison` or `indexRanking` skill hint and passed through to `chat-intelligence`, which already handles them correctly via the legacy E1-E6 INDEX route (now with report_context and sources).

