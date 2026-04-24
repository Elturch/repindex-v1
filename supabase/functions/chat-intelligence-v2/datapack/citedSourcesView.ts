// Agente Rix v2 — citedSources from VIEW (SSOT TS layer)
// =====================================================
// PURPOSE: byte-for-byte equivalent of extractCitedSources(rawRows), but
// consuming pre-extracted (id, col_label, url, title) tuples from the SQL
// view public.rix_runs_v2_cited_urls instead of the heavy *_bruto raw text
// columns. Used only when CHAT_V2_CITED_URLS_VIEW=true.
//
// PARITY GUARANTEE: this file imports cleanUrl, extractDomain,
// extractDateFromUrl and NOISE_DOMAINS from citedSources.ts (single source
// of truth). It re-applies the same dedupe Map<url, {title, models, date}>,
// the same sort and the same byDomain grouping. Any future change to those
// functions in citedSources.ts propagates automatically.
//
// IMPORTANT: this file does NOT replace extractCitedSources. It is invoked
// in parallel only behind the feature flag, after the 50/50 parity test
// has been verified manually (see plan T1).

import {
  cleanUrl,
  extractDateFromUrl,
  extractDomain,
  NOISE_DOMAINS,
  type CitedSource,
  type CitedSourcesReport,
} from "./citedSources.ts";

/**
 * One row from public.rix_runs_v2_cited_urls. Mirrors the SELECT projection
 * defined in the T1 migration — id, ticker, row_model, period_from,
 * period_to, batch_execution_date, col_label, url, domain, title.
 */
export interface CitedUrlRow {
  id: string;
  ticker: string;
  row_model: string | null;
  period_from: string;
  period_to: string | null;
  batch_execution_date: string;
  col_label:
    | "ChatGPT"
    | "Perplexity"
    | "Gemini"
    | "DeepSeek"
    | "Claude"
    | "Grok"
    | "Qwen";
  url: string;
  domain: string;
  title: string | null;
}

/**
 * Build a CitedSourcesReport from rows of the view. Output is byte-for-byte
 * identical to extractCitedSources(rawRows) given the same canonical URL
 * candidates (post-cleanUrl).
 */
export function normalizeUrlsFromView(rows: CitedUrlRow[]): CitedSourcesReport {
  const map = new Map<string, {
    title: string | null;
    models: Set<string>;
    detectedDate: string | null;
  }>();

  for (const row of rows) {
    // 1. Re-canonicalize URL in TS (the SQL view trims trailing punctuation
    //    but does NOT rebalance markdown parentheses — cleanUrl does).
    const url = cleanUrl(row.url);
    if (!url) continue;

    // 2. Recompute domain in TS using the SSOT extractDomain. The view
    //    already filtered NOISE_DOMAINS server-side; we re-filter here as
    //    a safety net (e.g. cleanUrl could change the host in edge cases).
    const domain = extractDomain(url);
    if (NOISE_DOMAINS.has(domain)) continue;

    // 3. Model attribution = column owner. col_label is canonical.
    const model = row.col_label;

    // 4. Title is preferred from md_link (SQL ORDER BY (source_kind='md')
    //    DESC ensures this), with the same 1..239 cap as
    //    extractCitedSources.
    const candidate = (row.title ?? "").trim();
    const acceptable =
      candidate.length > 0 && candidate.length < 240 ? candidate : null;

    const entry = map.get(url) ?? {
      title: null,
      models: new Set<string>(),
      detectedDate: extractDateFromUrl(url),
    };
    if (!entry.title && acceptable) entry.title = acceptable;
    entry.models.add(model);
    map.set(url, entry);
  }

  // 5. Flatten with same sort as extractCitedSources.
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
  sources.sort(
    (a, b) =>
      b.citations - a.citations || a.domain.localeCompare(b.domain),
  );

  // 6. Group by domain with same sort as extractCitedSources.
  const domainMap = new Map<
    string,
    { models: Set<string>; sources: CitedSource[] }
  >();
  for (const s of sources) {
    const e = domainMap.get(s.domain) ?? { models: new Set(), sources: [] };
    e.sources.push(s);
    s.models.forEach((m) => e.models.add(m));
    domainMap.set(s.domain, e);
  }
  const byDomain = [...domainMap.entries()]
    .map(([domain, v]) => ({
      domain,
      models: [...v.models].sort(),
      sources: v.sources,
    }))
    .sort(
      (a, b) =>
        b.models.length - a.models.length ||
        b.sources.length - a.sources.length,
    );

  return {
    sources,
    byDomain,
    totalUrls: sources.length,
    totalDomains: byDomain.length,
  };
}

export const __test__ = { normalizeUrlsFromView };