// Agente Rix v2 — Cited Sources extractor (max 200 LOC)
// Extrae URLs REALES citadas por las IAs en sus respuestas brutas.
// Cada respuesta_bruto_* contiene Markdown con enlaces tipo
// [Título](https://...) o URLs sueltas. Esta función:
//   1. Recorre TODOS los campos de respuesta bruta (8 columnas posibles)
//   2. Extrae enlaces Markdown (capturando título y URL) y URLs sueltas
//   3. Deduplica por URL canónica
//   4. Cuenta cuántos modelos distintos citan cada URL
//   5. Agrupa por dominio
// Pure function (no I/O) — sólo opera sobre las filas que ya tiene el skill.

const RAW_FIELDS = [
  "20_res_gpt_bruto",
  "21_res_perplex_bruto",
  "22_res_gemini_bruto",
  "23_res_deepseek_bruto",
  "respuesta_bruto_claude",
  "respuesta_bruto_grok",
  "respuesta_bruto_qwen",
] as const;

// Map field name → canonical model label used in badges
const FIELD_TO_MODEL: Record<string, string> = {
  "20_res_gpt_bruto": "ChatGPT",
  "21_res_perplex_bruto": "Perplexity",
  "22_res_gemini_bruto": "Gemini",
  "23_res_deepseek_bruto": "DeepSeek",
  "respuesta_bruto_claude": "Claude",
  "respuesta_bruto_grok": "Grok",
  "respuesta_bruto_qwen": "Qwen",
};

// Single-letter badge per model (markdown-safe — no inline HTML needed)
const MODEL_BADGE: Record<string, string> = {
  ChatGPT: "C",
  Perplexity: "P",
  Gemini: "G",
  DeepSeek: "D",
  Claude: "L",
  Grok: "K",
  Qwen: "Q",
};

// Markdown link: [title](url) — captura título y URL
const MD_LINK_RE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)\]"<>]+)\)/g;
// URL suelta (sin pertenecer a un enlace markdown). Excluye comas, paréntesis,
// comillas y angulares finales (artefactos comunes de copy/paste).
const BARE_URL_RE = /https?:\/\/[^\s)\]"<>]+/g;

// Dominios que rara vez son fuentes citables (evitar ruido)
const NOISE_DOMAINS = new Set([
  "schema.org",
  "w3.org",
  "example.com",
  "localhost",
]);

export interface CitedSource {
  url: string;
  domain: string;
  title: string | null;
  models: string[]; // Modelos que citan esta URL (deduplicados)
  citations: number; // = models.length
  /** ISO date string detected near the URL in the raw text (yyyy-mm-dd) */
  detectedDate?: string | null;
}

export interface CitedSourcesReport {
  sources: CitedSource[]; // Plana, ordenada por citations desc
  byDomain: Array<{ domain: string; models: string[]; sources: CitedSource[] }>;
  totalUrls: number;
  totalDomains: number;
}

/** Limpia trailing punctuation que el regex puede arrastrar (.,;:!?). */
function cleanUrl(raw: string): string {
  let u = raw.trim();
  while (u.length > 0 && /[.,;:!?]$/.test(u)) u = u.slice(0, -1);
  // Cierra paréntesis de markdown si quedó suelto
  while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) {
    u = u.slice(0, -1);
  }
  return u;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "(desconocido)";
  }
}

/**
 * Extract an ISO date (yyyy-mm-dd) from the URL path itself when present.
 * Common patterns: /2026/03/15/, /2026-03-15-, /20260315/. Returns null
 * if no date is detected. Pure heuristic — best-effort.
 */
function extractDateFromUrl(url: string): string | null {
  // /YYYY/MM/DD/
  let m = url.match(/\/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\/_\-]|$)/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  // YYYYMMDD as a single token
  m = url.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Extrae todas las URLs citadas de las filas. Cada fila contribuye con UN modelo
 * (su 02_model_name). Si el mismo modelo cita la misma URL en varias semanas,
 * cuenta como 1 modelo (deduplicado por (model, url)).
 */
export function extractCitedSources(rows: any[]): CitedSourcesReport {
  // Mapa url → { title, modelSet, dateNear }
  const map = new Map<string, { title: string | null; models: Set<string>; detectedDate: string | null }>();

  for (const row of rows) {
    const rowModel = String(row?.["02_model_name"] ?? "").trim();
    for (const field of RAW_FIELDS) {
      const text = row?.[field];
      if (!text || typeof text !== "string") continue;
      // Prefer the model implied by the field name (raw column owner). Fall
      // back to the row's 02_model_name if the column is generic.
      const model = FIELD_TO_MODEL[field] || rowModel || "(desconocido)";

      // 1. Enlaces Markdown [title](url)
      let m: RegExpExecArray | null;
      const seenInThisField = new Set<string>();
      MD_LINK_RE.lastIndex = 0;
      while ((m = MD_LINK_RE.exec(text)) !== null) {
        const title = m[1].trim();
        const url = cleanUrl(m[2]);
        const domain = extractDomain(url);
        if (NOISE_DOMAINS.has(domain)) continue;
        seenInThisField.add(url);
        const entry = map.get(url) ?? { title: null, models: new Set<string>(), detectedDate: extractDateFromUrl(url) };
        if (!entry.title && title.length > 0 && title.length < 240) entry.title = title;
        entry.models.add(model);
        map.set(url, entry);
      }

      // 2. URLs sueltas (que no estén ya capturadas como markdown)
      BARE_URL_RE.lastIndex = 0;
      while ((m = BARE_URL_RE.exec(text)) !== null) {
        const url = cleanUrl(m[0]);
        if (seenInThisField.has(url)) continue;
        const domain = extractDomain(url);
        if (NOISE_DOMAINS.has(domain)) continue;
        const entry = map.get(url) ?? { title: null, models: new Set<string>(), detectedDate: extractDateFromUrl(url) };
        entry.models.add(model);
        map.set(url, entry);
      }
    }
  }

  const sources: CitedSource[] = [];
  for (const [url, { title, models, detectedDate }] of map.entries()) {
    sources.push({
      url,
      domain: extractDomain(url),
      title,
      models: [...models].sort(),
      citations: models.size,
      detectedDate,
    });
  }
  // Sort por citations desc, luego por dominio asc
  sources.sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain));

  // Agrupa por dominio
  const domainMap = new Map<string, { models: Set<string>; sources: CitedSource[] }>();
  for (const s of sources) {
    const entry = domainMap.get(s.domain) ?? { models: new Set(), sources: [] };
    entry.sources.push(s);
    s.models.forEach((m) => entry.models.add(m));
    domainMap.set(s.domain, entry);
  }
  const byDomain = [...domainMap.entries()]
    .map(([domain, v]) => ({ domain, models: [...v.models].sort(), sources: v.sources }))
    .sort((a, b) => b.models.length - a.models.length || b.sources.length - a.sources.length);

  return {
    sources,
    byDomain,
    totalUrls: sources.length,
    totalDomains: byDomain.length,
  };
}

/**
 * Pre-renderiza la sección "Fuentes citadas por los modelos de IA" en
 * Markdown. Esta sección se inserta DESPUÉS de Recomendaciones y ANTES de
 * la Ficha Metodológica.
 */
export function renderCitedSourcesBlock(report: CitedSourcesReport, maxPerDomain = 8): string {
  if (report.totalUrls === 0) return "";
  const lines: string[] = ["**Fuentes citadas por los modelos de IA**", ""];
  for (const group of report.byDomain) {
    const modelsLabel = group.models.length === 1
      ? `citado por 1 modelo (${group.models[0]})`
      : `citado por ${group.models.length} modelos (${group.models.join(", ")})`;
    lines.push(`**${group.domain}** — ${modelsLabel} · ${group.sources.length} URL${group.sources.length === 1 ? "" : "s"}`);
    const visible = group.sources.slice(0, maxPerDomain);
    for (const s of visible) {
      const title = s.title && s.title.trim().length > 0 ? s.title : s.url;
      lines.push(`• [${title}](${s.url})`);
    }
    if (group.sources.length > maxPerDomain) {
      lines.push(`• …y ${group.sources.length - maxPerDomain} URLs adicionales en este dominio.`);
    }
    lines.push("");
  }
  lines.push(`_Total: ${report.totalUrls} URLs únicas de ${report.totalDomains} medios distintos._`);
  return lines.join("\n").trimEnd();
}

export const __test__ = { cleanUrl, extractDomain, RAW_FIELDS };