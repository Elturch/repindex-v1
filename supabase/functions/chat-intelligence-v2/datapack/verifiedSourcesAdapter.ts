// Agente Rix v2 — VerifiedSources adapter (P0-1)
// Pure function: maps the internal CitedSourcesReport (skill side) to the
// VerifiedSource[] wire shape consumed by the frontend bibliography
// renderer (`generateBibliographyHtml` in src/lib/verifiedSourceExtractor.ts).
//
// Zero-Invention policy: only ChatGPT and Perplexity are treated as
// verifiable sources because they expose real web-search citations.
// URLs cited only by Gemini/DeepSeek/Grok/Qwen/Claude are dropped here
// to mirror the strict frontend filter and avoid leaking unverifiable
// references into the PDF bibliography.
import type { CitedSourcesReport } from "./citedSources.ts";

export interface VerifiedSourceWire {
  url: string;
  domain: string;
  title?: string;
  sourceModel: "ChatGPT" | "Perplexity";
  temporalCategory: "window" | "reinforcement" | "unknown";
  extractedDate?: string;
}

const VERIFIED_MODELS = new Set(["ChatGPT", "Perplexity"]);

function classifyTemporal(
  detectedDate: string | null | undefined,
  periodFrom: string | null | undefined,
  periodTo: string | null | undefined,
): "window" | "reinforcement" | "unknown" {
  if (!detectedDate) return "unknown";
  if (!periodFrom || !periodTo) return "unknown";
  if (detectedDate >= periodFrom && detectedDate <= periodTo) return "window";
  return "reinforcement";
}

export function toVerifiedSources(
  report: CitedSourcesReport | null | undefined,
  periodFrom: string | null | undefined,
  periodTo: string | null | undefined,
): VerifiedSourceWire[] {
  if (!report || !Array.isArray(report.sources) || report.sources.length === 0) {
    return [];
  }
  const out: VerifiedSourceWire[] = [];
  for (const src of report.sources) {
    const verifiedModels = (src.models ?? []).filter((m) => VERIFIED_MODELS.has(m));
    if (verifiedModels.length === 0) continue;
    const temporal = classifyTemporal(src.detectedDate ?? null, periodFrom, periodTo);
    for (const model of verifiedModels) {
      out.push({
        url: src.url,
        domain: src.domain,
        title: src.title ?? undefined,
        sourceModel: model as "ChatGPT" | "Perplexity",
        temporalCategory: temporal,
        extractedDate: src.detectedDate ?? undefined,
      });
    }
  }
  return out;
}