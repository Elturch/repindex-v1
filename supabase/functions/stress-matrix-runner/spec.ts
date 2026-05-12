// Loads the STRESS-MATRIX.json spec and expands it into concrete cases.
// We inline the spec as a TS const so the edge function is self-contained
// (Deno deploy does not bundle arbitrary repo files).

import type { StressCase } from "./asserts.ts";

export const SPEC = {
  spec_version: "v1",
  weeks: 4,
  models_individual: ["gemini", "deepseek", "grok", "qwen", "perplexity", "chatgpt"],
  subsectors_small: [
    { name: "Hoteles", tickers: ["MEL"], n: 1 },
    { name: "Aerolíneas", tickers: ["IAG"], n: 1 },
    { name: "Aeropuertos", tickers: ["AENA"], n: 1 },
    { name: "Cosmética y Perfumería", tickers: ["PUIG"], n: 1 },
    { name: "Hemoderivados", tickers: ["GRF"], n: 1 },
    { name: "Utilities Eléctricas", tickers: ["ELE", "IBE", "NTGY"], n: 3 },
    { name: "Big Tech", tickers: ["AMAZON-PRIV", "GOOGLE-PRIV", "META-PRIV"], n: 3 },
    { name: "Aseguradoras Generalistas", tickers: ["GCO.MC", "MAP", "MUTUA-PRIV"], n: 3 },
    { name: "Farmacéuticas", tickers: ["ALM", "FAE", "RJF", "ROVI"], n: 4 },
    { name: "Maquinaria", tickers: ["AZK", "GAM", "MDF", "NEA"], n: 4 },
    { name: "Banca Comercial", tickers: ["BBVA", "BKT", "CABK", "SAB", "SAN", "UNI"], n: 6 },
    { name: "Promotoras Residenciales", tickers: ["AED", "HOME", "INSUR", "MTB", "MVC", "REN", "RLIA"], n: 7 },
    { name: "Grupos Hospitalarios", tickers: ["HLA", "HMH", "HOS", "QS", "RS", "VIA", "VIT"], n: 7 },
    { name: "SOCIMIs / Patrimonialistas", tickers: ["AIRON", "ARM", "CAST", "CEVA", "COL", "LIB7", "LRE", "MRL", "UPH"], n: 9 },
    { name: "Renovables", tickers: ["ADX", "ANE.MC", "BKY", "ECR", "EIDF", "ENS", "GRE", "HLZ", "SLR", "SOL"], n: 10 },
    { name: "Constructoras", tickers: ["ACS", "ANA", "AZVI", "CLE", "FCC-PRIV", "FER", "GSJ", "OHL", "SCYR"], n: 9 },
  ],
  sanity_groups: [
    { name: "IBEX-35", ibex_family: "IBEX-35" },
    { name: "IBEX Medium Cap", ibex_family: "IBEX-MC" },
    { name: "IBEX Small Cap", ibex_family: "IBEX-SC" },
  ],
  hotels_reits_focus: ["Hoteles", "SOCIMIs / Patrimonialistas", "Promotoras Residenciales"],
};

function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12);
}

function buildSubsectorQuery(subsector: string, weeks: number, model: string | null): string {
  const base = subsector.toLowerCase().includes("hotel")
    ? `Dame el ranking del subsector ${subsector} en las últimas ${weeks} semanas`
    : `Ranking RIX del subsector ${subsector} en las últimas ${weeks} semanas`;
  if (!model) return base + " (multi-modelo)";
  return base + ` según ${model}`;
}

function buildIbexQuery(family: string, weeks: number): string {
  return `Dame el top-5 del ${family} en las últimas ${weeks} semanas (multi-modelo)`;
}

export function expandCases(family: "all" | "small" | "sanity" | "hotels-reits"): StressCase[] {
  const cases: StressCase[] = [];
  const weeks = SPEC.weeks;

  const wantSubsectors = family === "all" || family === "small" || family === "hotels-reits";
  if (wantSubsectors) {
    const subs = family === "hotels-reits"
      ? SPEC.subsectors_small.filter((s) => SPEC.hotels_reits_focus.includes(s.name))
      : SPEC.subsectors_small;
    for (const sub of subs) {
      // Multi-model
      cases.push({
        case_id: `${slug(sub.name)}-MULTI-${weeks}w`,
        family: family === "hotels-reits" ? "hotels-reits" : "small",
        query: buildSubsectorQuery(sub.name, weeks, null),
        scope: sub.name,
        scope_kind: "subsector",
        tickers: sub.tickers,
        n: sub.n,
        weeks,
        model_filter: null,
        expected_skill: "sectorRanking",
      });
      // 6 single-model variants (only for the focus family + hotels/REITs to bound cost)
      const wantSingles = family === "hotels-reits" || sub.name === "Hoteles";
      if (wantSingles) {
        for (const m of SPEC.models_individual) {
          cases.push({
            case_id: `${slug(sub.name)}-${m.toUpperCase()}-${weeks}w`,
            family: family === "hotels-reits" ? "hotels-reits" : "small",
            query: buildSubsectorQuery(sub.name, weeks, m),
            scope: sub.name,
            scope_kind: "subsector",
            tickers: sub.tickers,
            n: sub.n,
            weeks,
            model_filter: m,
            expected_skill: "sectorRanking",
          });
        }
      }
    }
  }

  if (family === "all" || family === "sanity") {
    for (const grp of SPEC.sanity_groups) {
      cases.push({
        case_id: `${slug(grp.name)}-MULTI-${weeks}w`,
        family: "sanity",
        query: buildIbexQuery(grp.name, weeks),
        scope: grp.ibex_family,
        scope_kind: "ibex_family",
        tickers: [], // sanity does not enforce ticker-level asserts (A1/A10 skipped)
        n: 5,
        weeks,
        model_filter: null,
        expected_skill: "sectorRanking",
      });
    }
  }

  return cases;
}