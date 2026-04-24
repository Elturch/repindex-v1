// Agente Rix v2 — skill periodEvolution (max 300 LOC)
// Intent "period_evolution": serie temporal de RIX por semana para una
// empresa, con deltas y tendencia. Streaming del LLM.
import type {
  DataPack,
  ReportMetadata,
  Skill,
  SkillInput,
  SkillOutput,
} from "../types.ts";
import { buildBasePrompt } from "../prompts/base.ts";
import { buildAntiHallucinationRules } from "../prompts/antiHallucination.ts";
import { buildPeriodRules } from "../prompts/periodMode.ts";
import { buildEvolutionRules } from "../prompts/evolutionMode.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";
import {
  assembleReport,
  buildPreRenderedSection,
  metricsFromRows,
  renderMethodologyFooter,
  selectBlocks,
} from "../datapack/reportAssembler.ts";

function buildCoverageBanner(t: { from: string; to: string; coverage_ratio: number; is_partial: boolean; snapshots_available: number; snapshots_expected: number }): string {
  if (!t.is_partial && t.coverage_ratio >= 0.9) return "";
  const pct = Math.round((t.coverage_ratio ?? 0) * 100);
  return `IMPORTANTE — COBERTURA PARCIAL (PRIORIDAD MÁXIMA):
• El período solicitado solo dispone de datos desde ${t.from} hasta ${t.to} (${t.snapshots_available}/${t.snapshots_expected} snapshots, ~${pct}%).
• ABRE el informe declarando esta cobertura parcial en el primer párrafo.
• PROHIBIDO extrapolar a semanas no cubiertas.`;
}

const SELECT = "05_ticker, 03_target_name, 02_model_name, 09_rix_score, batch_execution_date";

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function sign(n: number): string {
  if (!Number.isFinite(n)) return "n/d";
  return n >= 0 ? `+${fmt(n)}` : fmt(n);
}

function semaforo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "⚪";
  if (n >= 70) return "🟢";
  if (n >= 50) return "🟡";
  return "🔴";
}

function avg(arr: number[]): number {
  if (!arr.length) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

async function fetchRows(supabase: any, ticker: string, fromISO: string, toISO: string): Promise<any[]> {
  const all: any[] = [];
  for (let p = 0; p < 5; p++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(SELECT)
      .eq("05_ticker", ticker)
      .gte("batch_execution_date", fromISO)
      .lte("batch_execution_date", toISO)
      .order("batch_execution_date", { ascending: true })
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (error) { console.error("[RIX-V2][periodEvolution]", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

interface WeekPoint {
  week: string;
  rix_avg: number;
  models_count: number;
}

function buildSeries(rows: any[]): WeekPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const r of rows) {
    const w = String(r.batch_execution_date ?? "").slice(0, 10);
    const v = parseFloat(r["09_rix_score"]);
    if (!w || !Number.isFinite(v)) continue;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(v);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, vals]) => ({ week, rix_avg: avg(vals), models_count: vals.length }));
}

function renderEvolutionTable(series: WeekPoint[]): string {
  if (!series.length) return "_Sin datos para el período._";
  const lines = series.map((p, i) => {
    const prev = i > 0 ? series[i - 1].rix_avg : p.rix_avg;
    const delta = p.rix_avg - prev;
    return `| ${p.week} | ${semaforo(p.rix_avg)} ${fmt(p.rix_avg)} | ${i === 0 ? "—" : sign(delta)} | ${p.models_count} |`;
  });
  return [
    "**Evolución semanal del RIX (media inter-modelo)**",
    "",
    "| Semana | RIX | Δ vs semana previa | Modelos |",
    "|---|---|---|---|",
    ...lines,
  ].join("\n");
}

function buildUserMessage(question: string, ticker: string, table: string, series: WeekPoint[]): string {
  const compact = series.map((p) => `${p.week}: RIX=${fmt(p.rix_avg)} (${p.models_count} modelos)`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${ticker}`,
    "",
    "TABLA DE EVOLUCIÓN PRE-RENDERIZADA (úsala literal, NO la regeneres):",
    "",
    table,
    "",
    "SERIE COMPACTA PARA CITAR:",
    compact,
  ].join("\n");
}

/** FASE D — periodEvolution assembled with the transversal helper. */
function buildUserMessageWithAssembler(
  question: string,
  ticker: string,
  evolutionTable: string,
  series: WeekPoint[],
  rawRows: any[],
  fromISO: string,
  toISO: string,
  models: string[],
): string {
  const metrics = metricsFromRows(rawRows);
  const report = assembleReport({ raw_rows: rawRows, metrics, mode: "period" });
  const blocks = selectBlocks(report, "periodEvolution");
  const methodology = renderMethodologyFooter({
    fromISO, toISO, models, observationsCount: rawRows.length,
    uniqueWeeks: series.length,
  });
  const compact = series.map((p) => `${p.week}: RIX=${fmt(p.rix_avg)} (${p.models_count} modelos)`).join("\n");
  return [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${ticker}`,
    "",
    buildPreRenderedSection(evolutionTable, blocks, methodology),
    "",
    "ESTRUCTURA OBLIGATORIA DEL INFORME:",
    "## 1. Titular — 2 frases con la tendencia inicio→fin.",
    "## 2. Evolución temporal — inserta literalmente la tabla de evolución.",
    "## 3. KPIs agregados del período — inserta literalmente la tabla de KPIs.",
    "## 4. Visión por modelo — inserta literalmente el bloque de breakdown.",
    "## 5. Divergencia inter-modelo — inserta literalmente el bloque de divergencia.",
    "## 6. Ficha metodológica — inserta literalmente el bloque metodológico.",
    "",
    "SERIE COMPACTA PARA CITAR:",
    compact,
  ].join("\n");
}

function buildMetadata(series: WeekPoint[], fromISO: string, toISO: string): ReportMetadata {
  const vals = series.map((p) => p.rix_avg).filter((x) => Number.isFinite(x));
  const sd = stdev(vals);
  return {
    models_used: "",
    period_from: fromISO,
    period_to: toISO,
    observations_count: series.reduce((a, p) => a + p.models_count, 0),
    divergence_level: sd < 5 ? "bajo" : sd < 12 ? "medio" : "alto",
    divergence_points: Math.round(sd),
    unique_companies: 1,
    unique_weeks: series.length,
  };
}

export const periodEvolutionSkill: Skill = {
  name: "periodEvolution",
  intents: ["period_evolution"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[periodEvolution]`;
    const entity = parsed.entities[0];
    if (!entity || entity.ticker === "N/A") {
      const msg = "No reconozco la empresa. Indica el ticker o el nombre.";
      try { onChunk?.(msg); } catch (_) { /* noop */ }
      return {
        datapack: {
          entity: { ticker: "N/A", company_name: "N/A", sector_category: null, source: "exact" },
          temporal: parsed.temporal, mode: parsed.mode, models_used: parsed.models,
          models_coverage: { requested: parsed.models, with_data: [], missing: parsed.models },
          metrics: [], raw_rows: [], pre_rendered_tables: [msg],
        },
        prompt_modules: ["base", "antiHallucination"],
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to),
      };
    }

    const rows = await fetchRows(supabase, entity.ticker, parsed.temporal.from, parsed.temporal.to);
    const series = buildSeries(rows);
    const table = renderEvolutionTable(series);

    const datapack: DataPack = {
      entity, temporal: parsed.temporal, mode: parsed.mode,
      models_used: parsed.models,
      models_coverage: { requested: parsed.models, with_data: parsed.models, missing: [] },
      metrics: [], raw_rows: rows, pre_rendered_tables: [table],
    };

    if (series.length === 0) {
      const fb = `**Evolución · ${entity.company_name}**\n\n_Sin datos en el período ${parsed.temporal.from} → ${parsed.temporal.to}._`;
      try { onChunk?.(fb); } catch (_) { /* noop */ }
      return {
        datapack: { ...datapack, pre_rendered_tables: [fb] },
        prompt_modules: ["base", "antiHallucination"],
        metadata: buildMetadata([], parsed.temporal.from, parsed.temporal.to),
      };
    }

    const rixFirst = series[0].rix_avg;
    const rixLast = series[series.length - 1].rix_avg;
    const delta = rixLast - rixFirst;
    const trend: string = Math.abs(delta) < 2 ? "estable" : delta > 0 ? "alcista" : "bajista";

    const systemPrompt = [
      buildCoverageBanner(parsed.temporal),
      buildBasePrompt({ languageName: "español" }),
      buildAntiHallucinationRules(),
      buildPeriodRules({
        fromISO: parsed.temporal.from, toISO: parsed.temporal.to,
        weeksCount: parsed.temporal.snapshots_available, requestedLabel: parsed.temporal.requested_label,
      }),
      buildEvolutionRules({
        ticker: entity.ticker, weeksCount: series.length,
        fromISO: parsed.temporal.from, toISO: parsed.temporal.to,
        rixFirst, rixLast, trend, mostVolatile: "RIX",
      }),
    ].filter(Boolean).join("\n\n");

    const userMessage = buildUserMessageWithAssembler(
      parsed.effective_question ?? parsed.raw_question,
      entity.ticker, table, series,
      rows,
      parsed.temporal.from,
      parsed.temporal.to,
      parsed.models,
    );
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt, userMessage, logPrefix: tag,
      model: "o3",
      reasoning_effort: "medium",
      maxTokens: 24000,
      temperature: 0,
      onChunk: (d) => { try { onChunk?.(d); } catch (_) { /* noop */ } },
    });
    const finalContent = fullText && fullText.trim().length > 0
      ? fullText
      : (() => {
          const fb = `**Evolución · ${entity.ticker}**\n\n${table}\n\n_Síntesis no disponible (${error ?? "sin texto"})._`;
          try { onChunk?.(fb); } catch (_) { /* noop */ }
          return fb;
        })();

    return {
      datapack: { ...datapack, pre_rendered_tables: [finalContent, table] },
      prompt_modules: ["base", "antiHallucination", "periodMode", "evolutionMode"],
      metadata: buildMetadata(series, parsed.temporal.from, parsed.temporal.to),
    };
  },
};

export const __test__ = { buildSeries, renderEvolutionTable, stdev };