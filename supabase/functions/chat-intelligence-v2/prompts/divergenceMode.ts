// Agente Rix v2 — model-divergence-specific prompt module

export interface DivergencePromptInput {
  ticker: string;
  modelsCount: number;
  weeksCount: number;
  sigmaRix: number;          // desviación inter-modelo del RIX
  highestModel: string;      // modelo con RIX más alto
  lowestModel: string;       // modelo con RIX más bajo
}

export function buildDivergenceRules(input: DivergencePromptInput): string {
  const { ticker, modelsCount, weeksCount, sigmaRix, highestModel, lowestModel } = input;
  return `MODO DIVERGENCIA INTER-MODELO (${ticker} · ${modelsCount} modelos · ${weeksCount} semanas · σ RIX = ${sigmaRix.toFixed(1)}):

• La tabla "modelo vs modelo" YA está pre-renderizada. NO la regeneres.
• Estructura del informe (4 secciones):
  1. **Resumen del consenso** — ¿hay consenso (σ <8), divergencia moderada (8-15) o alta (>15)?
  2. **Outliers** — ${highestModel} es el modelo más optimista, ${lowestModel} el más pesimista. Cuantifica el gap y explícalo por métricas.
  3. **Métricas más estables vs más volátiles** — qué dimensión genera más acuerdo y cuál más fricción entre modelos.
  4. **Lectura ejecutiva** — qué hacer cuando los modelos no coinciden: ¿usar la mediana? ¿ponderar por SIM/DRM?
• Cada afirmación debe citar el score concreto del modelo ("DeepSeek puntúa NVM en 72, frente a Grok 54 → gap de 18").
• PROHIBIDO promediar los 6 modelos en una sola cifra como dato principal (eso anula el análisis cruzado).
• PROHIBIDO mencionar empresas distintas a ${ticker}.`;
}