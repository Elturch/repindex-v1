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

    const SELECT_COLS =
      `id, "05_ticker", "02_model_name", "06_period_from", "07_period_to", batch_execution_date,
       "20_res_gpt_bruto","21_res_perplex_bruto","22_res_gemini_bruto","23_res_deepseek_bruto",
       respuesta_bruto_claude, respuesta_bruto_grok, respuesta_bruto_qwen`;

    // 1. Stratified rows: one batch query with IN (tickers), most-recent per
    //    ticker. We over-fetch and pick first per ticker in TS.
    const { data: stratPool } = await supabase
      .from("rix_runs_v2")
      .select(SELECT_COLS)
      .in("05_ticker", STRAT_TICKERS as unknown as string[])
      .order("batch_execution_date", { ascending: false })
      .limit(STRAT_TICKERS.length * 8);

    const stratRows: any[] = [];
    const seenStrat = new Set<string>();
    for (const r of stratPool ?? []) {
      const t = r["05_ticker"];
      if (seenStrat.has(t)) continue;
      seenStrat.add(t);
      stratRows.push(r);
    }

    // 2. Random 23 rows in ONE query with random offset window.
    const { count: totalCount } = await supabase
      .from("rix_runs_v2")
      .select("id", { count: "exact", head: true });
    const total = totalCount ?? 0;
    const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, total - 100)));
    const { data: randomPool } = await supabase
      .from("rix_runs_v2")
      .select(SELECT_COLS)
      .range(offset, offset + 80);
    const seenIds = new Set(stratRows.map((r) => r.id));
    const randomRows: any[] = [];
    for (const r of randomPool ?? []) {
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      randomRows.push(r);
      if (randomRows.length >= 23) break;
    }

    const sampleRows = [...stratRows, ...randomRows];

    // 3. ONE bulk query against the view for all sample IDs.
    const allIds = sampleRows.map((r) => r.id);
    const viewRowsByIdLabel = new Map<string, any[]>();
    if (allIds.length > 0) {
      const { data: viewAll } = await supabase
        .from("rix_runs_v2_cited_urls")
        .select("id, col_label, url, title")
        .in("id", allIds);
      for (const vr of viewAll ?? []) {
        const key = `${vr.id}::${vr.col_label}`;
        const arr = viewRowsByIdLabel.get(key) ?? [];
        arr.push(vr);
        viewRowsByIdLabel.set(key, arr);
      }
    }

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
        const viewRowsForLabel = (viewRowsByIdLabel.get(`${row.id}::${colLabel}`) ?? []).map(
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