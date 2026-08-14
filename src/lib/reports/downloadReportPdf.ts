import { supabase } from "@/integrations/supabase/client";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import type { ComparisonDatapack } from "@/hooks/useComparisonDatapack";
import type { RankingDatapack, RankingDatapackParams } from "@/hooks/useRankingDatapack";
import { buildDeterministicReportHtml } from "./buildDeterministicReportHtml";
import type { AnalysisJson } from "@/components/reports/ExpertAnalysisView";
import type { ConsensusData, ConsensusSeriesPoint } from "@/hooks/useConsensus";
import type { ConsensusForPdf } from "./buildDeterministicReportHtml";

/**
 * Render the branded, self-contained report HTML inside an off-screen — but
 * fully laid-out — <iframe>, rasterise it with html2canvas and paginate it
 * into an A4 PDF with jsPDF. Downloads directly (no print dialog).
 *
 * Why an iframe (not a <div> + html2pdf.js): the report is a standalone
 * document whose core layout lives in `body { … }` / `@page` rules. Writing the
 * full HTML into an iframe document makes those rules apply exactly as authored.
 * The previous implementation injected the body into a `position:fixed` <div>
 * and handed it to html2pdf.js, which measures any out-of-flow element as
 * height 0 → blank canvas → blank PDF.
 */
export async function downloadReportPdf(
  html: string,
  filename: string,
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Off-screen but with REAL dimensions and renderable (never display:none or
  // left:-99999px, which break rasterisation).
  iframe.style.cssText =
    "position:fixed; left:0; top:0; width:820px; height:1160px; opacity:0; pointer-events:none; z-index:-9999; border:0; background:#ffffff;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("No se pudo acceder al documento del iframe.");

    // Write the full standalone document so <head><style> (incl. body{} and
    // @page rules) apply exactly as authored.
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      iframe.onload = done;
      doc.open();
      doc.write(html);
      doc.close();
      // document.write iframes don't always fire `load`; guard with a timeout.
      setTimeout(done, 1500);
    });

    // Wait for web fonts + one paint frame so layout & glyphs are settled.
    try {
      const fonts = (doc as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
      if (fonts?.ready) await fonts.ready;
    } catch {
      /* ignore */
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const target = (doc.body as HTMLElement) ?? doc.documentElement;
    // Pin the print width so layout is deterministic regardless of the iframe.
    target.style.width = "800px";

    const [{ default: html2canvas }, jspdf] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const JsPDF = (jspdf as unknown as { jsPDF?: typeof import("jspdf").jsPDF; default?: typeof import("jspdf").jsPDF }).jsPDF
      ?? (jspdf as unknown as { default: typeof import("jspdf").jsPDF }).default;

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth || 800,
      windowHeight: target.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * pageW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    let remaining = imgH - pageH;
    while (remaining > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      remaining -= pageH;
    }

    pdf.save(filename);
  } finally {
    iframe.remove();
  }
}

// ---------------------------------------------------------------------------
// Self-contained entry point used by the "Descargar PDF" button on
// deterministic reports. Fetches the datapack via RPC, reads the cached
// expert analysis from localStorage, builds the branded HTML and downloads
// the PDF.
// ---------------------------------------------------------------------------

export interface DownloadDeterministicInput {
  kind: "profile" | "comparison" | "ranking";
  tickers?: string[];
  rankingParams?: RankingDatapackParams | null;
  question?: string | null;
  from?: string | null;
  to?: string | null;
}

function analysisCacheKey(
  kind: "profile" | "comparison" | "ranking",
  tickers: string[],
  week: string,
  from?: string | null,
  to?: string | null,
): string {
  const sorted = [...tickers].sort().join("-");
  return `repindex.analysis.${kind}.${sorted}.${week}.${from ?? "_"}.${to ?? "_"}.v2`;
}

function sanitizeSegment(s: string): string {
  return (
    s
      .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "informe"
  );
}

export async function downloadDeterministicReportPdf(
  input: DownloadDeterministicInput,
): Promise<void> {
  const { kind, tickers, rankingParams, question } = input;

  // 1) Fetch datapack directly via RPC.
  let datapack: ProfileDatapack | ComparisonDatapack | RankingDatapack;
  let cleanTickers: string[] = [];

  if (kind === "ranking") {
    if (!rankingParams) throw new Error("rankingParams required for ranking PDF");
    const p = rankingParams;
    const norm = (arr?: string[] | null): string[] | null =>
      arr && arr.length > 0 ? [...arr].map((s) => s.trim()).filter(Boolean).sort() : null;
    const { data, error } = await (supabase.rpc as any)("rix_ranking_datapack", {
      p_sector: p.sector?.trim() || null,
      p_subsector: p.subsector?.trim() || null,
      p_universe: norm(p.universe),
      p_tickers: norm(p.tickers),
      p_from: p.from || null,
      p_to: p.to || null,
      p_models: norm(p.models),
      p_order_by: (p.orderBy || "rixc").toLowerCase(),
      p_limit:
        typeof p.limit === "number" && Number.isFinite(p.limit) && p.limit > 0
          ? Math.floor(p.limit)
          : null,
    });
    if (error) throw error;
    datapack = data as RankingDatapack;
  } else if (kind === "profile") {
    cleanTickers = (tickers ?? []).map((t) => t.trim()).filter(Boolean);
    if (cleanTickers.length === 0) throw new Error("No tickers provided");
    const { data, error } = await (supabase.rpc as any)(
      "rix_profile_datapack",
      { p_ticker: cleanTickers[0], p_from: input.from ?? null, p_to: input.to ?? null },
    );
    if (error) throw error;
    datapack = data as ProfileDatapack;
  } else {
    cleanTickers = (tickers ?? []).map((t) => t.trim()).filter(Boolean);
    if (cleanTickers.length === 0) throw new Error("No tickers provided");
    const sorted = [...cleanTickers].sort();
    const { data, error } = await (supabase.rpc as any)(
      "rix_comparison_datapack",
      { p_tickers: sorted, p_from: input.from ?? null, p_to: input.to ?? null },
    );
    if (error) throw error;
    datapack = data as ComparisonDatapack;
  }

  // 2) Read cached expert analysis if present.
  const week =
    (datapack as any)?.latest_week || new Date().toISOString().slice(0, 10);
  let analysisMarkdown = "";
  let analysisJson: AnalysisJson | null = null;

  const readCache = (key: string): void => {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return;
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object" && "titular" in parsed) {
          analysisJson = parsed as AnalysisJson;
          return;
        }
      } catch {
        /* not json */
      }
      analysisMarkdown = cached;
    } catch {
      /* ignore */
    }
  };

  let analysisKey: string | null = null;
  let analysisBody: Record<string, unknown> | null = null;

  if (kind === "ranking") {
    const dp = datapack as RankingDatapack;
    const uni = (dp.scope?.universe ?? []).join(",");
    const tks = (dp.scope?.tickers ?? []).join(",");
    const mdl = (dp.models_used ?? []).join(",");
    const expertScope = {
      sector: dp.scope?.sector ?? null,
      subsector: dp.scope?.subsector ?? null,
      universe: uni ? uni.split(",") : [],
      tickers: tks ? tks.split(",") : [],
      from: dp.window?.from ?? null,
      to: dp.window?.to ?? null,
      models: mdl ? mdl.split(",") : [],
      limit: dp.scope?.limit ?? rankingParams?.limit ?? null,
    };
    analysisKey = `repindex.analysis.ranking.${JSON.stringify(expertScope)}.${week}.v2`;
    analysisBody = { type: "ranking", scope: expertScope };
  } else {
    analysisKey = analysisCacheKey(
      kind,
      cleanTickers,
      week,
      input.from ?? null,
      input.to ?? null,
    );
    analysisBody = {
      type: kind,
      tickers: cleanTickers,
      from: input.from ?? null,
      to: input.to ?? null,
    };
  }

  try { if (analysisKey) readCache(analysisKey); } catch { /* ignore */ }

  // Si no está cacheado, genera el análisis ahora para que el PDF salga completo.
  if (analysisKey && analysisBody && !analysisJson && !analysisMarkdown) {
    try {
      const { data, error } = await supabase.functions.invoke("report-analysis", { body: analysisBody });
      if (!error && data) {
        const aj = (data as any)?.analysis_json;
        const md = (data as any)?.analysis;
        if (aj && typeof aj === "object") {
          analysisJson = aj as AnalysisJson;
          try { localStorage.setItem(analysisKey, JSON.stringify(aj)); } catch { /* ignore */ }
        } else if (typeof md === "string" && md.trim()) {
          analysisMarkdown = md;
          try { localStorage.setItem(analysisKey, md); } catch { /* ignore */ }
        }
      }
    } catch { /* soft-fail: el PDF mostrará "no disponible" */ }
  }

  // 3) Fetch consensus (profile/comparison) — no-op on ranking for now.
  let consensus: ConsensusForPdf[] = [];
  let consensusBatch: Record<string, { consenso: number; level: string }> = {};
  let rankingSources: Array<{ domain: string; models_count: number; companies_count: number; urls_count: number }> = [];
  try {
    if (kind === "profile") {
      const dp = datapack as ProfileDatapack;
      const tk = dp.entity?.ticker;
      if (tk) {
        const [getRes, serRes] = await Promise.all([
          (supabase.rpc as any)("rix_consensus_get", { p_ticker: tk }),
          (supabase.rpc as any)("rix_consensus_series", { p_ticker: tk }),
        ]);
        consensus = [{
          ticker: tk,
          name: dp.entity?.name ?? tk,
          data: (getRes?.data as ConsensusData | null) ?? null,
          series: Array.isArray(serRes?.data) ? (serRes.data as ConsensusSeriesPoint[]) : [],
        }];
      }
    } else if (kind === "comparison") {
      const dp = datapack as ComparisonDatapack;
      const ents = dp.entities ?? [];
      const results = await Promise.all(
        ents.map(async (e) => {
          const { data } = await (supabase.rpc as any)("rix_consensus_get", { p_ticker: e.ticker });
          return {
            ticker: e.ticker,
            name: e.name,
            data: (data as ConsensusData | null) ?? null,
            series: [] as ConsensusSeriesPoint[],
          };
        }),
      );
      consensus = results;
    } else if (kind === "ranking") {
      const dp = datapack as RankingDatapack;
      const tks = Array.from(
        new Set([
          ...((dp.ranking ?? []).map((r) => r.tk)),
          ...((dp.period ?? []).map((p) => p.tk)),
        ]),
      ).filter(Boolean);
      if (tks.length > 0) {
        const { data } = await (supabase.rpc as any)("rix_consensus_batch", { p_tickers: tks });
        if (data && typeof data === "object") {
          consensusBatch = data as Record<string, { consenso: number; level: string }>;
        }
      }
    }
  } catch {
    /* soft-fail: consensus block will simply not render */
  }

  try {
    if (kind === "ranking") {
      const dpr = datapack as RankingDatapack;
      const srcTks = Array.from(new Set((dpr.ranking ?? []).map((r) => r.tk))).filter(Boolean);
      if (srcTks.length > 0) {
        const { data: srcData } = await (supabase.rpc as any)("rix_citations_batch", { p_tickers: srcTks });
        const items = (srcData as any)?.items;
        if (Array.isArray(items)) rankingSources = items;
      }
    }
  } catch { /* soft-fail: sin bloque de fuentes */ }

  // 4) Build branded HTML.
  const html = buildDeterministicReportHtml({
    kind,
    datapack,
    analysisMarkdown: analysisMarkdown || null,
    analysisJson,
    consensus,
    consensusBatch,
    question: question ?? null,
    rankingSources,
  });

  // 5) Filename.
  let label: string;
  if (kind === "profile") {
    label = (datapack as ProfileDatapack).entity?.name || cleanTickers[0];
  } else if (kind === "comparison") {
    label =
      ((datapack as ComparisonDatapack).entities ?? [])
        .map((e) => e.ticker)
        .join("-") || cleanTickers.join("-");
  } else {
    const rp = rankingParams;
    label =
      rp?.sector ||
      rp?.subsector ||
      (rp?.universe && rp.universe.length > 0 ? rp.universe.join("-") : "ranking");
  }
  const filename = `RepIndex-${sanitizeSegment(String(label))}-${week}.pdf`;

  // 6) Render + save.
  await downloadReportPdf(html, filename);
}