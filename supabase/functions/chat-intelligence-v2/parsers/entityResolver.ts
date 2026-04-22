// chat-intelligence-v2 / parsers / entityResolver.ts
// Resolves the company mentioned in the question by reusing the v1
// shared validators (NO duplicated logic). Max 300 LOC.
import {
  resolveEntity as sharedResolveEntity,
  type CatalogEntry,
} from "../../_shared/inputValidator.ts";
import { fuzzyCompanyMatch, fuzzyCompanyMatchSql } from "../../_shared/queryGuards.ts";
import type { ResolvedEntity } from "../types.ts";

const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 min
let catalogCache: { ts: number; rows: CatalogEntry[] } | null = null;

async function loadCatalog(supabase: any): Promise<CatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CATALOG_TTL_MS) {
    return catalogCache.rows;
  }
  try {
    const { data, error } = await supabase
      .from("repindex_root_issuers")
      .select("issuer_name, ticker, sector_category")
      .limit(2000);
    if (error) throw error;
    const rows: CatalogEntry[] = (data ?? []).map((r: any) => ({
      issuer_name: r.issuer_name,
      ticker: r.ticker,
    }));
    catalogCache = { ts: Date.now(), rows };
    // attach raw rows in module scope for sector lookup
    sectorByTicker.clear();
    for (const r of (data ?? [])) {
      if (r?.ticker) sectorByTicker.set(String(r.ticker).toUpperCase(), r.sector_category ?? null);
    }
    return rows;
  } catch (e) {
    console.error("[RIX-V2][entity] catalog load error:", e);
    return catalogCache?.rows ?? [];
  }
}

const sectorByTicker = new Map<string, string | null>();

function buildEntity(
  ticker: string,
  name: string,
  source: ResolvedEntity["source"],
): ResolvedEntity {
  return {
    ticker: (ticker || "").toUpperCase(),
    company_name: name,
    sector_category: sectorByTicker.get((ticker || "").toUpperCase()) ?? null,
    source,
  };
}

/**
 * Optional semantic-bridge layer using rix_company_aliases.
 * Returns the first alias hit. Gracefully degrades if the table is missing.
 */
async function semanticBridge(question: string, supabase: any): Promise<ResolvedEntity | null> {
  const lower = question.toLowerCase();
  try {
    const { data, error } = await supabase
      .from("rix_company_aliases")
      .select("alias, ticker, issuer_name")
      .limit(1000);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    for (const row of data) {
      const alias = String(row.alias || "").toLowerCase().trim();
      if (alias.length >= 3 && lower.includes(alias)) {
        return buildEntity(row.ticker, row.issuer_name || row.alias, "semantic_bridge");
      }
    }
  } catch (_e) {
    // table may not exist in this environment — silent
  }
  return null;
}

/**
 * Public entry: resolveEntity(question, supabase): ResolvedEntity | null
 *
 * Resolution order:
 *   1. Shared resolveEntity → exact / fuzzy / foreign / ambiguous decisions.
 *      Foreign / ambiguous are NOT entities → null (guards handle them).
 *   2. If shared returned `not_found`, try semantic bridge (aliases).
 *   3. If still nothing, fall back to fuzzyCompanyMatch on the catalog.
 *   4. Otherwise null.
 */
export async function resolveEntity(
  question: string,
  supabase: any,
): Promise<ResolvedEntity | null> {
  if (!question || !question.trim()) return null;
  const catalog = await loadCatalog(supabase);

  // (1) Shared resolver — covers exact + fuzzy + foreign + ambiguous.
  const v1 = sharedResolveEntity(question, catalog);

  if (v1.matched && v1.ticker && v1.empresa_nombre) {
    const source: ResolvedEntity["source"] =
      v1.confidence === "fuzzy" ? "fuzzy" : "exact";
    return buildEntity(v1.ticker, v1.empresa_nombre, source);
  }

  // foreign_subsidiary / ambiguous → not a valid entity for this turn.
  if (v1.confidence === "foreign_subsidiary" || v1.confidence === "ambiguous") {
    return null;
  }

  // (2) Semantic bridge via aliases table.
  const bridged = await semanticBridge(question, supabase);
  if (bridged) return bridged;

  // (3) Fuzzy fallback on the in-memory catalog.
  const fuzzy = fuzzyCompanyMatch(question, catalog, 1);
  if (fuzzy.length > 0 && fuzzy[0].ticker) {
    return buildEntity(fuzzy[0].ticker, fuzzy[0].issuer_name, "fuzzy");
  }

  // (4) Last resort: SQL-backed pg_trgm fuzzy. Used to detect
  //     unknown corporate-shaped names (returns suggestions, not a hit
  //     we can adopt). We only adopt when status === "known".
  try {
    const sql = await fuzzyCompanyMatchSql(question, supabase);
    if (sql.status === "known" && sql.brand) {
      // The shared resolver already covered exact substring; nothing new.
      return null;
    }
  } catch (_e) {
    // ignore
  }

  return null;
}

/**
 * Resolve multiple entities mentioned in a single question (used by
 * `comparison` intent). Strategy:
 *  1. Split the question on common comparison connectors ("vs", "versus",
 *     "frente a", "contra", "y", ",") and try resolveEntity on each chunk.
 *  2. Also run resolveEntity on the full question to catch the first hit.
 *  3. Deduplicate by ticker, preserve order, return up to `max` matches.
 */
export async function resolveMultipleEntities(
  question: string,
  supabase: any,
  max = 4,
): Promise<ResolvedEntity[]> {
  if (!question || !question.trim()) return [];
  const out: ResolvedEntity[] = [];
  const seen = new Set<string>();
  const push = (e: ResolvedEntity | null) => {
    if (!e || !e.ticker || e.ticker === "N/A") return;
    const key = e.ticker.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // (a) Split on comparison connectors and resolve each chunk.
  const chunks = question
    .split(/\b(?:vs\.?|versus|frente\s+a|contra|compara(?:r|me)?|comparar|y)\b|,/gi)
    .map((c) => c.trim())
    .filter((c) => c.length >= 2);

  for (const chunk of chunks) {
    if (out.length >= max) break;
    try {
      const e = await resolveEntity(chunk, supabase);
      push(e);
    } catch (_) { /* noop */ }
  }

  // (b) Fallback: try the full question (covers single-entity edge cases).
  if (out.length < max) {
    try {
      const e = await resolveEntity(question, supabase);
      push(e);
    } catch (_) { /* noop */ }
  }

  return out.slice(0, max);
}

export const __test__ = { loadCatalog, semanticBridge };