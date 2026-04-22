// chat-intelligence-v2 / parsers / modelParser.ts
// Thin wrapper around _shared/modelsEnum.ts. Max 150 LOC.
import {
  extractModelNames,
  parseModelsWithNegation,
  MODEL_ENUM,
  type ModelName as SharedModelName,
} from "../../_shared/modelsEnum.ts";
import { MODEL_NAMES, type ModelName } from "../types.ts";

/**
 * The shared enum stores "Google Gemini" while the v2 spec uses
 * "Gemini" as the canonical short label. This adapter normalises.
 */
function toV2(name: SharedModelName): ModelName {
  if (name === "Google Gemini") return "Gemini";
  return name as ModelName;
}

export function parseModels(question: string): ModelName[] {
  if (!question || !question.trim()) return [];
  const shared = extractModelNames(question);
  const mapped = shared.map(toV2).filter((n): n is ModelName => MODEL_NAMES.includes(n as ModelName));
  return mapped;
}

/**
 * Returns the full canonical enum (used as default when the user did
 * not mention any specific model).
 */
export function allModels(): ModelName[] {
  return MODEL_ENUM.map(toV2).filter((n): n is ModelName => MODEL_NAMES.includes(n as ModelName));
}

/**
 * Re-export the rich parser for skills that need negation/group info.
 */
export function parseModelsRich(question: string) {
  return parseModelsWithNegation(question);
}

export const __test__ = { toV2 };