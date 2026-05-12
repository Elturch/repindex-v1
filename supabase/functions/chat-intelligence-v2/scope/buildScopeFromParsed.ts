// chat-intelligence-v2 / scope / buildScopeFromParsed.ts
// Fase 1 — Adaptador entre `ParsedQuery` (parser legacy) y `ScopeContract`
// (capa scoped). NO resuelve nuevos tickers ni inventa peers. Reutiliza:
//   - parsed.scope_tickers cuando existen (subsegmento / subsector estricto
//     / multi-sector tesauro)
//   - parsed.entities cuando no hay scope_tickers
//   - parsed.scope_label como pista de subsector / sector cuando aplique
// Si nada de esto da tickers, deja que buildScopeContract lance
// ScopeResolutionError (NO se rellena nada).

import type { ParsedQuery } from "../types.ts";
import {
  buildScopeContract,
  type BuildScopeInput,
  type ScopeContract,
  type ScopeKind,
} from "./scopeContract.ts";

export interface BuildScopeFromParsedOpts {
  /** Etiqueta literal de subsector cuando el orchestrator detecto
   *  "subsector X" (ya validada contra repindex_root_issuers). */
  strict_subsector?: string | null;
  /** Sector_category resuelto por el detector legacy (sector hint). */
  sector_hint?: string | null;
}

export async function buildScopeFromParsed(
  parsed: ParsedQuery,
  supabase: any,
  opts: BuildScopeFromParsedOpts = {},
): Promise<ScopeContract> {
  const fromTickers: string[] = [];
  if (Array.isArray(parsed.scope_tickers) && parsed.scope_tickers.length > 0) {
    fromTickers.push(...parsed.scope_tickers);
  } else if (parsed.entities && parsed.entities.length > 0) {
    fromTickers.push(...parsed.entities.map((e) => e.ticker).filter(Boolean));
  }

  const subsector = opts.strict_subsector ?? null;
  const sector = opts.sector_hint ?? null;

  let kind: ScopeKind = "tickers";
  if (fromTickers.length === 0 && subsector) kind = "subsector";
  else if (fromTickers.length === 0 && sector) kind = "sector";
  else if (subsector) kind = "subsector";
  else if (sector) kind = "sector";

  const window = {
    from: parsed.temporal?.requested_from ?? parsed.temporal?.from ?? "2026-01-01",
    to: parsed.temporal?.requested_to ?? parsed.temporal?.to ?? "2026-01-01",
  };

  const input: BuildScopeInput = {
    kind,
    universe: null,
    sector,
    subsector,
    candidate_tickers: fromTickers.length > 0 ? fromTickers : null,
    models: parsed.models,
    window,
    sources: {
      universe_source: null,
      sector_source: sector ? "orchestrator.sector_hint" : null,
      subsector_source: subsector ? "orchestrator.strict_subsector" : null,
      tickers_source:
        Array.isArray(parsed.scope_tickers) && parsed.scope_tickers.length > 0
          ? "parsed.scope_tickers"
          : "parsed.entities",
      models_source: "parsed.models",
      window_source: "parsed.temporal",
    },
  };

  return buildScopeContract(input, supabase);
}