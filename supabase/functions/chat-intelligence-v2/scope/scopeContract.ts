// chat-intelligence-v2 / scope / scopeContract.ts
// Fase 1 — Acotacion quirurgica de datos.
// Construye un ScopeContract inmutable a partir de los filtros resueltos
// (universo, sector, subsector, tickers, modelos, ventana). La validacion
// se apoya SIEMPRE en la vista SQL `v_issuer_scope` para que la definicion
// "que tickers pertenecen a que subsector/sector/universo" sea unica en
// todo el sistema.
//
// Reglas duras:
//   1. Si tras resolver no hay tickers validos -> throw ScopeResolutionError.
//      Nunca scope parcial. Nunca relleno con peers.
//   2. Tickers que no existen en `v_issuer_scope` se descartan y quedan
//      registrados en `resolved_from.tickers_dropped`.
//   3. `models` por defecto = los 6 canonicos.
//   4. `window` se acota al floor 2026-01-01.
//   5. El objeto se devuelve congelado (`Object.freeze`).

import type { ModelName } from "../types.ts";

const DATA_FLOOR = "2026-01-01";

const ALL_MODELS: ModelName[] = [
  "ChatGPT",
  "Perplexity",
  "Gemini",
  "DeepSeek",
  "Grok",
  "Qwen",
];

export type ScopeKind = "subsector" | "sector" | "ibex_family" | "tickers" | "universe";

export interface ScopeWindow {
  from: string; // ISO yyyy-mm-dd
  to: string;   // ISO yyyy-mm-dd
}

export interface ResolvedFrom {
  universe_source: string | null;
  sector_source: string | null;
  subsector_source: string | null;
  tickers_source: string;
  models_source: string;
  window_source: string;
  tickers_dropped: string[];
}

export interface ScopeContract {
  readonly kind: ScopeKind;
  readonly universe: string | null;
  readonly sector: string | null;
  readonly subsector: string | null;
  readonly tickers: ReadonlyArray<string>;
  readonly models: ReadonlyArray<ModelName>;
  readonly window: Readonly<ScopeWindow>;
  readonly resolved_from: Readonly<ResolvedFrom>;
}

export class ScopeResolutionError extends Error {
  details: Record<string, unknown>;
  constructor(msg: string, details: Record<string, unknown> = {}) {
    super(msg);
    this.name = "ScopeResolutionError";
    this.details = details;
  }
}

export interface BuildScopeInput {
  kind: ScopeKind;
  universe?: string | null;
  sector?: string | null;
  subsector?: string | null;
  candidate_tickers?: string[] | null;
  models?: ModelName[] | null;
  window: ScopeWindow;
  sources: {
    universe_source?: string | null;
    sector_source?: string | null;
    subsector_source?: string | null;
    tickers_source: string;
    models_source: string;
    window_source: string;
  };
}

export async function buildScopeContract(
  input: BuildScopeInput,
  supabase: any,
): Promise<ScopeContract> {
  const from = input.window?.from && input.window.from > DATA_FLOOR
    ? input.window.from
    : DATA_FLOOR;
  const to = input.window?.to ?? from;
  if (!from || !to || from > to) {
    throw new ScopeResolutionError("Ventana temporal invalida", { from, to });
  }

  const models: ModelName[] = (input.models && input.models.length > 0)
    ? Array.from(new Set(input.models))
    : ALL_MODELS.slice();

  let candidates: string[] = [];
  let derivation = "candidate_tickers";

  if (Array.isArray(input.candidate_tickers) && input.candidate_tickers.length > 0) {
    candidates = input.candidate_tickers
      .map((t) => String(t || "").trim().toUpperCase())
      .filter(Boolean);
  } else if (input.subsector) {
    derivation = "subsector";
    const { data, error } = await supabase
      .from("v_issuer_scope")
      .select("ticker")
      .ilike("subsector", input.subsector);
    if (error) {
      throw new ScopeResolutionError("Fallo consultando v_issuer_scope por subsector", { error: error.message });
    }
    candidates = (data ?? []).map((r: any) => String(r.ticker).toUpperCase());
  } else if (input.sector) {
    derivation = "sector";
    const { data, error } = await supabase
      .from("v_issuer_scope")
      .select("ticker")
      .eq("sector_category", input.sector);
    if (error) {
      throw new ScopeResolutionError("Fallo consultando v_issuer_scope por sector", { error: error.message });
    }
    candidates = (data ?? []).map((r: any) => String(r.ticker).toUpperCase());
  } else if (input.universe) {
    derivation = "universe";
    const { data, error } = await supabase
      .from("v_issuer_scope")
      .select("ticker")
      .eq("ibex_family_code", input.universe);
    if (error) {
      throw new ScopeResolutionError("Fallo consultando v_issuer_scope por universo", { error: error.message });
    }
    candidates = (data ?? []).map((r: any) => String(r.ticker).toUpperCase());
  } else {
    throw new ScopeResolutionError(
      "Imposible derivar scope: faltan candidate_tickers / subsector / sector / universe",
      { input },
    );
  }

  if (candidates.length === 0) {
    throw new ScopeResolutionError(
      `Scope vacio tras derivacion (${derivation}). Nunca se rellena con peers.`,
      { kind: input.kind, derivation, subsector: input.subsector, sector: input.sector, universe: input.universe },
    );
  }

  const { data: validRows, error: vErr } = await supabase
    .from("v_issuer_scope")
    .select("ticker, sector_category, subsector, ibex_family_code")
    .in("ticker", candidates);
  if (vErr) {
    throw new ScopeResolutionError("Fallo validando tickers contra v_issuer_scope", { error: vErr.message });
  }
  const validSet = new Set((validRows ?? []).map((r: any) => String(r.ticker).toUpperCase()));
  const validatedTickers = candidates.filter((t) => validSet.has(t));
  const dropped = candidates.filter((t) => !validSet.has(t));

  if (validatedTickers.length === 0) {
    throw new ScopeResolutionError(
      "Tras validar contra v_issuer_scope no queda ningun ticker. Pipeline aborta.",
      { kind: input.kind, candidates, dropped },
    );
  }

  const resolved_from: ResolvedFrom = {
    universe_source: input.sources.universe_source ?? null,
    sector_source: input.sources.sector_source ?? null,
    subsector_source: input.sources.subsector_source ?? null,
    tickers_source: `${input.sources.tickers_source}:${derivation}`,
    models_source: input.sources.models_source,
    window_source: input.sources.window_source,
    tickers_dropped: dropped,
  };

  const contract: ScopeContract = {
    kind: input.kind,
    universe: input.universe ?? null,
    sector: input.sector ?? null,
    subsector: input.subsector ?? null,
    tickers: Object.freeze(validatedTickers.slice()),
    models: Object.freeze(models.slice()),
    window: Object.freeze({ from, to }),
    resolved_from: Object.freeze(resolved_from),
  };
  return Object.freeze(contract);
}

export function isScopeContract(x: unknown): x is ScopeContract {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return Object.isFrozen(o)
    && Array.isArray(o.tickers)
    && Array.isArray(o.models)
    && typeof o.window === "object"
    && typeof (o.window as any).from === "string"
    && typeof (o.window as any).to === "string";
}

export const __DATA_FLOOR__ = DATA_FLOOR;
export const __ALL_MODELS__ = ALL_MODELS;
