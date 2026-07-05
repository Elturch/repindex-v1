/**
 * Informes RIX — Coherence engine
 *
 * Declarative rules that propagate filter dependencies bidirectionally
 * (descendente: Universo→Sector→Subsector→Empresa; ascendente: Empresa→Sector→Universo).
 *
 * Rules NEVER overwrite a `user-set` value silently. They:
 *   - Auto-fill `free` slots with `derived` values.
 *   - Emit warnings when a `user-set` choice conflicts with another `user-set` choice.
 *   - Hide / disable impossible options (delegated to UI via `disabledOptions`).
 */

import {
  FilterState,
  setFilter,
  IntentType,
  Universe,
  DATA_FLOOR,
} from "./filterState";

export interface CompanyMeta {
  ticker: string;
  issuer_name: string;
  sector_category: string | null;
  subsector?: string | null;
  ibex_family_code: string | null;
  verified_competitors?: string[] | null;
  cotiza_en_bolsa?: boolean | null;
}

export interface CoherenceWarning {
  level: "info" | "warning" | "error";
  filterId?: string;
  message: string;
  rule: string;
}

export interface CoherenceResult {
  state: FilterState;
  warnings: CoherenceWarning[];
  /** Filters that the UI should hide because the current intent doesn't use them. */
  hiddenFilters: string[];
  /** Filters that should be visually marked as disabled (no valid options left). */
  disabledFilters: string[];
}

/** Returns filters that don't apply for a given intent. */
function hiddenForIntent(intent: IntentType): string[] {
  switch (intent) {
    case "perfil":
      return ["topN", "order"];
    case "comparativa":
      return ["topN"];
    case "evolucion":
      return ["topN", "order"];
    case "divergencia":
      return [];
    case "ranking":
      return [];
    case "vision_general":
    default:
      return [];
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Run the full coherence pass over the current filter state.
 * Idempotent: calling it twice with the same input returns the same output.
 */
export function runCoherence(
  state: FilterState,
  companies: CompanyMeta[],
): CoherenceResult {
  const warnings: CoherenceWarning[] = [];
  let next = state;

  // Index companies by ticker for O(1) lookups
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));

  // ──────────────────────────────────────────────────────────────────────
  // R1 — Ascendente: tickers → sector / subsector / universe (auto-fill)
  // ──────────────────────────────────────────────────────────────────────
  if (next.tickers.value.length > 0) {
    const selected = next.tickers.value
      .map((t) => byTicker.get(t))
      .filter((c): c is CompanyMeta => Boolean(c));

    const inferredSectors = unique(
      selected.map((c) => c.sector_category).filter((s): s is string => !!s),
    );
    const inferredSubsectors = unique(
      selected.map((c) => c.subsector ?? null).filter((s): s is string => !!s),
    );

    if (next.sector.origin === "free" && inferredSectors.length > 0) {
      next = setFilter(next, "sector", inferredSectors, "derived", "tickers");
    } else if (
      next.sector.origin === "user-set" &&
      inferredSectors.length > 0 &&
      !inferredSectors.every((s) => next.sector.value.includes(s))
    ) {
      warnings.push({
        level: "warning",
        filterId: "sector",
        rule: "R1",
        message: `Las empresas seleccionadas pertenecen a sectores no incluidos: ${inferredSectors
          .filter((s) => !next.sector.value.includes(s))
          .join(", ")}.`,
      });
    }

    if (next.subsector.origin === "free" && inferredSubsectors.length > 0) {
      next = setFilter(next, "subsector", inferredSubsectors, "derived", "tickers");
    }

    // Universe is NEVER auto-derived from tickers: mixing listed / non-listed
    // entities (e.g. Inditex + El Corte Inglés) is a valid free comparison and
    // must not shrink the pool of selectable companies.

    // R6 — multi-sector con varias empresas → recomendar comparativa
    if (
      inferredSectors.length > 1 &&
      next.intent.origin === "free" &&
      next.intent.value !== "comparativa"
    ) {
      warnings.push({
        level: "info",
        filterId: "intent",
        rule: "R6",
        message:
          "Has elegido empresas de sectores distintos. ¿Quieres una comparativa?",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // R2 — Ascendente: sector → universo (si todas las empresas del sector
  // pertenecen al mismo universo)
  // ──────────────────────────────────────────────────────────────────────
  if (next.sector.value.length > 0 && next.universe.origin === "free") {
    const sectorCompanies = companies.filter(
      (c) => c.sector_category && next.sector.value.includes(c.sector_category),
    );
    const universes = unique(
      sectorCompanies.map((c) => c.ibex_family_code).filter((u): u is string => !!u),
    ) as Universe[];
    // Do NOT auto-derive universe from sector either: it can silently exclude
    // non-listed entities in the same sector (foundations, private companies).
    void universes;
  }

  // R2b — If sector is user-set and spans multiple universes, unlock any
  // previously derived universe so it doesn't shrink the company pool.
  if (
    next.sector.origin === "user-set" &&
    next.sector.value.length > 0 &&
    next.universe.origin === "derived"
  ) {
    const sectorCompanies = companies.filter(
      (c) => c.sector_category && next.sector.value.includes(c.sector_category),
    );
    const universes = unique(
      sectorCompanies.map((c) => c.ibex_family_code).filter((u): u is string => !!u),
    );
    if (universes.length > 1) {
      next = setFilter(next, "universe", [], "free");
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // R-sub-1 — DESACTIVADA (2026-06-09): el subsector NO debe auto-rellenar
  // el sector padre. El usuario quiere que "Banca Comercial" se trate como
  // subsector puro, sin que aparezca "Banca y Servicios Financieros" en el
  // campo Sector. compileQuestion y buildReportTitle ya priorizan subsector
  // sobre sector, así que no hace falta el auto-derive.
  // ──────────────────────────────────────────────────────────────────────

  // R-sub-2 — Si el subsector ya no encaja con el sector user-set, limpiarlo
  if (
    next.subsector.value.length > 0 &&
    next.sector.value.length > 0
  ) {
    const validSubs = new Set(
      companies
        .filter((c) => c.sector_category && next.sector.value.includes(c.sector_category))
        .map((c) => c.subsector)
        .filter((s): s is string => !!s),
    );
    const filtered = next.subsector.value.filter((s) => validSubs.has(s));
    if (filtered.length !== next.subsector.value.length) {
      next = setFilter(next, "subsector", filtered, filtered.length ? next.subsector.origin : "free");
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // R12 — Si solo hay 1 modelo, divergencia no tiene sentido
  // ──────────────────────────────────────────────────────────────────────
  if (
    next.models.value.length <= 1 &&
    next.intent.value === "divergencia"
  ) {
    warnings.push({
      level: "error",
      filterId: "intent",
      rule: "R12",
      message:
        "La divergencia requiere al menos 2 modelos. Selecciona más modelos o cambia el tipo de informe.",
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // R5 — Ranking necesita un alcance ≥ sector (no tiene sentido con 1 empresa)
  // ──────────────────────────────────────────────────────────────────────
  if (
    next.intent.value === "ranking" &&
    next.tickers.value.length === 1 &&
    next.sector.value.length === 0 &&
    next.universe.value.length === 0
  ) {
    warnings.push({
      level: "warning",
      filterId: "intent",
      rule: "R5",
      message:
        "Un ranking de una sola empresa no aporta valor. Añade un sector o universo, o cambia a 'Perfil'.",
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // R8 — Comparativa: necesita ≥ 2 entidades
  // ──────────────────────────────────────────────────────────────────────
  if (
    next.intent.value === "comparativa" &&
    next.tickers.value.length < 2 &&
    next.sector.value.length < 2
  ) {
    warnings.push({
      level: "warning",
      filterId: "tickers",
      rule: "R8",
      message:
        "Una comparativa requiere al menos 2 empresas o 2 sectores.",
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // R10 — TopN > nº de empresas en el alcance → ajustar
  // ──────────────────────────────────────────────────────────────────────
  if (next.intent.value === "ranking") {
    const scope = computeScopeSize(next, companies);
    if (
      scope > 0 &&
      next.topN.origin === "user-set" &&
      next.topN.value > scope
    ) {
      warnings.push({
        level: "info",
        filterId: "topN",
        rule: "R10",
        message: `El alcance solo tiene ${scope} empresas. Top ${next.topN.value} se limitará a ${scope}.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // R15 — Suelo de datos: cobertura mínima 2026-01-01. Mutamos el estado
  //       en vez de solo avisar, para que la query final nunca incluya
  //       fechas pre-DATA_FLOOR y el agente no invente datos.
  // ──────────────────────────────────────────────────────────────────────
  if (next.window.value.from < DATA_FLOOR) {
    next = setFilter(
      next,
      "window",
      { ...next.window.value, from: DATA_FLOOR },
      next.window.origin,
    );
    warnings.push({
      level: "info",
      filterId: "window",
      rule: "R15",
      message:
        "Los datos históricos comienzan el 2026-01-01. La ventana se ha ajustado automáticamente.",
    });
  }

  return {
    state: next,
    warnings,
    hiddenFilters: hiddenForIntent(next.intent.value),
    disabledFilters: [],
  };
}

export function computeScopeSize(
  state: FilterState,
  companies: CompanyMeta[],
): number {
  if (state.tickers.value.length > 0) return state.tickers.value.length;
  let pool = companies;
  if (state.universe.value.length > 0 && state.universe.origin === "user-set") {
    pool = pool.filter((c) => matchesUniverse(c, state.universe.value));
  }
  if (state.sector.value.length > 0) {
    pool = pool.filter(
      (c) => c.sector_category && state.sector.value.includes(c.sector_category),
    );
  }
  if (state.subsector.value.length > 0) {
    pool = pool.filter(
      (c) => c.subsector && state.subsector.value.includes(c.subsector),
    );
  }
  return pool.length;
}

export function getScopeTickers(
  state: FilterState,
  companies: CompanyMeta[],
): string[] {
  if (state.tickers.value.length > 0) return state.tickers.value;
  let pool = companies;
  if (state.universe.value.length > 0 && state.universe.origin === "user-set") {
    pool = pool.filter((c) => matchesUniverse(c, state.universe.value));
  }
  if (state.sector.value.length > 0) {
    pool = pool.filter(
      (c) => c.sector_category && state.sector.value.includes(c.sector_category),
    );
  }
  if (state.subsector.value.length > 0) {
    pool = pool.filter(
      (c) => c.subsector && state.subsector.value.includes(c.subsector),
    );
  }
  return pool.map((c) => c.ticker);
}

/**
 * Universe filter matcher that supports the synthetic "NO-LISTED" bucket
 * (private / non-traded entities such as foundations, El Corte Inglés or
 * Mercadona) alongside the regular IBEX family codes.
 */
export function matchesUniverse(
  c: CompanyMeta,
  selected: Universe[],
): boolean {
  if (selected.length === 0) return true;
  const wantsNonListed = selected.includes("NO-LISTED" as Universe);
  if (wantsNonListed && c.cotiza_en_bolsa === false) return true;
  return Boolean(
    c.ibex_family_code && selected.includes(c.ibex_family_code as Universe),
  );
}