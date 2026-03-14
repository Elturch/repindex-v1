

## Audit: Multilingual Synonym Dictionary — Gaps for Intensive Use

### Critical Findings

There are **3 layers** of query interpretation, and the synonym dictionaries are misaligned between them:

| Layer | Location | Dictionary Coverage |
|-------|----------|-------------------|
| **normalize-query** (LLM) | Edge function | Has full multilingual dictionary (ES/EN/PT/CA) |
| **SEMANTIC_BRIDGE** (deterministic) | chat-intelligence L1 | Missing key synonyms — Spanish only, critical gaps |
| **skillInterpretQuery** (regex) | Client-side | Very basic patterns, no synonym awareness |

### GAP 1: CXM metric mapped WRONG in SEMANTIC_BRIDGE

The `44_cxm_score` thesaurus contains **execution terms** ("ejecución", "rendimiento", "performance", "m&a") but **NOT stock price / valuation terms**. Meanwhile, stock-related terms like "cotización", "bursátil", "bolsa", "capitalización" are mapped to `26_drm_score` (Data Richness).

This means: "¿Cómo está la cotización de Repsol?" → routes to DRM analysis instead of CXM.

**Fix**: Add stock price / valuation synonyms to `44_cxm_score` AND in all 4 languages:
- ES: cotización, precio de mercado, capitalización bursátil, valor en bolsa, precio de la acción, valoración bursátil, precio bursátil, valor bursátil
- EN: stock price, market valuation, market capitalization, market cap, share price, equity valuation, stock valuation, market price, trading price
- PT: cotação, preço de mercado, capitalização bolsista, valor em bolsa, preço da ação
- CA: cotització, preu de mercat, capitalització borsària, valor en borsa

Also REMOVE the stock-overlap terms from `26_drm_score` (cotización, bursátil, bolsa, acción, capitalización).

### GAP 2: Divergence intent missing decoupling synonyms

The `divergence` intent thesaurus has "divergencia", "discrepancia", "disenso" but is missing:
- ES: desacoplamiento, brecha, desfase, desconexión, descorrelación, desalineación, asimetría, desajuste, desequilibrio
- EN: decoupling, disconnect, misalignment, gap, mismatch, asymmetry, deviation, disparity, imbalance, delinking
- PT: desacoplamento, desconexão, descorrelação, desalinhamento, desequilíbrio
- CA: desacoblament, desconnexió, desfasament, bretxa, desalineació

### GAP 3: No multilingual terms in ANY thesaurus

The entire SEMANTIC_BRIDGE thesaurus is Spanish-only. The system supports 4 languages (ES/EN/PT/CA) but none of the EN/PT/CA terms will match Layer 1 — they ALL fall to the LLM fallback (Layer 2), which is slower and less reliable.

**Fix**: Add EN/PT/CA terms to all key metric and intent thesaurus entries.

### GAP 4: Missing financial results & equity story intents

The normalize-query dictionary maps "earnings", "cuentas anuales", "equity story" to specific skills, but the SEMANTIC_BRIDGE has no dedicated handling. "Cuentas anuales" is in `26_drm_score` but not tied to a `companyProfile` intent trigger.

### GAP 5: skillInterpretQuery.ts (client-side) has no CXM patterns

`DIVERGENCE_PATTERNS` regex doesn't include "desacoplamiento", "brecha", "gap", "mismatch", etc. No regex at all for CXM/stock queries. This is the fallback if normalize-query times out (3s), so it should cover basics.

---

### Implementation Plan

**File 1: `supabase/functions/chat-intelligence/index.ts`**

1. **`44_cxm_score` thesaurus** (~line 1176): Add ~40 multilingual stock/valuation terms. Remove overlapping stock terms from `26_drm_score` (~line 1125).

2. **`divergence` intent** (~line 1233): Add ~30 multilingual decoupling/mismatch synonyms.

3. **All other thesaurus entries**: Add core EN/PT/CA terms for the most common metrics (NVM, CEM, GAM, SIM, RMM, DCM) and intents (company_analysis, ranking, evolution, sector_comparison, metric_deep_dive).

4. **Add `financial_results` and `equity_story` entries** to INTENT_THESAURUS with multilingual synonyms.

**File 2: `src/lib/skills/skillInterpretQuery.ts`**

5. Add `CXM_PATTERNS` regex for stock/valuation queries.
6. Expand `DIVERGENCE_PATTERNS` to include decoupling synonyms.
7. Add basic EN/PT patterns to existing regexes.

**Deployment**: Redeploy `chat-intelligence` edge function.

### Estimated scope
- ~100 new synonym entries across METRIC_THESAURUS
- ~50 new synonym entries across INTENT_THESAURUS  
- ~15 new EN/PT/CA terms per existing thesaurus category
- Updated regex patterns in skillInterpretQuery

