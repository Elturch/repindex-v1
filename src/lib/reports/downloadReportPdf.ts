// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - html2pdf.js has partial type coverage
import html2pdfImport from "html2pdf.js";
const html2pdf: any = html2pdfImport;
import { supabase } from "@/integrations/supabase/client";
import type { ProfileDatapack } from "@/hooks/useProfileDatapack";
import type { ComparisonDatapack } from "@/hooks/useComparisonDatapack";
import type { RankingDatapack, RankingDatapackParams } from "@/hooks/useRankingDatapack";
import { buildDeterministicReportHtml } from "./buildDeterministicReportHtml";

/**
 * Generate a PDF from a full, self-contained HTML document string.
 *
 * We render the HTML inside an off-screen iframe at A4 width so all layout,
 * fonts and colours resolve exactly as they will in the exported PDF. Then
 * we hand the iframe's `<body>` node to html2pdf.
 *
 * The input HTML uses explicit hex / hsl colours from the RepIndex branded
 * shell — there is no `oklch(...)` involved, so no colour sanitisation is
 * needed.
 */
export async function downloadReportPdf(
  html: string,
  filename: string,
): Promise<void> {
  // 1) Mount an off-screen iframe at A4 width so the branded shell lays out
  //    with the same measurements it will have in the PDF.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = "900px"; // matches body max-width in brandedReportStyles
  iframe.style.height = "1400px";
  iframe.style.border = "0";
  iframe.style.background = "#ffffff";
  document.body.appendChild(iframe);

  try {
    // 2) Write the branded HTML into the iframe and wait for it to be ready
    //    (including web fonts, which affect measurement and rendering).
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe document unavailable");
    doc.open();
    doc.write(html);
    doc.close();

    await waitForFramePaint(iframe);

    const body = doc.body;
    if (!body) throw new Error("iframe body unavailable");

    // 3) Hand the fully-styled body to html2pdf.
    await html2pdf()
      .set({
        margin: [12, 12, 14, 12],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: 900,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy", "avoid-all"] },
      } as any)
      .from(body)
      .save();
  } finally {
    iframe.remove();
  }
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
  return `repindex.analysis.${kind}.${sorted}.${week}`;
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
  try {
    if (kind === "ranking") {
      const scope = {
        sector: rankingParams?.sector ?? null,
        subsector: rankingParams?.subsector ?? null,
        universe: rankingParams?.universe ?? null,
      };
      const key = `repindex.analysis.ranking.${JSON.stringify(scope)}.${week}`;
      const cached = localStorage.getItem(key);
      if (cached) analysisMarkdown = cached;
    } else {
      const cached = localStorage.getItem(
        analysisCacheKey(kind, cleanTickers, week),
      );
      if (cached) analysisMarkdown = cached;
    }
  } catch {
    /* ignore */
  }

  // 3) Build branded HTML.
  const html = buildDeterministicReportHtml({
    kind,
    datapack,
    analysisMarkdown: analysisMarkdown || null,
    question: question ?? null,
  });

  // 4) Filename.
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

  // 5) Render + save.
  await downloadReportPdf(html, filename);
}