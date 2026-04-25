import type { RixUniverse, RixUniverseEntry } from "@/hooks/useRixUniverse";

/**
 * suggestionWhitelist — Guarantees that every company-bearing chat suggestion
 * references a company that exists in the current RIX universe (latest weekly
 * snapshot). Plantillas hardcodeadas se rellenan con muestras del universo;
 * sugerencias dinámicas (Vector Store) se filtran si mencionan empresas
 * desconocidas.
 *
 * Detección: caza una lista de "nombres de empresa conocidos" — la unión del
 * universo vigente + un set explícito de nombres legacy que han aparecido
 * históricamente en plantillas. Si una sugerencia contiene un nombre legacy
 * que ya no está en el universo, se descarta.
 */

// Names that have historically appeared in suggestion templates / vector
// outputs. Used solely to detect "this string mentions a company"; if any
// match is NOT in the live universe, the suggestion is dropped.
const KNOWN_COMPANY_LEXICON: string[] = [
  "Telefónica", "Telefonica", "Repsol", "BBVA", "Inditex", "Iberdrola",
  "Banco Santander", "Santander", "Endesa", "Naturgy", "Puig Brands", "Puig",
  "Damm", "Adolfo Domínguez", "Adolfo Dominguez", "Mercadona", "El Corte Inglés",
  "Ferrovial", "ACS", "Acciona", "Aena", "Bankinter", "CaixaBank", "Sabadell",
  "Mapfre", "Indra", "Cellnex", "Grifols", "Amadeus", "IAG", "Enagás",
  "Logista", "Solaria", "Colonial", "Merlin", "Almirall", "PharmaMar",
  "Faes Farma", "Atresmedia", "PRISA", "Prosegur", "Fluidra", "Gestamp",
  "Meliá", "Meliá Hotels", "Moeve",
];

const isWord = (ch: string | undefined) =>
  !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Case-insensitive whole-word substring search (Unicode-aware). */
function containsName(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (true) {
    const idx = h.indexOf(n, from);
    if (idx === -1) return false;
    const before = h[idx - 1];
    const after = h[idx + n.length];
    if (!isWord(before) && !isWord(after)) return true;
    from = idx + 1;
  }
}

export interface WhitelistResult {
  /** True if no out-of-universe company is mentioned. */
  valid: boolean;
  /** Sanitized text (typo fixes applied). */
  text: string;
  /** Company names mentioned (canonical, from universe). */
  matched: string[];
  /** Reason for invalidation (if any). */
  rejectedBy?: string;
}

/**
 * Sanitize known typos before validation. Cheap, scoped, no behavior beyond
 * typography — never invents data.
 */
function sanitizeTypos(text: string): string {
  return text
    .replace(/\bIndítex\b/g, "Inditex")
    .replace(/\bÍnditex\b/g, "Inditex");
}

/**
 * Check a suggestion text against the live RIX universe.
 * - Detects company mentions via a known lexicon.
 * - Rejects the suggestion if any mentioned company is missing from the universe.
 * - Suggestions that mention NO known company (e.g. pure sector / index queries)
 *   pass through unchanged.
 */
export function validateSuggestion(
  rawText: string,
  universe: RixUniverse | undefined
): WhitelistResult {
  const text = sanitizeTypos(rawText);
  if (!universe || universe.nameSet.size === 0) {
    // Universe not loaded yet — be permissive (do not block UI).
    return { valid: true, text, matched: [] };
  }

  const matched: string[] = [];
  for (const name of KNOWN_COMPANY_LEXICON) {
    if (!containsName(text, name)) continue;
    // Try to resolve to a canonical universe name.
    const lower = name.toLowerCase();
    const canonical = universe.entries.find(
      (e) =>
        e.name.toLowerCase() === lower ||
        e.name.toLowerCase().startsWith(lower + " ") ||
        lower.startsWith(e.name.toLowerCase() + " ") ||
        e.name.toLowerCase().includes(lower) ||
        lower.includes(e.name.toLowerCase())
    );
    if (!canonical) {
      return { valid: false, text, matched, rejectedBy: name };
    }
    matched.push(canonical.name);
  }

  return { valid: true, text, matched };
}

/**
 * Pick a random subset of the universe (deterministic-ish). Used for filling
 * dynamic templates like "Analiza la reputación de {company}".
 */
export function sampleCompanies(
  universe: RixUniverse | undefined,
  count: number,
  seed: number = Date.now()
): RixUniverseEntry[] {
  if (!universe || universe.entries.length === 0) return [];
  const arr = [...universe.entries];
  // Fisher-Yates with seeded RNG (LCG)
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
