// One-shot parity test: extractCitedSources (legacy, *_bruto) vs
// rix_runs_v2_cited_urls (SQL view) + normalizeUrlsFromView.
// READ-ONLY. service_role internal. Not part of chat-intelligence-v2.
// Returns JSON: per-row diffs, aggregate, EXPLAIN ANALYZE for representative
// query. Acceptance: all 50 rows have empty diffs, p95 < 30ms.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractCitedSources,
  cleanUrl,
  extractDomain,
} from "./citedSources.ts";
import { normalizeUrlsFromView } from "./citedSourcesView.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAW_FIELDS = [
  "20_res_gpt_bruto",
  "21_res_perplex_bruto",
  "22_res_gemini_bruto",
  "23_res_deepseek_bruto",
  "respuesta_bruto_claude",
  "respuesta_bruto_grok",
  "respuesta_bruto_qwen",
] as const;

const FIELD_TO_COL_LABEL: Record<string, string> = {
  "20_res_gpt_bruto": "ChatGPT",
  "21_res_perplex_bruto": "Perplexity",
  "22_res_gemini_bruto": "Gemini",
  "23_res_deepseek_bruto": "DeepSeek",
  "respuesta_bruto_claude": "Claude",
  "respuesta_bruto_grok": "Grok",
  "respuesta_bruto_qwen": "Qwen",
};

// Stratified sample tickers (27 deterministic + 23 random = 50)
const STRAT_TICKERS = [
  // Hospitalario (6)
  "HMH", "QS", "HOS", "HLA", "VIA", "VIT",
  // Energía (4)
  "IBE", "ELE", "REP", "NTGY",
  // Banca (3)
  "SAN", "BBVA", "CABK",
  // IBEX top 6
  "ITX", "TEF", "AMS", "FER", "ACS", "AENA",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Pick stratified rows (one row per ticker — most recent batch).
    const stratRows: any[] = [];
    for (const ticker of STRAT_TICKERS) {
      const { data } = await supabase
        .from("rix_runs_v2")
        .select(
          `id, "05_ticker", "02_model_name", "06_period_from", "07_period_to", batch_execution_date,
           "20_res_gpt_bruto","21_res_perplex_bruto","22_res_gemini_bruto","23_res_deepseek_bruto",
           respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen`,
        )
        .eq("05_ticker", ticker)
        .order("batch_execution_date", { ascending: false })
        .limit(1);
      if (data && data[0]) stratRows.push(data[0]);
    }

    // 2. Random 23 rows (excluding strat tickers) using OFFSET trick.
    const { count: totalCount } = await supabase
      .from("rix_runs_v2")
      .select("id", { count: "exact", head: true });
    const total = totalCount ?? 0;
    const randomRows: any[] = [];
    const seenIds = new Set(stratRows.map((r) => r.id));
    let attempts = 0;
    while (randomRows.length < 23 && attempts < 80) {
      attempts++;
      const offset = Math.floor(Math.random() * Math.max(1, total - 1));
      const { data } = await supabase
        .from("rix_runs_v2")
        .select(
          `id, "05_ticker", "02_model_name", "06_period_from", "07_period_to", batch_execution_date,
           "20_res_gpt_bruto","21_res_perplex_bruto","22_res_gemini_bruto","23_res_deepseek_bruto",
           respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen`,
        )
        .range(offset, offset);
      if (data && data[0] && !seenIds.has(data[0].id)) {
        seenIds.add(data[0].id);
        randomRows.push(data[0]);
      }
    }

    const sampleRows = [...stratRows, ...randomRows];

    // 3. For each row, compute setA (legacy per col_label) and setB (view).
    type PerRow = {
      id: string;
      ticker: string;
      col_label: string;
      sizeA: number;
      sizeB: number;
      diffA_minus_B: string[];
      diffB_minus_A: string[];
      title_parity: { matched: number; mismatched: number };
    };

    const perRow: PerRow[] = [];
    let colLabelCounts: Record<string, number> = {};

    for (const row of sampleRows) {
      // Build setA per col_label by running extractCitedSources on a single
      // synthetic row containing only that field — to compare directly with
      // the view rows for the same id+col_label.
      // Fetch view rows for this id grouped by col_label.
      const { data: viewRows } = await supabase
        .from("rix_runs_v2_cited_urls")
        .select("id, col_label, url, title")
        .eq("id", row.id);

      const viewByLabel = new Map<string, any[]>();
      for (const vr of viewRows ?? []) {
        const arr = viewByLabel.get(vr.col_label) ?? [];
        arr.push(vr);
        viewByLabel.set(vr.col_label, arr);
      }

      for (const field of RAW_FIELDS) {
        const text = row[field];
        const colLabel = FIELD_TO_COL_LABEL[field];
        if (!text || typeof text !== "string" || text.length === 0) continue;

        // setA: run extractCitedSources on a synthetic row with only this
        // field populated (so we get exactly the URLs of that column).
        const syntheticRow: any = { "02_model_name": row["02_model_name"] };
        syntheticRow[field] = text;
        const reportA = extractCitedSources([syntheticRow]);
        const setA = new Set(reportA.sources.map((s) => s.url));

        // setB: from the view, for this id + col_label.
        const viewRowsForLabel = (viewByLabel.get(colLabel) ?? []).map(
          (vr) => ({
            id: vr.id,
            ticker: row["05_ticker"],
            row_model: row["02_model_name"],
            period_from: row["06_period_from"],
            period_to: row["07_period_to"],
            batch_execution_date: row["batch_execution_date"],
            col_label: vr.col_label,
            url: vr.url,
            domain: extractDomain(cleanUrl(vr.url)),
            title: vr.title,
          }),
        );
        const reportB = normalizeUrlsFromView(viewRowsForLabel as any);
        const setB = new Set(reportB.sources.map((s) => s.url));

        const diffAB = [...setA].filter((u) => !setB.has(u));
        const diffBA = [...setB].filter((u) => !setA.has(u));

        // Title parity (intersect)
        const titleMapA = new Map(
          reportA.sources.map((s) => [s.url, s.title ?? null]),
        );
        const titleMapB = new Map(
          reportB.sources.map((s) => [s.url, s.title ?? null]),
        );
        let matched = 0,
          mismatched = 0;
        for (const u of setA) {
          if (!setB.has(u)) continue;
          const tA = titleMapA.get(u) ?? null;
          const tB = titleMapB.get(u) ?? null;
          if (tA === tB) matched++;
          else mismatched++;
        }

        perRow.push({
          id: row.id,
          ticker: row["05_ticker"],
          col_label: colLabel,
          sizeA: setA.size,
          sizeB: setB.size,
          diffA_minus_B: diffAB,
          diffB_minus_A: diffBA,
          title_parity: { matched, mismatched },
        });
        colLabelCounts[colLabel] = (colLabelCounts[colLabel] ?? 0) + 1;
      }
    }

    // 4. EXPLAIN ANALYZE on representative query.
    const explainSql = `EXPLAIN (ANALYZE, FORMAT JSON) SELECT id, col_label, url, title FROM public.rix_runs_v2_cited_urls WHERE ticker = 'IBE' AND period_from >= '2026-01-01'`;
    const { data: explainData, error: explainErr } = await supabase.rpc(
      "execute_sql",
      { sql_query: explainSql },
    );

    // 5. Aggregates + verdict.
    const totalRowsTested = perRow.length;
    const failures = perRow.filter(
      (r) => r.diffA_minus_B.length > 0 || r.diffB_minus_A.length > 0,
    );
    const titleMismatches = perRow.reduce(
      (acc, r) => acc + r.title_parity.mismatched,
      0,
    );

    const verdict = {
      url_parity: failures.length === 0 ? "GREEN" : "RED",
      total_rows_evaluated: totalRowsTested,
      total_failures: failures.length,
      title_mismatches: titleMismatches,
      col_label_distribution: colLabelCounts,
      sample_size: sampleRows.length,
    };

    return new Response(
      JSON.stringify(
        {
          verdict,
          per_row: perRow,
          explain: explainData ?? null,
          explain_error: explainErr?.message ?? null,
        },
        null,
        2,
      ),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});