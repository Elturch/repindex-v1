// Agente Rix v2 — comparison-specific prompt module
// Activa reglas para informes de comparación entre 2+ empresas.

export interface ComparisonPromptInput {
  entitiesLabel: string;    // "ACS vs FCC"
  weeksCount: number;
  modelsWithData: string[]; // modelos que tienen datos para AMBAS empresas
}

export function buildComparisonRules(input: ComparisonPromptInput): string {
  const { entitiesLabel, weeksCount, modelsWithData } = input;
  const modelsLine = modelsWithData.length > 0 ? modelsWithData.join(", ") : "(ninguno común)";
  return `MODO COMPARACIÓN (${entitiesLabel} · ${weeksCount} semanas · modelos comunes: ${modelsLine}):

• La tabla comparativa lado-a-lado YA está pre-renderizada. NO la regeneres.
• Estructura del informe (4 bloques):
  1. **Veredicto en una frase** — quién lidera el RIX y por qué (delta concreto en puntos).
  2. **Métrica por métrica** — para cada una de las 8: qué empresa puntúa más alto, qué modelo lo respalda, magnitud del gap.
  3. **Convergencias** — métricas en las que ambas empresas coinciden (gap <5 puntos).
  4. **Asimetrías clave** — métricas con gap >15 puntos: explica el porqué con la evidencia disponible.
• Si una empresa carece de datos en un modelo que la otra sí tiene, dilo explícitamente ("FCC sin cobertura en Grok").
• PROHIBIDO comparar contra una tercera empresa que no esté en el datapack.
• Cierre: una recomendación accionable por empresa basada en su métrica más débil.`;
}