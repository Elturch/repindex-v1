// Agente Rix v2 — skill companyAnalysis (max 400 LOC)
// Maneja el intent "company_analysis": construye DataPack real, compone
// prompt modular y delega la síntesis al LLM (OpenAI o3 con fallback).
// Extraído de la lógica del intent "company_analysis" en
// chat-intelligence/index.ts (FULL_SELECT, llamada streamOpenAIResponse,
// composición de system prompt).
import type {
  DataPack,
  ReportMetadata,
  Skill,
  SkillInput,
  SkillOutput,
} from "../types.ts";
import { buildDataPack } from "../datapack/builder.ts";
import { buildBasePrompt } from "../prompts/base.ts";
import { buildAntiHallucinationRules } from "../prompts/antiHallucination.ts";
import { buildPeriodRules } from "../prompts/periodMode.ts";
import { buildSnapshotRules } from "../prompts/snapshotMode.ts";
import { buildCoverageRules } from "../prompts/coverageRules.ts";
import { streamOpenAIResponse } from "../shared/streamOpenAI.ts";
import { renderModelBreakdownTable } from "../datapack/modelBreakdown.ts";
import { renderTemporalEvolutionTable } from "../datapack/temporalEvolution.ts";
import { renderDivergenceBlock } from "../datapack/divergenceStats.ts";
import { renderRecommendationsBlock } from "../datapack/recommendations.ts";
import {
  buildCompetitiveContext,
  renderCompetitiveContextTable,
} from "../datapack/competitiveContext.ts";

/** Compose the system prompt from the requested modules. */
export function composePrompt(
  modules: string[],
  datapack: DataPack,
  parsedFromISO: string,
  parsedToISO: string,
): string {
  const blocks: string[] = [];
  for (const m of modules) {
    if (m === "base") {
      blocks.push(buildBasePrompt({ languageName: "español" }));
    } else if (m === "antiHallucination") {
      blocks.push(buildAntiHallucinationRules());
    } else if (m === "periodMode") {
      blocks.push(
        buildPeriodRules({
          fromISO: parsedFromISO,
          toISO: parsedToISO,
          weeksCount: datapack.temporal.snapshots_available,
          requestedLabel: datapack.temporal.requested_label,
        }),
      );
    } else if (m === "snapshotMode") {
      blocks.push(
        buildSnapshotRules({
          weekFromISO: parsedFromISO,
          weekToISO: parsedToISO,
        }),
      );
    } else if (m === "coverageRules") {
      blocks.push(
        buildCoverageRules({
          requested: datapack.models_coverage.requested,
          withData: datapack.models_coverage.with_data,
          missing: datapack.models_coverage.missing,
          snapshotsExpected: datapack.temporal.snapshots_expected,
          snapshotsAvailable: datapack.temporal.snapshots_available,
          coverageRatio: datapack.temporal.coverage_ratio,
          isPartial: datapack.temporal.is_partial,
        }),
      );
    }
  }
  return blocks.join("\n\n");
}

/** Render the user message: question + pre-rendered tables + raw evidence. */
function buildUserMessage(question: string, datapack: DataPack): string {
  const head = [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${datapack.entity.company_name} (${datapack.entity.ticker})`,
    `SECTOR: ${datapack.entity.sector_category ?? "n/d"}`,
    `PERÍODO: ${datapack.temporal.from} → ${datapack.temporal.to} (${datapack.temporal.snapshots_available} semanas)`,
    `MODELOS CON DATOS: ${datapack.models_coverage.with_data.join(", ") || "(ninguno)"}`,
    `MODELOS SIN DATOS: ${datapack.models_coverage.missing.join(", ") || "(ninguno)"}`,
    "",
  ].join("\n");

  const tables = datapack.pre_rendered_tables.length
    ? [
      "TABLAS PRE-RENDERIZADAS (inclúyelas LITERALMENTE en las secciones indicadas, NO las regeneres):",
      "",
      "ESTRUCTURA OBLIGATORIA DEL INFORME (8 secciones, en este orden EXACTO):",
      "## 1. Contexto General — narrativa breve (3-4 frases) sobre el período y la empresa.",
      "## 2. Tabla de KPIs — inserta literalmente la tabla [KPI_TABLE].",
      "## 3. Visión por Modelo de IA — inserta literalmente la tabla [MODEL_BREAKDOWN_TABLE] + 1 párrafo interpretativo.",
      "## 4. Evolución Temporal — inserta literalmente la tabla [TEMPORAL_EVOLUTION_TABLE] + 1 párrafo de tendencia.",
      "## 5. Contexto Competitivo — inserta literalmente la tabla [COMPETITIVE_TABLE] + 1 párrafo de posicionamiento.",
      "## 6. Análisis de Métricas — narrativa por dimensión (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) explicando fortalezas y debilidades.",
      "## 7. Recomendaciones — inserta literalmente el bloque [RECOMMENDATIONS_BLOCK].",
      "## 8. Ficha Metodológica — período, modelos usados, observaciones, divergencia inter-modelo (incluye [DIVERGENCE_BLOCK]).",
      "",
      "BLOQUES PRE-RENDERIZADOS (cópialos tal cual donde corresponda):",
      "",
      datapack.pre_rendered_tables.join("\n\n"),
    ].join("\n")
    : "TABLAS PRE-RENDERIZADAS: (ninguna — datos insuficientes)";

  const summary = datapack.period_summary
    ? [
      "",
      "RESUMEN DEL PERÍODO:",
      `• RIX medio: ${datapack.period_summary.rix_mean}`,
      `• Tendencia RIX: ${datapack.period_summary.rix_trend}`,
      `• Métrica más fuerte: ${datapack.period_summary.strongest}`,
      `• Métrica más débil: ${datapack.period_summary.weakest}`,
      `• Métrica más volátil: ${datapack.period_summary.most_volatile}`,
    ].join("\n")
    : "";

  return [head, tables, summary].join("\n");
}

function buildMetadata(datapack: DataPack, observations: number): ReportMetadata {
  const ranges: number[] = [];
  for (const m of datapack.metrics) {
    const r = (m.max ?? 0) - (m.min ?? 0);
    if (Number.isFinite(r)) ranges.push(r);
  }
  const avgRange = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
  const divergence_level = avgRange < 10 ? "alto" : avgRange < 20 ? "medio" : "bajo";
  return {
    models_used: datapack.models_coverage.with_data.join(","),
    period_from: datapack.temporal.from,
    period_to: datapack.temporal.to,
    observations_count: observations,
    divergence_level,
    divergence_points: Math.round(avgRange),
    unique_companies: 1,
    unique_weeks: datapack.temporal.snapshots_available,
  };
}

function buildFallbackContent(datapack: DataPack, error: string | undefined): string {
  return [
    `**Análisis de ${datapack.entity.company_name} (${datapack.entity.ticker})**`,
    "",
    `Período: ${datapack.temporal.from} → ${datapack.temporal.to} (${datapack.temporal.snapshots_available} semanas)`,
    `Modelos con datos: ${datapack.models_coverage.with_data.join(", ") || "(ninguno)"}`,
    "",
    error
      ? `_No se pudo completar la síntesis del LLM (${error}). Te muestro las tablas pre-renderizadas:_`
      : `_Datos insuficientes para una síntesis completa. Tablas disponibles:_`,
    "",
    ...datapack.pre_rendered_tables,
  ].join("\n");
}

export const companyAnalysisSkill: Skill = {
  name: "companyAnalysis",
  intents: ["company_analysis"],

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { parsed, supabase, logPrefix, onChunk } = input;
    const tag = `${logPrefix}[companyAnalysis]`;
    console.log(`${tag} START | ticker=${parsed.entities[0]?.ticker ?? "n/a"} | mode=${parsed.mode}`);
    console.log(
      `${tag} temporal window before buildDataPack | from=${parsed.temporal.from} | to=${parsed.temporal.to} | requested=${parsed.temporal.requested_label}`,
    );

    // 1. Build the real DataPack from Supabase
    let datapack;
    let observations_count = 0;
    try {
      const built = await buildDataPack(supabase, parsed);
      datapack = built.datapack;
      observations_count = built.observations_count;
    } catch (e: any) {
      console.error(`${tag} buildDataPack threw:`, e?.message ?? e);
      throw e;
    }
    console.log(
      `${tag} datapack ready | obs=${observations_count} | models_with_data=${datapack.models_coverage.with_data.length}`,
    );

    // 1b. PARALLEL ENRICHMENT: pre-render the 5 additional blocks.
    //     4 of them are pure functions over raw_rows (no extra SQL).
    //     Only competitiveContext executes one extra query, in parallel.
    const t0 = Date.now();
    const [competitive] = await Promise.all([
      buildCompetitiveContext(supabase, datapack.entity, datapack.temporal).catch((e) => {
        console.warn(`${tag} competitive failed:`, e?.message ?? e);
        return { entity_rank: null, total: 0, table: [] };
      }),
    ]);
    const modelBreakdown = renderModelBreakdownTable(datapack.raw_rows);
    const temporalEvo = renderTemporalEvolutionTable(datapack.raw_rows);
    const divergence = renderDivergenceBlock(datapack.raw_rows);
    const recommendations = renderRecommendationsBlock(datapack.metrics);
    const competitiveTable = renderCompetitiveContextTable(competitive, datapack.entity.ticker);
    console.log(`${tag} enrichment done in ${Date.now() - t0}ms`);

    // 1c. Append the new blocks (in canonical order) AFTER the existing
    //     pre-rendered tables (KPI table is already in datapack.pre_rendered_tables[0]).
    const enrichedTables = [
      ...datapack.pre_rendered_tables,
      modelBreakdown,
      temporalEvo,
      competitiveTable,
      recommendations,
      divergence,
    ].filter((s) => s && s.trim().length > 0);
    datapack = { ...datapack, pre_rendered_tables: enrichedTables };

    // 2. Select prompt modules based on mode + coverage
    const modules: string[] = ["base", "antiHallucination"];
    modules.push(parsed.mode === "period" ? "periodMode" : "snapshotMode");
    if (datapack.temporal.is_partial || datapack.models_coverage.missing.length > 0) {
      modules.push("coverageRules");
    } else {
      // siempre incluimos coverage para que las reglas de consenso se apliquen
      modules.push("coverageRules");
    }

    // 3. If no data at all, skip the LLM call to save tokens.
    if (observations_count === 0) {
      const metadata = buildMetadata(datapack, 0);
      const fallback = buildFallbackContent(datapack, undefined);
      // Emit the fallback as a single chunk so the stream still produces output.
      try { onChunk?.(fallback); } catch (_) { /* noop */ }
      return {
        datapack: {
          ...datapack,
          // El orchestrator usa pre_rendered_tables[0] como respuesta principal.
          pre_rendered_tables: [fallback, ...datapack.pre_rendered_tables],
        },
        prompt_modules: modules,
        metadata,
      };
    }

    // 4. Compose system prompt + user message
    const systemPrompt = composePrompt(modules, datapack, parsed.temporal.from, parsed.temporal.to);
    const userMessage = buildUserMessage(parsed.raw_question, datapack);

    // 5. Stream the LLM (token-by-token via onChunk). On error, fallback to
    //    pre-rendered tables and emit them as a single chunk so the SSE pipe
    //    still delivers something to the client.
    const { fullText, error } = await streamOpenAIResponse({
      systemPrompt,
      userMessage,
      logPrefix: tag,
      onChunk: (delta) => { try { onChunk?.(delta); } catch (_) { /* noop */ } },
    });
    let finalContent = fullText;
    if (!finalContent || finalContent.trim().length === 0) {
      finalContent = buildFallbackContent(datapack, error);
      try { onChunk?.(finalContent); } catch (_) { /* noop */ }
    }

    // 6. Inject the final content as the FIRST pre-rendered "table"
    //    so the orchestrator can stream it as the answer body.
    const enrichedDatapack: DataPack = {
      ...datapack,
      pre_rendered_tables: [finalContent, ...datapack.pre_rendered_tables],
    };

    return {
      datapack: enrichedDatapack,
      prompt_modules: modules,
      metadata: buildMetadata(datapack, observations_count),
    };
  },
};

export const __test__ = { composePrompt, buildUserMessage, buildMetadata };