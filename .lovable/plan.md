

# Fix: E2 DataPack Must Use ONLY Verified Competitors

## The Problem

The `buildDataPack` function (E2) ignores the existing `getRelevantCompetitors()` function (which correctly reads `verified_competitors` from `repindex_root_issuers`). Instead, E2:

- Uses `sector_category` to find "sector peers" (line 1121-1143) -- this pulls in companies that are NOT direct competitors
- Fetches ALL companies for ranking (line 1146-1165) -- includes irrelevant companies
- Never reads the `verified_competitors` column at all

This means the reports include sector comparisons with companies that have nothing to do with each other, and rankings that mix unrelated businesses.

## The Fix

### 1. Add `competidores_verificados` to the DataPack interface

Add a new field to the `DataPack` interface:
```
competidores_verificados: { ticker: string; nombre: string; rix_avg: number | null }[]
```

### 2. Rewrite E2's competitor/sector logic

Replace the current "Query B: Sector averages" and "Query C: Ranking" blocks with:

1. Read `verified_competitors` from `repindex_root_issuers` for the primary ticker
2. If `verified_competitors` is empty or null: set `competidores_verificados = []`, `sector_avg = null`, `ranking = []` -- no competitor data at all
3. If `verified_competitors` has entries: fetch RIX data ONLY for those specific tickers, compute `sector_avg` from them, and build ranking ONLY from them plus the primary company

This replaces ~40 lines of sector-based logic with ~30 lines of verified-competitor-based logic.

### 3. Update E4 (Comparator) prompt

The comparator prompt currently receives "SECTOR" and "RANKING" blocks. Update:
- Replace "Promedio sector" with "Promedio competidores verificados" (or "Sin competidores verificados" if empty)
- Replace "Top 5" ranking with only verified competitors ranking
- Add explicit instruction: "Solo compara con competidores verificados. Si no hay, omite la comparativa."

### 4. Update E5 (Orchestrator) system prompt

Add a rule to the system prompt:
- "COMPETIDORES: Usa EXCLUSIVAMENTE los competidores del DATAPACK. Si el campo competidores_verificados esta vacio, NO incluyas comparativa competitiva. Nunca busques competidores por sector."

### 5. Remove the generic "all companies" ranking query

Delete the current "Query C" block (lines 1146-1165) that fetches 3,000 rows of ALL companies to build a general ranking. This is wasteful and produces irrelevant data.

## What Changes

| Before | After |
|--------|-------|
| Sector avg from ALL companies with same `sector_category` | Average from ONLY verified competitors |
| Ranking of ALL 100+ companies | Ranking of ONLY verified competitors + primary |
| If no sector match, still shows generic ranking | If no verified competitors, no comparativa at all |
| `getRelevantCompetitors()` is dead code for E2 | E2 reads `verified_competitors` directly from the issuer record |

## Files Changed

- `supabase/functions/chat-intelligence/index.ts`:
  - Update `DataPack` interface (add `competidores_verificados`)
  - Rewrite E2's Query B + Query C blocks to use `verified_competitors`
  - Update E4 comparator prompt to reference verified competitors only
  - Add anti-fabrication rule to E5 system prompt about competitors
