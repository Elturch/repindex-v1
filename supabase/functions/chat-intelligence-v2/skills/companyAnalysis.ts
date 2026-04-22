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
    ? "TABLAS PRE-RENDERIZADAS (úsalas literalmente, NO las regeneres):\n\n" +
      datapack.pre_rendered_tables.join("\n\n")
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

/**
 * Llama a OpenAI Chat Completions (no-stream). El index.ts hace el SSE-chunking
 * sobre el resultado completo, así que aquí basta una llamada simple.
 * Modelo extraído de v1 (línea 4744 / 4749): "o3" con reasoning_effort=medium,
 * fallback a "gpt-4o-mini" si no hay clave de o3.
 */
async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  logPrefix: string,
): Promise<{ content: string; error?: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      content: "",
      error: "OPENAI_API_KEY no configurada en el entorno de la edge function.",
    };
  }

  const model = "gpt-4o-mini"; // modelo rápido y barato para skeleton v2
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    console.log(`${logPrefix} OpenAI call | model=${model} | prompt_chars=${systemPrompt.length}`);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`${logPrefix} OpenAI error ${resp.status}:`, txt.slice(0, 500));
      return { content: "", error: `OpenAI ${resp.status}` };
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    return { content };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const msg = e?.name === "AbortError" ? "OpenAI timeout (90s)" : e?.message ?? "Unknown OpenAI error";
    console.error(`${logPrefix} OpenAI exception:`, msg);
    return { content: "", error: msg };
  }
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
    const { parsed, supabase, logPrefix } = input;
    const tag = `${logPrefix}[companyAnalysis]`;

    // 1. Build the real DataPack from Supabase
    const { datapack, observations_count } = await buildDataPack(supabase, parsed);
    console.log(
      `${tag} datapack ready | obs=${observations_count} | models_with_data=${datapack.models_coverage.with_data.length}`,
    );

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
      return {
        datapack: {
          ...datapack,
          pre_rendered_tables: [
            ...datapack.pre_rendered_tables,
            buildFallbackContent(datapack, undefined),
          ],
        },
        prompt_modules: modules,
        metadata,
      };
    }

    // 4. Compose system prompt + user message
    const systemPrompt = composePrompt(modules, datapack, parsed.temporal.from, parsed.temporal.to);
    const userMessage = buildUserMessage(parsed.raw_question, datapack);

    // 5. Call the LLM (graceful fallback to pre-rendered tables on error)
    const { content, error } = await callOpenAI(systemPrompt, userMessage, tag);
    const finalContent = content && content.trim().length > 0
      ? content
      : buildFallbackContent(datapack, error);

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