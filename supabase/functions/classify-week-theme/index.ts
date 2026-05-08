import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_THEMES = [
  "neutral",
  "positiva",
  "crisis_regulatoria",
  "crisis_financiera",
  "crisis_reputacional",
  "hito_corporativo",
  "resultado_financiero",
] as const;

const MODEL = "google/gemini-3-flash-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface RawRow {
  ticker: string;
  week_start: string; // YYYY-MM-DD (Sunday)
  texts: string[];
}

function isoSunday(d: Date): string {
  const x = new Date(d);
  const day = x.getUTCDay();
  // Snap to Sunday of that week (ISO weeks aside, our snapshots are Sunday).
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

async function classifyOne(
  ticker: string,
  week: string,
  texts: string[],
  apiKey: string,
): Promise<{
  theme: string;
  confidence: number;
  rationale: string;
} | null> {
  const sample = texts.slice(0, 6).map((t) => t.slice(0, 1500)).join("\n---\n");
  if (!sample.trim()) return null;

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Clasificas el tema dominante de la semana para una empresa, leyendo extractos de las respuestas de varios modelos de IA. Devuelve UNA etiqueta cerrada. No inventes; si dudas usa 'neutral'.",
      },
      {
        role: "user",
        content: `Empresa: ${ticker}\nSemana: ${week}\nExtractos:\n${sample}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "tag_week",
          description: "Etiquetar el tema dominante de la semana.",
          parameters: {
            type: "object",
            properties: {
              theme: { type: "string", enum: [...ALLOWED_THEMES] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", maxLength: 280 },
            },
            required: ["theme", "confidence", "rationale"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "tag_week" } },
  };

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("gateway error", r.status, await r.text());
    return null;
  }
  const json = await r.json();
  const args =
    json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    if (!ALLOWED_THEMES.includes(parsed.theme)) return null;
    return {
      theme: parsed.theme,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      rationale: String(parsed.rationale || "").slice(0, 280),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const params = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : Object.fromEntries(new URL(req.url).searchParams);
    const limit = Math.min(Number(params.limit ?? 40), 200);
    const tickerFilter: string | null = params.ticker ?? null;
    const weekFilter: string | null = params.week ?? null;

    // Fetch most recent V2 rows (last 60 days unless week is given).
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 60);
    let q = supabase
      .from("rix_runs_v2")
      .select(
        '"05_ticker","11_qualitative_summary","12_raw_text",batch_execution_date',
      )
      .gte("batch_execution_date", since.toISOString())
      .not("11_qualitative_summary", "is", null)
      .order("batch_execution_date", { ascending: false })
      .limit(2000);
    if (tickerFilter) q = q.eq("05_ticker", tickerFilter);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Group (ticker, weekSunday) → texts.
    const buckets = new Map<string, RawRow>();
    for (const r of rows ?? []) {
      const t: any = r;
      const ticker = t["05_ticker"];
      const date = t["batch_execution_date"];
      if (!ticker || !date) continue;
      const week = isoSunday(new Date(date));
      if (weekFilter && week !== weekFilter) continue;
      const key = `${ticker}|${week}`;
      if (!buckets.has(key)) buckets.set(key, { ticker, week_start: week, texts: [] });
      const txt = t["11_qualitative_summary"] || t["12_raw_text"];
      if (txt) buckets.get(key)!.texts.push(String(txt));
    }

    // Skip those already tagged.
    const keys = [...buckets.keys()];
    const tickers = [...new Set(keys.map((k) => k.split("|")[0]))];
    const weeks = [...new Set(keys.map((k) => k.split("|")[1]))];
    const { data: existing } = await supabase
      .from("weekly_theme_tags")
      .select("ticker, week_start")
      .in("ticker", tickers)
      .in("week_start", weeks);
    const taggedSet = new Set(
      (existing ?? []).map((e: any) => `${e.ticker}|${e.week_start}`),
    );
    const pending = keys.filter((k) => !taggedSet.has(k)).slice(0, limit);

    const results: any[] = [];
    for (const k of pending) {
      const b = buckets.get(k)!;
      const tag = await classifyOne(b.ticker, b.week_start, b.texts, apiKey);
      if (!tag) continue;
      const { error: upErr } = await supabase
        .from("weekly_theme_tags")
        .upsert({
          ticker: b.ticker,
          week_start: b.week_start,
          theme: tag.theme,
          confidence: tag.confidence,
          model_used: MODEL,
          source_count: b.texts.length,
          rationale: tag.rationale,
        }, { onConflict: "ticker,week_start" });
      if (upErr) {
        console.error("upsert err", upErr);
        continue;
      }
      results.push({ ticker: b.ticker, week_start: b.week_start, ...tag });
    }

    return new Response(
      JSON.stringify({
        scanned: buckets.size,
        already_tagged: taggedSet.size,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});