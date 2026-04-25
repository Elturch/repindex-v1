// supabase/functions/_shared/semanticHintCache.ts
// In-memory hot-set of semantic group aliases (113 from rix_semantic_groups).
// Powers a SYNC `hasSemanticGroupAlias(question)` check used by intentClassifier
// to recognise canonical-group queries that don't appear in SECTOR_HINT_RE.
// Hydrated fire-and-forget from entityResolver.loadCatalog (warm-up path) and
// shares the 5-min TTL contract with _shared/semanticGroups.ts.
// Cold-start fallback: SECTOR_HINT_RE in intentClassifier.ts already lists all
// 21 canonical_keys, so the first request before warm-up still classifies right.

const TTL_MS = 5 * 60 * 1000; // 5 min — paridad V1
let aliasSet: Set<string> | null = null;
let lastLoad = 0;
let inflight: Promise<void> | null = null;

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const BOUNDARY_RE = /[\s,;:.!?¿¡()\-\/]/;

/**
 * Fire-and-forget warm-up. Safe to call on every catalog load.
 * No-op if cache is fresh or another warm-up is already in flight.
 */
export function warmSemanticHintCache(supabase: any): void {
  if (!supabase) return;
  if (aliasSet && Date.now() - lastLoad < TTL_MS) return;
  if (inflight) return;
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("rix_semantic_groups")
        .select("aliases")
        .limit(100);
      if (error || !Array.isArray(data)) {
        console.warn(`[SEMANTIC_HINT_CACHE] fetch failed: ${error?.message ?? "no data"}`);
        return;
      }
      const next = new Set<string>();
      for (const row of data) {
        const aliases: string[] = Array.isArray(row?.aliases) ? row.aliases : [];
        for (const a of aliases) {
          const n = norm(a);
          if (n.length >= 3) next.add(n);
        }
      }
      aliasSet = next;
      lastLoad = Date.now();
      console.log(`[SEMANTIC_HINT_CACHE] warmed | aliases=${aliasSet.size}`);
    } catch (e: any) {
      console.warn(`[SEMANTIC_HINT_CACHE] warm error: ${e?.message ?? e}`);
    } finally {
      inflight = null;
    }
  })();
}

/**
 * SYNC check — returns true if the question contains any canonical-group alias
 * with proper word boundaries. Returns false if the cache hasn't been warmed
 * yet (cold-start path is covered by SECTOR_HINT_RE in intentClassifier).
 */
export function hasSemanticGroupAlias(question: string): boolean {
  if (!aliasSet || aliasSet.size === 0) return false;
  if (!question || !question.trim()) return false;
  const lower = norm(question);
  for (const a of aliasSet) {
    const idx = lower.indexOf(a);
    if (idx === -1) continue;
    const end = idx + a.length;
    const before = idx === 0 || BOUNDARY_RE.test(lower[idx - 1]);
    const after = end >= lower.length || BOUNDARY_RE.test(lower[end]);
    if (before && after) return true;
  }
  return false;
}

export const __test__ = {
  norm,
  reset: () => { aliasSet = null; lastLoad = 0; inflight = null; },
  size: () => aliasSet?.size ?? 0,
};
