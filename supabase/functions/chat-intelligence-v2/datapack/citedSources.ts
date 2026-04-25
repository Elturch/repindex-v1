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

// Single-letter badge per model
const MODEL_BADGE: Record<string, string> = {
  ChatGPT: "C",
  Perplexity: "P",
  Gemini: "G",
  DeepSeek: "D",
  Claude: "L",
  Grok: "K",
  Qwen: "Q",
};

const MODEL_BADGE_COLOR: Record<string, string> = {
  ChatGPT: "#6b7280",
  Perplexity: "#3b82f6",
  Gemini: "#22c55e",
  Grok: "#22c55e",
  DeepSeek: "#f97316",
  Qwen: "#8b5cf6",
  Claude: "#ef4444",
};

// Markdown link: [title](url) — captura título y URL
const MD_LINK_RE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)\]"<>]+)\)/g;
// URL suelta (sin pertenecer a un enlace markdown). Excluye comas, paréntesis,
// comillas y angulares finales (artefactos comunes de copy/paste).
const BARE_URL_RE = /https?:\/\/[^\s)\]"<>]+/g;

// Dominios que rara vez son fuentes citables (evitar ruido)
export const NOISE_DOMAINS = new Set([
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
export function cleanUrl(raw: string): string {
  let u = raw.trim();
  while (u.length > 0 && /[.,;:!?]$/.test(u)) u = u.slice(0, -1);
  // Cierra paréntesis de markdown si quedó suelto
  while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) {
    u = u.slice(0, -1);
  }
  return u;
}

export function extractDomain(url: string): string {
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
export function extractDateFromUrl(url: string): string | null {
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
  // ?date=YYYY-MM-DD or &date=YYYY-MM-DD
  m = url.match(/[?&]date=(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

// Map of Spanish/English short month names → 1..12
const MONTHS_MAP: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

/**
 * Robust date detector for cited-source bibliographies. Attempts several
 * representations in order:
 *   1. ISO `YYYY-MM-DD` literal anywhere in `text`.
 *   2. `DD/MM/YYYY` or `DD-MM-YYYY`.
 *   3. Spanish/English natural form `8 abr 2026` / `8 de abril de 2026`.
 *   4. Embedded date in a URL (delegates to extractDateFromUrl).
 * Returns ISO `YYYY-MM-DD` or null.
 *
 * Quick sanity tests (kept inline for documentation):
 *   "2026-04-08"                                        → "2026-04-08"
 *   "08/04/2026"                                        → "2026-04-08"
 *   "8 abr 2026"                                        → "2026-04-08"
 *   "https://elpais.com/2026/04/08/foo.html"            → "2026-04-08"
 *   "https://expansion.com/foo?utm_source=openai"       → null
 */
export function extractDateFromText(text: string | null | undefined, urlHint?: string): string | null {
  if (urlHint) {
    const fromUrl = extractDateFromUrl(urlHint);
    if (fromUrl) return fromUrl;
  }
  if (!text || typeof text !== "string") return null;
  const lc = text.toLowerCase();
  // 1. ISO
  let m = lc.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  // 2. DD/MM/YYYY or DD-MM-YYYY (require non-digit boundary to avoid noise)
  m = lc.match(/(?:^|[^\d])(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})(?!\d)/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  // 3. "8 abr 2026" / "8 de abril de 2026" / "april 8, 2026"
  const monthAlt = Object.keys(MONTHS_MAP).join("|");
  let re = new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${monthAlt})\\.?\\s+(?:de\\s+)?(20\\d{2})`, "i");
  m = lc.match(re);
  if (m) {
    const d = +m[1]; const mo = MONTHS_MAP[m[2].toLowerCase()]; const y = +m[3];
    if (mo && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  re = new RegExp(`(${monthAlt})\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})`, "i");
  m = lc.match(re);
  if (m) {
    const mo = MONTHS_MAP[m[1].toLowerCase()]; const d = +m[2]; const y = +m[3];
    if (mo && d >= 1 && d <= 31) {
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
        // Use the title text as a proxy for "near-URL" context to detect
        // dates rendered alongside the link (e.g. "El País — 8 abr 2026").
        const entry = map.get(url) ?? {
          title: null,
          models: new Set<string>(),
          detectedDate: extractDateFromText(title, url),
        };
        if (!entry.title && title.length > 0 && title.length < 240) entry.title = title;
        if (!entry.detectedDate) entry.detectedDate = extractDateFromText(title, url);
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
        // Look at a small window of text around the URL to pick up dates
        // rendered next to bare URLs ("Fuente: 08/04/2026 — https://...").
        const idx = m.index;
        const window = text.slice(Math.max(0, idx - 60), Math.min(text.length, idx + url.length + 60));
        const entry = map.get(url) ?? {
          title: null,
          models: new Set<string>(),
          detectedDate: extractDateFromText(window, url),
        };
        if (!entry.detectedDate) entry.detectedDate = extractDateFromText(window, url);
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
 * Markdown. Cada URL aparece individualmente con badge del modelo, dominio,
 * título y enlace clicable. Se separan en "Menciones de Ventana" (fechas
 * dentro del período analizado) y "Menciones de Refuerzo" (históricas o
 * sin fecha). NO se aplica límite de URLs — si hay 99, se muestran las 99.
 *
 * @param report   Output de extractCitedSources
 * @param periodFrom ISO date inicio del período analizado (opcional)
 * @param periodTo   ISO date fin del período analizado (opcional)
 */
export function renderCitedSourcesBlock(
  report: CitedSourcesReport,
  periodFrom?: string | null,
  periodTo?: string | null,
): string {
  if (report.totalUrls === 0) return "";

  const fromTs = periodFrom ? Date.parse(periodFrom) : NaN;
  const toTs = periodTo ? Date.parse(periodTo) : NaN;
  const hasWindow = Number.isFinite(fromTs) && Number.isFinite(toTs);

  // Clasificación temporal de cada fuente
  const windowSources: CitedSource[] = [];
  const reinforcementSources: CitedSource[] = [];
  for (const s of report.sources) {
    if (hasWindow && s.detectedDate) {
      const ts = Date.parse(s.detectedDate);
      // Ventana extendida ±3 días para tolerar zonas horarias
      const within = Number.isFinite(ts) && ts >= fromTs - 3 * 86400000 && ts <= toTs + 3 * 86400000;
      if (within) windowSources.push(s);
      else reinforcementSources.push(s);
    } else {
      // Default to "Ventana" when no date can be detected: the model
      // cited the URL while evaluating the current window, so excluding
      // it would unfairly under-report visible coverage. Historical
      // (out-of-window) sources only land in "Refuerzo" when their date
      // is BOTH parseable AND outside the window.
      windowSources.push(s);
    }
  }

  const lines: string[] = [
    "**Fuentes citadas por los modelos de IA**",
    "",
    "Todas las fuentes listadas han sido extraídas directamente de las respuestas brutas de los modelos de IA. No se ha añadido, inventado ni modificado ninguna URL.",
    "",
  ];

  const renderSource = (s: CitedSource): string => {
    const badges = s.models
      .map((m) => {
        const letter = MODEL_BADGE[m] ?? m[0]?.toUpperCase() ?? "?";
        const color = MODEL_BADGE_COLOR[m] ?? "#6b7280";
        return `<span style="background-color:${color};color:white;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold;margin-right:2px;display:inline-block;line-height:1.2">${letter}</span>`;
      })
      .join("");
    const title = (s.title && s.title.trim().length > 0) ? s.title : s.domain;
    const dateLabel = s.detectedDate ? ` <span style="color:#6b7280;font-size:11px">(${s.detectedDate})</span>` : "";
    return `- ${badges} <strong>${s.domain}</strong>${dateLabel}<br><a href="${s.url}" target="_blank" rel="noopener noreferrer">${title}</a><br><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.url}</a>`;
  };

  lines.push(`**Menciones de Ventana** (${windowSources.length})`);
  lines.push("");
  if (windowSources.length > 0) {
    for (const s of windowSources) lines.push(renderSource(s));
  }
  lines.push("");

  lines.push(`**Otras Referencias (históricas)** (${reinforcementSources.length})`);
  lines.push("");
  if (reinforcementSources.length > 0) {
    for (const s of reinforcementSources) lines.push(renderSource(s));
  }
  lines.push("");
  lines.push(`Total: ${report.totalUrls} fuentes únicas de ${report.totalDomains} medios distintos`);
  return lines.join("\n").trimEnd();
}

export const __test__ = { cleanUrl, extractDomain, RAW_FIELDS, extractDateFromText };