// Agente Rix v2 — skill sectorRanking (max 300 LOC)
// Maneja el intent "sector_ranking": construye un ranking real de empresas
// por RIX medio (con desglose por modelo) y delega la síntesis al LLM en
// streaming. Sigue el mismo patrón que companyAnalysis.ts.
import type {
  DataPack,
  ModelName,
  ReportMetadata,
  Skill,
  SkillInput,
  SkillOutput,
} from "../types.ts";
import { buildBasePrompt } from "../prompts/base.ts";
import { buildAntiHallucinationRules } from "../prompts/antiHallucination.ts";
import { buildPeriodRules } from "../prompts/periodMode.ts";
import { buildSnapshotRules } from "../prompts/snapshotMode.ts";
import { buildCoverageRules } from "../prompts/coverageRules.ts";
import { buildRankingRules } from "../prompts/rankingMode.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";

const RANKING_SELECT =
  "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date";

const MODEL_NAME_MAP: Array<[string, ModelName]> = [
  ["chatgpt", "ChatGPT"], ["gpt", "ChatGPT"], ["openai", "ChatGPT"],
  ["perplexity", "Perplexity"],
  ["gemini", "Gemini"], ["google", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["grok", "Grok"], ["xai", "Grok"],
  ["qwen", "Qwen"], ["alibaba", "Qwen"],
];

function normModel(raw: unknown): ModelName | null {
  const s = String(raw ?? "").toLowerCase().trim();
  for (const [k, v] of MODEL_NAME_MAP) if (s.includes(k)) return v;
  return null;
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function semaforo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "⚪";
  if (n >= 70) return "🟢";
  if (n >= 50) return "🟡";
  return "🔴";
}

interface RankingRow {
  ticker: string;
  name: string;
  rix_mean: number;
  obs: number;
  per_model: Partial<Record<ModelName, number>>;
}

async function fetchRankingRows(
  supabase: any,
  fromISO: string,
  toISO: string,
  sector: string | null,
): Promise<any[]> {
  let q = supabase
    .from("rix_runs_v2")
    .select(RANKING_SELECT)
    .gte("batch_execution_date", fromISO)
    .lte("batch_execution_date", toISO)
    .not("09_rix_score", "is", null);
  if (sector && sector.trim().length > 0) {
    // Join lógico vía repindex_root_issuers no disponible aquí: filtramos por
    // tickers que pertenezcan al sector mediante una sub-consulta.
    const { data: tks } = await supabase
      .from("repindex_root_issuers")
      .select("ticker")
      .eq("sector_category", sector);
    const list = (tks ?? []).map((t: any) => t.ticker).filter(Boolean);
    if (list.length > 0) q = q.in("05_ticker", list);
  }
  const all: any[] = [];
  for (let p = 0; p < 5; p++) {
    const { data, error } = await q.range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][sectorRanking]", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function aggregateRanking(rows: any[], topN: number): RankingRow[] {
  const byTicker = new Map<string, { name: string; values: number[]; per_model: Map<ModelName, number[]> }>();
  for (const r of rows) {
    const t = String(r["05_ticker"] ?? "").trim();
    if (!t) continue;
    const v = typeof r["09_rix_score"] === "number" ? r["09_rix_score"] : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    if (!byTicker.has(t)) {
      byTicker.set(t, { name: String(r["03_target_name"] ?? t), values: [], per_model: new Map() });
    }
    const slot = byTicker.get(t)!;
    slot.values.push(v);
    const m = normModel(r["02_model_name"]);
    if (m) {
      if (!slot.per_model.has(m)) slot.per_model.set(m, []);
      slot.per_model.get(m)!.push(v);
    }
  }
  const out: RankingRow[] = [];
  for (const [ticker, info] of byTicker) {
    const mean = info.values.reduce((a, b) => a + b, 0) / Math.max(info.values.length, 1);
    const per_model: RankingRow["per_model"] = {};
    for (const [m, vals] of info.per_model) {
      per_model[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out.push({ ticker, name: info.name, rix_mean: mean, obs: info.values.length, per_model });
  }
  out.sort((a, b) => b.rix_mean - a.rix_mean);
  return out.slice(0, topN);
}

function renderRankingTable(rows: RankingRow[], models: ModelName[]): string {
  const head = ["#", "Empresa", "RIX medio", ...models, "Obs."];
  const sep = head.map(() => "---").join(" | ");
  const lines = rows.map((r, i) => {
    const cells = [
      String(i + 1),
      `${r.name} (${r.ticker})`,
      `${semaforo(r.rix_mean)} ${fmt(r.rix_mean)}`,
      ...models.map((m) => fmt(r.per_model[m])),
      String(r.obs),
    ];
    return `| ${cells.join(" | ")} |`;
  });
  return [
    "**Ranking por RIX medio (con desglose por modelo)**",
    "",
    `| ${head.join(" | ")} |`,
    `| ${sep} |`,
    ...lines,
  ].join("\n");
}

function buildUserMessage(question: string, scope: string, table: string, rows: RankingRow[]): string {
  const compact = rows.map((r, i) => `${i + 1}. ${r.name} (${r.ticker}) RIX=${fmt(r.rix_mean)}`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `ALCANCE: ${scope}`,
    "",
    "TABLA DE RANKING PRE-RENDERIZADA (úsala literal, NO la regeneres):",
    "",
    table,
    "",
    "RESUMEN COMPACTO PARA REFERENCIA:",
    compact,
  ].join("\n");
}

function buildMetadata(rows: RankingRow[], fromISO: string, toISO: string, models: ModelName[]): ReportMetadata {
  const rixs = rows.map((r) => r.rix_mean).filter((n) => Number.isFinite(n));
  const range = rixs.length ? Math.max(...rixs) - Math.min(...rixs) : 0;
  return {
    models_used: models.join(","),
    period_from: fromISO,
    period_to: toISO,
    observations_count: rows.reduce((a, r) => a + r.obs, 0),
    divergence_level: range < 10 ? "bajo" : range < 25 ? "medio" : "alto",
    divergence_points: Math.round(range),
    unique_companies: rows.length,
    unique_weeks: 0,
  };
}

export const sectorRankingSkill: Skill = {
  name: "sectorRanking",
  intents: ["sector_ranking"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[sectorRanking]`;
    const sector = parsed.entities[0]?.sector_category ?? null;
    const scopeLabel = sector ? `sector ${sector}` : "todas las empresas cubiertas";
    const topN = 15;

    const rows = await fetchRankingRows(supabase, parsed.temporal.from, parsed.temporal.to, sector);
    const ranking = aggregateRanking(rows, topN);
    const models = parsed.models;
    const table = ranking.length > 0 ? renderRankingTable(ranking, models) : "_Sin datos para el período/alcance solicitado._";

    const datapack: DataPack = {
      entity: parsed.entities[0] ?? { ticker: "N/A", company_name: scopeLabel, sector_category: sector, source: "exact" },
      temporal: parsed.temporal,
      mode: parsed.mode,
      models_used: models,
      models_coverage: { requested: models, with_data: models, missing: [] },
      metrics: [],
      raw_rows: rows,
      pre_rendered_tables: [table],
    };

    const modules = ["base", "antiHallucination", "rankingMode"];
    if (parsed.mode === "period") modules.push("periodMode"); else modules.push("snapshotMode");

    if (ranking.length === 0) {
      const fallback = `**Ranking · ${scopeLabel}**\n\n_Sin datos suficientes para construir un ranking en el período ${parsed.temporal.from} → ${parsed.temporal.to}._`;
      try { onChunk?.(fallback); } catch (_) { /* noop */ }
      return {
        datapack: { ...datapack, pre_rendered_tables: [fallback] },
        prompt_modules: modules,
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to, models),
      };
    }

    const systemPrompt = [
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      parsed.mode === "period"
        ? buildPeriodRules({ fromISO: parsed.temporal.from, toISO: parsed.temporal.to, weeksCount: parsed.temporal.snapshots_available, requestedLabel: parsed.temporal.requested_label })
        : buildSnapshotRules({ weekFromISO: parsed.temporal.from, weekToISO: parsed.temporal.to }),
      buildRankingRules({ scopeLabel, topN: ranking.length, weeksCount: parsed.temporal.snapshots_available, modelsCount: models.length }),
    ].join("\n\n");

    const userMessage = buildUserMessage(parsed.raw_question, scopeLabel, table, ranking);
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });

    const finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Ranking · ${scopeLabel}**\n\n${table}\n\n_No se pudo completar la síntesis (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    return {
      datapack: { ...datapack, pre_rendered_tables: [finalContent, table] },
      prompt_modules: modules,
      metadata: buildMetadata(ranking, parsed.temporal.from, parsed.temporal.to, models),
    };
  },
};

export const __test__ = { aggregateRanking, renderRankingTable, normModel };