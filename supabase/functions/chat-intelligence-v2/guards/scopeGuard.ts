// chat-intelligence-v2 / guards / scopeGuard.ts
// Validates that the resolved entity belongs to the Spanish RepIndex universe
// and that the question does not target a foreign subsidiary. Max 100 LOC.
import type { ResolvedEntity } from "../types.ts";
import { detectForeignQualifier } from "../../_shared/inputValidator.ts";

export interface ScopeResult {
  pass: boolean;
  reply?: string;
}

/**
 * Pure-ish guard. Does NOT hit Supabase: entity resolution + suggestions
 * already happened in entityResolver. We only check:
 *   1. entity is null AND the question looks like it targets a company →
 *      reject with "no encuentro esa empresa".
 *   2. entity exists BUT the question carries a foreign qualifier
 *      (Germany, Brasil, USA…) → reject with scope explanation, suggesting
 *      the Spanish parent we DO have.
 *   3. Otherwise → pass.
 */
export function checkScope(
  entity: ResolvedEntity | null,
  question: string,
): ScopeResult {
  const q = (question ?? "").trim();
  const foreign = detectForeignQualifier(q);

  if (!entity) {
    // If the question mentions a foreign country and we couldn't even resolve
    // the parent, give a generic scope message.
    if (foreign) {
      return {
        pass: false,
        reply:
          `Esta versi\u00f3n de RepIndex cubre exclusivamente el \u00e1mbito espa\u00f1ol. ` +
          `No dispongo de datos para empresas de \u00e1mbito "${prettifyForeign(foreign)}". ` +
          `\u00bfQuieres que analice la matriz espa\u00f1ola si existe?`,
      };
    }
    return {
      pass: false,
      reply:
        "No encuentro esa empresa en el universo RepIndex. " +
        "Trabajo con cotizadas espa\u00f1olas (IBEX-35 y mercado continuo). " +
        "\u00bfPuedes indicarme el ticker o el nombre completo de la compa\u00f1\u00eda?",
    };
  }

  // Entity resolved BUT question still carries a foreign qualifier:
  // entityResolver.semanticBridge / fuzzy may have brought back the parent
  // without flagging the foreign branch. Reject with parent suggestion.
  if (foreign) {
    return {
      pass: false,
      reply:
        `Esta versi\u00f3n de RepIndex cubre exclusivamente el \u00e1mbito espa\u00f1ol. ` +
        `Dispongo de datos de ${entity.company_name} (${entity.ticker}, matriz espa\u00f1ola). ` +
        `\u00bfQuieres que la analice en su lugar?`,
    };
  }

  return { pass: true };
}

function prettifyForeign(token: string): string {
  if (!token) return token;
  if (token.length <= 3) return token.toUpperCase();
  return token[0].toUpperCase() + token.slice(1);
}

export const __test__ = { prettifyForeign };