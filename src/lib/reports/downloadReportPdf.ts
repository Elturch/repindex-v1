import { supabase } from "@/integrations/supabase/client";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import type { ComparisonDatapack } from "@/hooks/useComparisonDatapack";
import type { RankingDatapack, RankingDatapackParams } from "@/hooks/useRankingDatapack";
import { buildDeterministicReportHtml } from "./buildDeterministicReportHtml";
import type { AnalysisJson } from "@/components/reports/ExpertAnalysisView";
import type { ConsensusData, ConsensusSeriesPoint } from "@/hooks/useConsensus";
import type { ConsensusForPdf } from "./buildDeterministicReportHtml";

/**
 * Render the branded HTML with the browser's native print engine (real layout
 * engine → perfect CSS, selectable text, tiny file). We mount an off-screen
 * iframe, write the standalone branded HTML, wait for web fonts, then open the
 * print dialog. The user chooses "Guardar como PDF".
 */
export async function downloadReportPdf(
  html: string,
  filename: string,
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = "900px";
  iframe.style.height = "1200px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("iframe document unavailable");
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for load + web fonts (they affect layout/measurement).
  await waitForFramePaint(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error("iframe window unavailable");
  }

  // Default filename for "Save as PDF" = document title.
  try {
    doc.title = filename.replace(/\.pdf$/i, "");
  } catch {
    /* ignore */
  }

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => iframe.remove(), 500);
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000); // fallback

  win.focus();
  win.print();
}

async function waitForFramePaint(iframe: HTMLIFrameElement): Promise<void> {
  // Wait for load + fonts + one animation frame so layout is stable.
  await new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === "complete") {
      resolve();
      return;
    }
    iframe.addEventListener("load", () => resolve(), { once: true });
    // Fallback: don't hang forever.
    setTimeout(() => resolve(), 1500);
  });
  try {
    const fonts = (iframe.contentDocument as any)?.fonts;
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));
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
}

function analysisCacheKey(
  kind: "profile" | "comparison" | "ranking",
  tickers: string[],
  week: string,
): string {
  const sorted = [...tickers].sort().join("-");
  return `repindex.analysis.${kind}.${sorted}.${week}.v2`;
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
      { p_ticker: cleanTickers[0] },
    );
    if (error) throw error;
    datapack = data as ProfileDatapack;
  } else {
    cleanTickers = (tickers ?? []).map((t) => t.trim()).filter(Boolean);
    if (cleanTickers.length === 0) throw new Error("No tickers provided");
    const sorted = [...cleanTickers].sort();
    const { data, error } = await (supabase.rpc as any)(
      "rix_comparison_datapack",
      { p_tickers: sorted },
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

  try {
    if (kind === "ranking") {
      const scope = {
        sector: rankingParams?.sector ?? null,
        subsector: rankingParams?.subsector ?? null,
        universe: rankingParams?.universe ?? null,
      };
      const key = `repindex.analysis.ranking.${JSON.stringify(scope)}.${week}.v2`;
      readCache(key);
    } else {
      readCache(analysisCacheKey(kind, cleanTickers, week));
    }
  } catch {
    /* ignore */
  }

  // 3) Fetch consensus (profile/comparison) — no-op on ranking for now.
  let consensus: ConsensusForPdf[] = [];
  let consensusBatch: Record<string, { consenso: number; level: string }> = {};
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

  // 4) Build branded HTML.
  const html = buildDeterministicReportHtml({
    kind,
    datapack,
    analysisMarkdown: analysisMarkdown || null,
    analysisJson,
    consensus,
    consensusBatch,
    question: question ?? null,
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