// Agente Rix v2 — Bloque 2: Visión por modelo de IA (max 200 LOC)
// Pre-renderiza una tabla markdown con el RIX medio por modelo en el período.
// Trabaja sobre las raw_rows ya cargadas por builder.ts (no hace SQL extra).
// Constraint #9: las tablas SIEMPRE se pre-renderizan aquí, NUNCA el LLM.
import type { ModelName } from "../types.ts";

const MODEL_NAME_MAP: Array<[string, ModelName]> = [
  ["chatgpt", "ChatGPT"], ["gpt", "ChatGPT"], ["openai", "ChatGPT"],
  ["perplexity", "Perplexity"], ["perp", "Perplexity"],
  ["gemini", "Gemini"], ["google", "Gemini"],
  ["deepseek", "DeepSeek"],
  ["grok", "Grok"], ["xai", "Grok"],
  ["qwen", "Qwen"], ["alibaba", "Qwen"],
];

function normalizeModel(raw: unknown): ModelName | null {
  const s = String(raw ?? "").toLowerCase().trim();
  for (const [k, v] of MODEL_NAME_MAP) if (s.includes(k)) return v;
  return null;
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return (Math.round(n * 10) / 10).toString();
}

function semaforo(score: number): string {
  if (!Number.isFinite(score)) return "⚪";
  if (score >= 70) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

export interface ModelBreakdownRow {
  model: ModelName;
  rix_avg: number;
  rank: number;
  observations: number;
}

/** Compute the per-model breakdown from already-loaded raw rows. */
export function computeModelBreakdown(rows: any[]): ModelBreakdownRow[] {
  const grouped = new Map<ModelName, number[]>();
  for (const r of rows) {
    const m = normalizeModel(r["02_model_name"]);
    if (!m) continue;
    const v = typeof r["09_rix_score"] === "number"
      ? r["09_rix_score"]
      : parseFloat(r["09_rix_score"]);
    if (!Number.isFinite(v)) continue;
    if (!grouped.has(m)) grouped.set(m, []);
    grouped.get(m)!.push(v);
  }
  const out: ModelBreakdownRow[] = [];
  for (const [model, vals] of grouped) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ model, rix_avg: avg, rank: 0, observations: vals.length });
  }
  out.sort((a, b) => b.rix_avg - a.rix_avg);
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

/** Render the model breakdown as a pre-formatted markdown table. */
export function renderModelBreakdownTable(rows: any[]): string {
  const breakdown = computeModelBreakdown(rows);
  if (breakdown.length === 0) return "";
  const body = breakdown
    .map((r) =>
      `| #${r.rank} | ${r.model} | ${semaforo(r.rix_avg)} ${fmt(r.rix_avg)} | ${r.observations} |`,
    )
    .join("\n");
  return [
    "**Visión por modelo de IA — RIX medio del período**",
    "",
    "| Ranking | Modelo | RIX (media) | Filas |",
    "|---|---|---|---|",
    body,
  ].join("\n");
}

export const __test__ = { normalizeModel, fmt, semaforo, computeModelBreakdown };