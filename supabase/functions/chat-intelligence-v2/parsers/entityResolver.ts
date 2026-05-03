// chat-intelligence-v2 / parsers / entityResolver.ts
// Resolves the company mentioned in the question by reusing the v1
// shared validators (NO duplicated logic). Max 300 LOC.
import {
  resolveEntity as sharedResolveEntity,
  type CatalogEntry,
} from "../../_shared/inputValidator.ts";
import { fuzzyCompanyMatch, fuzzyCompanyMatchSql } from "../../_shared/queryGuards.ts";
import { warmSemanticHintCache } from "../../_shared/semanticHintCache.ts";
import type { ResolvedEntity } from "../types.ts";

const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 min
let catalogCache: { ts: number; rows: CatalogEntry[] } | null = null;

// Spanish leading verbs / conversational filler that the fuzzy matcher
// must NOT treat as a brand candidate. Without this, "dame" → fuzzy
// matches "Damm" (cervecera), "dime" → "DIA", etc. We strip these
// tokens from the question before handing it to fuzzyCompanyMatch.
const FUZZY_STOP_WORDS = new Set<string>([
  "dame", "dime", "muestrame", "muéstrame", "ensename", "enséñame",
  "cuentame", "cuéntame", "hazme", "quiero", "necesito", "mostrar",
  "muestra", "lista", "listame", "listame", "dale", "dadme",
  "explicame", "explícame", "resume", "resumeme", "resúmeme",
]);

// Sprint 1 Fix 4 — Hardcoded alias map. Resolves common informal forms
// that the catalog ILIKE / fuzzy paths miss (e.g. "Caixa" doesn't fuzzy-
// match "CaixaBank, S.A." reliably). Keys are normalised lowercase
// (no accents). Values are canonical { ticker, name } pairs that already
// exist in repindex_root_issuers.
const HARDCODED_ALIAS_MAP: Record<string, { ticker: string; name: string }> = {
  "caixa": { ticker: "CABK", name: "CaixaBank" },
  "la caixa": { ticker: "CABK", name: "CaixaBank" },
  "caixabank": { ticker: "CABK", name: "CaixaBank" },
};

function normaliseAliasKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tryHardcodedAlias(question: string): { ticker: string; name: string } | null {
  const norm = " " + normaliseAliasKey(question) + " ";
  // Sort longer aliases first to prefer "la caixa" over "caixa".
  const keys = Object.keys(HARDCODED_ALIAS_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (norm.includes(" " + k + " ")) return HARDCODED_ALIAS_MAP[k];
  }
  return null;
}

// BUG B fix — Conversational follow-ups WITHOUT a brand mention. When the
// question matches one of these patterns AND has no capitalised brand-shaped
// token, resolveEntity must return null so the orchestrator's inheritance
// path can take over (sticky entity from previous turn). Without this
// guard, "¿qué tal este trimestre?" was fuzzy-matching to CIE Automotive.
const CONVERSATIONAL_FOLLOWUP_RE =
  /^[¿¡\s]*(?:y\s+|pero\s+|ahora\s+)?(?:qu[eé]\s+tal|c[oó]mo\s+(?:va|le\s+va|est[aá])|c[uoó]m[oa]\s+anda|y\s+ahora|y\s+esto|y\s+eso|y\s+entonces|expl[ií]came(?:lo)?|cu[eé]ntame(?:lo)?\s*(?:m[aá]s)?|dim[ée]lo|d[ií]melo|y\s+su\b|y\s+sus\b|y\s+el\s+|y\s+la\s+|y\s+los\s+|y\s+las\s+|profundiza|amp?l[ií]a|extiend?e|contin[uú]a|sigue|m[aá]s\s+detalles?)\b/i;
const HAS_CAPITALISED_BRAND_RE = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}\b|\b[A-Z]{3,}\b/;

function isPureConversationalFollowup(question: string): boolean {
  if (!question) return false;
  const t = question.trim();
  // Short queries (<=10 words) that match the cue regex AND lack a
  // brand-shaped capitalised token are treated as pure follow-ups.
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc === 0 || wc > 10) return false;
  if (HAS_CAPITALISED_BRAND_RE.test(t)) return false;
  return CONVERSATIONAL_FOLLOWUP_RE.test(t);
}

function stripFuzzyStopWords(question: string): string {
  if (!question) return question;
  const tokens = question.split(/(\s+)/);
  return tokens
    .map((tok) => {
      const stripped = tok
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zñ]/g, "");
      if (stripped && FUZZY_STOP_WORDS.has(stripped)) return " ";
      // Also handle accented form against the un-normalised set
      if (FUZZY_STOP_WORDS.has(tok.toLowerCase())) return " ";
      return tok;
    })
    .join("");
}

async function loadCatalog(supabase: any): Promise<CatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CATALOG_TTL_MS) {
    // Keep the semantic-hint cache hot alongside the catalog (no-op if fresh).
    warmSemanticHintCache(supabase);
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
    // Fire-and-forget warm-up of the semantic-group alias hot-set so the
    // intent classifier can recognise canonical aliases (renovables, telecos…)
    // synchronously on subsequent calls within the same isolate.
    warmSemanticHintCache(supabase);
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

  // BUG B fix — pure conversational follow-ups must NOT trigger fuzzy
  // matching (which falsely produced CIE for "¿qué tal este trimestre?").
  // Returning null here lets the orchestrator's inheritance fallback adopt
  // the sticky entity from the previous turn.
  if (isPureConversationalFollowup(question)) {
    console.log(`[RIX-V2][entity] conversational follow-up detected, skipping resolution: "${question.slice(0, 60)}"`);
    return null;
  }

  const catalog = await loadCatalog(supabase);

  // Sprint 1 Fix 4 — Hardcoded alias short-circuit (highest priority).
  // Runs BEFORE the shared resolver so common informal names like
  // "Caixa" / "la caixa" reliably resolve to CABK without depending on
  // pg_trgm fuzzy distance.
  const aliasHit = tryHardcodedAlias(question);
  if (aliasHit) {
    console.log(`[RIX-V2][entity] hardcoded alias hit → ${aliasHit.ticker}`);
    return buildEntity(aliasHit.ticker, aliasHit.name, "exact");
  }

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
  const sanitisedQuestion = stripFuzzyStopWords(question);
  const fuzzy = fuzzyCompanyMatch(sanitisedQuestion, catalog, 1);
  if (fuzzy.length > 0 && fuzzy[0].ticker) {
    return buildEntity(fuzzy[0].ticker, fuzzy[0].issuer_name, "fuzzy");
  }

  // (4) Last resort: SQL-backed pg_trgm fuzzy. Used to detect
  //     unknown corporate-shaped names (returns suggestions, not a hit
  //     we can adopt). We only adopt when status === "known".
  try {
    const sql = await fuzzyCompanyMatchSql(sanitisedQuestion, supabase);
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
  //     We include "con" and "y" as Spanish comparison connectors
  //     ("compara X con Y", "compara X y Z"), plus the typical "vs" family.
  const chunks = question
    .split(/\b(?:vs\.?|versus|frente\s+a|contra|compara(?:r|me|tiva)?|comparar|con|y)\b|,/gi)
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