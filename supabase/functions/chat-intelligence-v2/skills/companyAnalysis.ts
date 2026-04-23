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
import { computeDivergenceStats } from "../datapack/divergenceStats.ts";
import { extractCitedSources, renderCitedSourcesBlock } from "../datapack/citedSources.ts";

/**
 * Build a COMPACT summary of cited sources for the LLM prompt only.
 * The full block (potentially hundreds of URLs, thousands of tokens) is
 * NEVER sent to the LLM — it is appended to the final response after the
 * LLM finishes streaming. This avoids OpenAI 400 (token limit) errors
 * while keeping section 8 fully populated for the FE.
 */
function buildCitedSourcesSummary(report: ReturnType<typeof extractCitedSources>): string {
  if (report.totalUrls === 0) return "";
  const topDomains = report.byDomain.slice(0, 10)
    .map((d) => `${d.domain} (${d.sources.length})`)
    .join(", ");
  return [
    "**Resumen de fuentes citadas (para narrativa, NO copies este bloque):**",
    `- Total: ${report.totalUrls} URLs únicas de ${report.totalDomains} medios distintos`,
    `- Top 10 dominios por número de fuentes: ${topDomains}`,
    "",
    "INSTRUCCIÓN ESPECIAL SECCIÓN 8: NO intentes listar las URLs. Escribe únicamente un párrafo introductorio (2-3 frases) sobre la procedencia de las fuentes (ej. 'Las IAs citaron N URLs de M medios, con dominio principal en prensa económica española...') y termina la sección con la línea exacta:",
    "<!--CITED_SOURCES_HERE-->",
    "El sistema sustituirá ese marcador por la bibliografía completa con badges, dominios y URLs clicables.",
  ].join("\n");
}

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
  // PROBLEMA 3 — surface requested-vs-available distinction so the LLM can
  // (and the user sees) the difference between the period asked for and the
  // period actually covered by data in BD.
  const requestedFrom = datapack.temporal.requested_from ?? datapack.temporal.from;
  const requestedTo = datapack.temporal.requested_to ?? datapack.temporal.to;
  const periodLine = (requestedFrom !== datapack.temporal.from || requestedTo !== datapack.temporal.to)
    ? [
        `PERÍODO SOLICITADO: ${requestedFrom} → ${requestedTo} (lo que pidió el usuario)`,
        `DATOS DISPONIBLES: ${datapack.temporal.from} → ${datapack.temporal.to} (${datapack.temporal.snapshots_available} semanas con observaciones)`,
      ].join("\n")
    : `PERÍODO: ${datapack.temporal.from} → ${datapack.temporal.to} (${datapack.temporal.snapshots_available} semanas)`;
  const head = [
    `PREGUNTA DEL USUARIO: ${question}`,
    "",
    `EMPRESA: ${datapack.entity.company_name} (${datapack.entity.ticker})`,
    `SECTOR: ${datapack.entity.sector_category ?? "n/d"}`,
    periodLine,
    `MODELOS CON DATOS: ${datapack.models_coverage.with_data.join(", ") || "(ninguno)"}`,
    `MODELOS SIN DATOS: ${datapack.models_coverage.missing.join(", ") || "(ninguno)"}`,
    "",
  ].join("\n");

  const tables = datapack.pre_rendered_tables.length
    ? [
      "TABLAS PRE-RENDERIZADAS (inclúyelas LITERALMENTE en las secciones indicadas, NO las regeneres):",
      "",
      "ESTRUCTURA OBLIGATORIA DEL INFORME (8 secciones, en este orden EXACTO):",
      "REGLA TRANSVERSAL DE NARRATIVA (PROBLEMA 6): cada sección que contenga una tabla DEBE seguir el patrón:",
      "(1) párrafo interpretativo ANTES de la tabla (2-3 frases que adelanten lo más relevante),",
      "(2) la tabla pre-renderizada copiada LITERALMENTE,",
      "(3) párrafo de conclusión DESPUÉS de la tabla (1-2 frases con la implicación).",
      "Nunca pegues una tabla 'desnuda' sin narrativa antes y después.",
      "",
      "## 1. Contexto General — 4-5 frases que incluyan: (a) posición competitiva (ranking estimado dentro del sector si está disponible en el bloque competitivo), (b) un dato cuantitativo clave (ej. 'la mayor caída fue en SIM, de X a Y'), (c) frase de cierre temporal (ej. 'el período cierra con tendencia descendente tras abrir en un máximo de Z').",
      "## 2. Tabla de KPIs — narrativa breve + tabla [KPI_TABLE] + conclusión (qué KPIs en verde, cuáles en rojo).",
      "## 3. Visión por Modelo de IA — narrativa (qué modelos coinciden más / menos) + tabla [MODEL_BREAKDOWN_TABLE] + conclusión (implicación de la divergencia).",
      "## 4. Evolución Temporal — narrativa de tendencia + tabla [TEMPORAL_EVOLUTION_TABLE] + conclusión (implicaciones).",
      "## 5. Contexto Competitivo — narrativa de posicionamiento + tabla [COMPETITIVE_TABLE] + conclusión (oportunidades).",
      "## 6. Análisis de Métricas — interpretación cualitativa OBLIGATORIA dimensión por dimensión. Para cada KPI crítico (rojo / amarillo): nombre canónico (NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM) + valor + lectura ejecutiva + recomendación específica con target numérico. Ejemplo: 'SIM (37.7) está en nivel crítico. Indica que las fuentes citadas son débiles. Acción: fortalecer presencia en medios Tier 1 y mejorar trazabilidad de datos financieros para llevar SIM por encima de 53.'",
      "## 7. Recomendaciones — primero copia LITERALMENTE el bloque [RECOMMENDATIONS_BLOCK]. A continuación AMPLÍALO con AL MENOS 5 recomendaciones estratégicas adicionales que cumplan TODOS estos criterios:",
      "  (a) ESPECÍFICAS para esta empresa, NO genéricas. Cada una debe citar el nombre de la empresa.",
      "  (b) DEBEN referenciar al menos UN dominio/medio concreto extraído de la sección 'Fuentes citadas' (ej: 'Bloomberg y Reuters ya cubren X, pero El Confidencial tiene cobertura limitada → enviar nota de prensa a El Confidencial').",
      "  (c) DEBEN incluir KPI cuantitativo: valor actual + target numérico + horizonte temporal (ej: 'SIM actual 38.6 → target 52-55 si se consigue cobertura adicional en 3 medios Tier 1 durante el próximo trimestre').",
      "  (d) Priorizadas por impacto real (alto / medio / bajo) basándose en los datos del período.",
      "  (e) Acción concreta: verbo de acción + entregable + plazo (ej: 'publicar dossier ESG auditado en Q2 2026').",
      "## 8. Fuentes citadas por los modelos de IA — escribe SOLO un párrafo introductorio (2-3 frases) usando los totales del 'Resumen de fuentes citadas' que aparece más abajo (cuántas URLs únicas, cuántos medios, qué dominios dominan). Termina la sección con la línea EXACTA `<!--CITED_SOURCES_HERE-->` en su propia línea y NADA más después. NO intentes listar las URLs individuales: el sistema sustituirá ese marcador por la bibliografía completa con badges, dominios y enlaces clicables. Si listas URLs manualmente, serán eliminadas.",
      "## 9. Ficha Metodológica — período (declarando solicitado vs disponible si difieren), modelos usados, observaciones, divergencia inter-modelo (incluye [DIVERGENCE_BLOCK]).",
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
  // PROBLEMA 1 (regresión) — divergence inversion: previously low range
  // returned "alto" which caused the FE Methodology Footer to render
  // "No calculable" via the unknown fallback. Now we use the same canonical
  // divergenceStats helper as section 8 so header / footer / FE all agree.
  const div = computeDivergenceStats(datapack.raw_rows);
  // Map to the EN enum the FE expects (low/medium/high). Skill metadata used
  // to ship Spanish strings, which the FE silently mapped to "unknown" →
  // "No calculable". The orchestrator does an additional ES→EN safety net
  // (see orchestrator.ts methodology mapping) so any skill that still ships
  // Spanish keeps working.
  const divergence_level = div.models_count === 0
    ? "unknown"
    : div.level === "alta" ? "high" : div.level === "media" ? "medium" : "low";
  return {
    models_used: datapack.models_coverage.with_data.join(","),
    period_from: datapack.temporal.from,
    period_to: datapack.temporal.to,
    observations_count: observations,
    divergence_level,
    divergence_points: Math.round(div.sigma * 10) / 10,
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
    // Cited sources (real URLs from the 8 raw-response columns). Pre-rendered
    // as a markdown block; also returned structurally so the FE can show it
    // in the HTML export with clickable <a> tags.
    const citedSourcesReport = extractCitedSources(datapack.raw_rows);
    const citedSourcesFull = renderCitedSourcesBlock(
      citedSourcesReport,
      datapack.temporal.from,
      datapack.temporal.to,
    );
    // Compact summary that REPLACES the heavy block in the prompt. The full
    // bibliography is appended to the LLM's output AFTER streaming ends.
    const citedSourcesSummary = buildCitedSourcesSummary(citedSourcesReport);
    console.log(`${tag} enrichment done in ${Date.now() - t0}ms`);

    // 1c. Append the new blocks (in canonical order) AFTER the existing
    //     pre-rendered tables (KPI table is already in datapack.pre_rendered_tables[0]).
    const enrichedTables = [
      ...datapack.pre_rendered_tables,
      modelBreakdown,
      temporalEvo,
      competitiveTable,
      recommendations,
      citedSourcesSummary,
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