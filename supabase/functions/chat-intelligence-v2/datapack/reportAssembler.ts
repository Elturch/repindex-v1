// Agente Rix v2 — Transversal Report Assembler (FASE B, max 200 LOC)
// One-stop pre-rendering layer that EVERY skill must call. Receives the
// raw rows + metric aggregates a skill already has, and produces the
// canonical set of pre-rendered markdown blocks (KPI, model breakdown,
// temporal evolution, divergence, recommendations). Each skill picks
// which blocks to surface in its prompt.
//
// Constraint #9: tables are pre-rendered HERE in TypeScript, never by the LLM.
// Constraint: this file MUST stay under 200 LOC. Logic for individual
// blocks lives in their own datapack/*.ts modules; this file only orchestrates.
import type { MetricAggregation, Mode } from "../types.ts";
import { renderPeriodKpiTable } from "./tableRenderer.ts";
import { renderModelBreakdownTable } from "./modelBreakdown.ts";
import { renderTemporalEvolutionTable } from "./temporalEvolution.ts";
import { renderDivergenceBlock } from "./divergenceStats.ts";
import { renderRecommendationsBlock } from "./recommendations.ts";
import { computePeriodAggregation, type RawRunRow } from "../../_shared/periodAggregation.ts";

/**
 * Convert raw rix_runs_v2 rows into the canonical MetricAggregation[]
 * shape required by the KPI table + recommendations renderers. Any skill
 * holding raw rows can call this; it reuses the same period aggregator
 * the main builder uses, so numbers stay consistent across reports.
 */
export function metricsFromRows(rows: RawRunRow[]): MetricAggregation[] {
  if (!rows.length) return [];
  const agg = computePeriodAggregation(rows);
  const out: MetricAggregation[] = [];
  for (const k of ["RIX", "NVM", "DRM", "SIM", "RMM", "CEM", "GAM", "DCM", "CXM"]) {
    const a = agg.period_aggregation[k];
    if (!a || a.weeks_count === 0) continue;
    out.push({
      metric: k as MetricAggregation["metric"],
      mean: a.mean ?? 0,
      median: a.median ?? 0,
      min: a.min ?? 0,
      max: a.max ?? 0,
      first_week: a.first_week_value ?? 0,
      last_week: a.last_week_value ?? 0,
      delta_period: a.delta_period ?? 0,
      trend: (a.trend === "n/d" ? "estable" : a.trend) as MetricAggregation["trend"],
      volatility: a.volatility ?? 0,
      weeks_count: a.weeks_count,
    });
  }
  return out;
}

/** All canonical blocks the assembler can produce. Empty string = N/A. */
export interface AssembledReport {
  kpiTable: string;
  modelBreakdown: string;
  temporalEvolution: string;
  divergenceStats: string;
  recommendations: string;
  /** Filled by callers that ran an extra SQL (currently companyAnalysis only). */
  competitiveContext: string;
}

export interface AssembleInput {
  raw_rows: any[];
  /** Metric aggregations (already computed by the skill or builder). */
  metrics: MetricAggregation[];
  /** "period" or "snapshot" — drives KPI table layout. */
  mode: Mode;
  /** Optional pre-rendered competitive context (companyAnalysis only). */
  competitiveContext?: string;
}

/**
 * Produce the full set of pre-rendered blocks. Each block degrades to ""
 * when its inputs are insufficient — callers MUST filter "" out before
 * concatenating. This is a pure function: no SQL, no I/O.
 */
export function assembleReport(input: AssembleInput): AssembledReport {
  return {
    kpiTable: input.metrics.length > 0 ? renderPeriodKpiTable(input.metrics, input.mode) : "",
    modelBreakdown: renderModelBreakdownTable(input.raw_rows),
    temporalEvolution: renderTemporalEvolutionTable(input.raw_rows),
    divergenceStats: renderDivergenceBlock(input.raw_rows),
    recommendations: renderRecommendationsBlock(input.metrics),
    competitiveContext: input.competitiveContext ?? "",
  };
}

/** Sections each skill must surface. Drives prompt structure + block order. */
export const SECTIONS_BY_SKILL = {
  companyAnalysis: ["kpiTable", "modelBreakdown", "temporalEvolution", "competitiveContext", "recommendations", "divergenceStats"] as const,
  sectorRanking:   ["kpiTable", "modelBreakdown", "divergenceStats"] as const,
  comparison:      ["kpiTable", "modelBreakdown", "recommendations", "divergenceStats"] as const,
  modelDivergence: ["modelBreakdown", "divergenceStats", "kpiTable"] as const,
  periodEvolution: ["temporalEvolution", "kpiTable", "modelBreakdown", "divergenceStats"] as const,
} as const;

export type SkillKey = keyof typeof SECTIONS_BY_SKILL;

/**
 * Pick + concatenate the relevant blocks for a given skill, preserving
 * canonical order, dropping empty blocks. Callers append this string after
 * the skill's own primary table (ranking table, comparison table, etc).
 */
export function selectBlocks(report: AssembledReport, skill: SkillKey): string[] {
  const order = SECTIONS_BY_SKILL[skill];
  return order
    .map((k) => report[k as keyof AssembledReport])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

/**
 * Standard methodology footer that every skill includes at the end of its
 * prompt. Centralised so that period, models and observation count are
 * displayed consistently across the 5 report types.
 */
export function renderMethodologyFooter(input: {
  fromISO: string;
  toISO: string;
  models: string[];
  observationsCount: number;
  uniqueWeeks: number;
  divergenceLevel?: string;
}): string {
  const lines = [
    "**Ficha metodológica**",
    "",
    `• Período analizado: ${input.fromISO} → ${input.toISO}`,
    `• Modelos de IA: ${input.models.length > 0 ? input.models.join(", ") : "n/d"}`,
    `• Observaciones (filas): ${input.observationsCount}`,
    `• Semanas con datos: ${input.uniqueWeeks}`,
  ];
  if (input.divergenceLevel) {
    lines.push(`• Nivel de divergencia inter-modelo: ${input.divergenceLevel}`);
  }
  return lines.join("\n");
}

/**
 * Build the canonical "TABLAS PRE-RENDERIZADAS" block for the user message.
 * The skill's primary table goes FIRST (skill-specific: ranking table,
 * comparison table, etc.), followed by the assembler-produced blocks.
 */
export function buildPreRenderedSection(skillPrimaryTable: string, blocks: string[], methodologyFooter: string): string {
  const parts = [skillPrimaryTable, ...blocks, methodologyFooter].filter((s) => s && s.trim().length > 0);
  return [
    "TABLAS PRE-RENDERIZADAS (inclúyelas LITERALMENTE, NO las regeneres):",
    "",
    parts.join("\n\n"),
  ].join("\n");
}

export const __test__ = { SECTIONS_BY_SKILL };