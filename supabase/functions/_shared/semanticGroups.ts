// supabase/functions/_shared/semanticGroups.ts
// Shared semantic-group resolver — DB-driven (rix_semantic_groups).
// Réplica literal de _deprecated_chat-intelligence/index.ts:1366-1430.
// Cache 5 min · word-boundary match · longest-alias-wins · exclusions soportadas.
// Invocado desde skills/sectorRanking.ts y skills/comparison.ts.
// NO debe ser invocado desde orchestrator.ts ni datapack/builder.ts.

export interface SemanticGroupHit {
  canonical_key: string | null;
  display_name: string | null;
  issuer_ids: string[];
  exclusions: string[];
}

interface SemanticGroupRow {
  canonical_key: string;
  display_name: string;
  aliases: string[] | null;
  issuer_ids: string[] | null;
  exclusions: string[] | null;
}

let cache: { data: SemanticGroupRow[]; ts: number } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 min — paridad V1

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const BOUNDARY_RE = /[\s,;:.!?¿¡()\-\/]/;

export async function resolveSemanticGroup(
  question: string,
  supabase: any,
): Promise<SemanticGroupHit> {
  const empty: SemanticGroupHit = {
    canonical_key: null, display_name: null, issuer_ids: [], exclusions: [],
  };
  if (!question || !question.trim()) return empty;

  try {
    if (!cache || Date.now() - cache.ts > TTL_MS) {
      const { data, error } = await supabase
        .from("rix_semantic_groups")
        .select("canonical_key, display_name, aliases, issuer_ids, exclusions")
        .limit(100);
      if (error || !Array.isArray(data)) {
        console.warn(`[SEMANTIC_GROUPS] fetch failed: ${error?.message ?? "no data"}`);
        return empty;
      }
      cache = { data: data as SemanticGroupRow[], ts: Date.now() };
      console.log(`[SEMANTIC_GROUPS] cache loaded | groups=${data.length}`);
    }

    const lower = norm(question);
    const matches: Array<SemanticGroupHit & { alias_len: number }> = [];

    for (const g of cache.data) {
      const aliases = g.aliases ?? [];
      for (const alias of aliases) {
        if (!alias || alias.length < 3) continue;
        const a = norm(alias);
        const idx = lower.indexOf(a);
        if (idx === -1) continue;
        const end = idx + a.length;
        const before = idx === 0 || BOUNDARY_RE.test(lower[idx - 1]);
        const after = end >= lower.length || BOUNDARY_RE.test(lower[end]);
        if (before && after) {
          matches.push({
            canonical_key: g.canonical_key,
            display_name: g.display_name,
            issuer_ids: g.issuer_ids ?? [],
            exclusions: g.exclusions ?? [],
            alias_len: a.length,
          });
          break; // 1 match por grupo basta
        }
      }
    }

    if (matches.length === 0) {
      console.log(`[SEMANTIC_GROUPS] no match | groups_checked=${cache.data.length}`);
      return empty;
    }
    matches.sort((a, b) => b.alias_len - a.alias_len);
    const { alias_len: _al, ...hit } = matches[0];
    console.log(`[SEMANTIC_GROUPS] resolved="${hit.canonical_key}" issuer_ids=${hit.issuer_ids.length} exclusions=${hit.exclusions.length}`);
    return hit;
  } catch (e: any) {
    console.warn(`[SEMANTIC_GROUPS] error: ${e?.message ?? e}`);
    return empty;
  }
}

export const __test__ = { norm };