// Agente Rix v2 — reglas de cobertura y validación metodológica
// Extraído literal de chat-intelligence/index.ts líneas 6902-6907 (REGLA #1.B
// MODELS_COVERAGE) y 6927-6932 + 7066-7078 (DIVERGENCIAS y CONSENSO INTERMODELO).
// Constraint: max 60 LOC.

export interface CoverageRulesInput {
  requested: string[];        // modelos pedidos
  withData: string[];         // modelos con datos reales
  missing: string[];          // modelos sin datos
  snapshotsExpected: number;
  snapshotsAvailable: number;
  coverageRatio: number;      // 0..1
  isPartial: boolean;
  /** Snapshot puntual (from===to) ⇒ "modelos" en lugar de "snapshots". */
  isSnapshot?: boolean;
}

export function buildCoverageRules(input: CoverageRulesInput): string {
  const { requested, withData, missing, snapshotsExpected, snapshotsAvailable, coverageRatio, isPartial, isSnapshot } = input;
  const unit = isSnapshot ? "modelos" : "snapshots";
  const scope = isSnapshot ? "modelos disponibles en este snapshot" : "semanas y modelos efectivamente disponibles";
  const partialNotice = isPartial
    ? `\nCOBERTURA PARCIAL DETECTADA (${snapshotsAvailable}/${snapshotsExpected} ${unit}, ratio ${(coverageRatio * 100).toFixed(0)}%):
• Declara explícitamente al inicio del informe que la cobertura es parcial.
• Acota las conclusiones a los ${scope}.
• PROHIBIDO extrapolar tendencias a ${isSnapshot ? "modelos no incluidos" : "semanas no cubiertas"}.`
    : `\nCOBERTURA COMPLETA: ${snapshotsAvailable}/${snapshotsExpected} ${unit} disponibles. PROHIBIDO afirmar que faltan modelos cuando los 6 respondieron.`;

  return `COBERTURA DE MODELOS (PRIORIDAD MÁXIMA, ANTI-ALUCINACIÓN):
• Modelos solicitados: [${requested.join(", ") || "(ninguno)"}]
• Modelos con datos: [${withData.join(", ") || "(ninguno)"}]
• Modelos sin datos: [${missing.join(", ") || "(ninguno)"}]

• Usa EXACTAMENTE esos arrays. NO inventes presencia ni ausencia de modelos.
• NUNCA digas que un modelo "no ha emitido puntuaciones" si aparece en "con datos".
• Si un modelo aparece en "sin datos", indícalo de forma neutra UNA sola vez
  ("Sin datos de X en este corte temporal") y continúa con los disponibles.
• Si "solicitados" tiene <6 modelos (filtro), CÉÑETE a esos. NO menciones los otros.

CONSENSO INTERMODELO (formato obligatorio):
• NUNCA uses "RIX mediano", "mediana" ni "±X intermodelo".
• Para cada empresa muestra SIEMPRE los 6 scores individuales: ChatGPT, Gemini, Perplexity, DeepSeek, Grok, Qwen.
• Incertidumbre = RANGO (max - min) + NIVEL DE CONSENSO:
  - Consenso Alto: rango < 10 → las IAs coinciden → dato muy fiable
  - Consenso Medio: rango 10-20 → divergencia moderada → requiere matices
  - Consenso Bajo: rango > 20 → fuerte desacuerdo → analizar por qué divergen
• Formato titular: "RIX: 48-69 (Consenso Medio, Bloque Mayoritario 63)".
• El BLOQUE MAYORITARIO = media de los modelos dentro de ±5 puntos entre sí.

DIVERGENCIAS (OBLIGATORIO):
• Consenso alto (rango < 10): "Las seis IAs coinciden en que [empresa] tiene un [métrica] sólido de [valor]".
• Consenso bajo (rango > 20): "Existe divergencia significativa: [modelo_max] otorga [valor_max] mientras [modelo_min] da [valor_min]".
• Prioriza divergencias en RIX y métricas con mayor rango. NUNCA las ignores.${partialNotice}

FICHA DE VALIDACIÓN METODOLÓGICA:
• Cierre del informe debe declarar: número de modelos efectivamente usados,
  número de snapshots y rango temporal exacto del DataPack.`;
}