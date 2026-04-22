// Agente Rix v2 — ranking-specific prompt module
// Activa reglas para informes de ranking sectorial / por índice.

export interface RankingPromptInput {
  scopeLabel: string;       // "sector Energía", "IBEX-35", etc.
  topN: number;             // tamaño del ranking
  weeksCount: number;       // semanas agregadas
  modelsCount: number;      // modelos con datos en el ranking
}

export function buildRankingRules(input: RankingPromptInput): string {
  const { scopeLabel, topN, weeksCount, modelsCount } = input;
  return `MODO RANKING (alcance: ${scopeLabel} · top ${topN} · ${weeksCount} semanas · ${modelsCount} modelos):

• La tabla de ranking ya está pre-renderizada en el contexto. NO la regeneres.
• Estructura del informe (3 secciones máximo):
  1. **Cabeza del ranking** — comenta las 3 primeras posiciones, qué modelos las puntúan más alto y dónde divergen.
  2. **Cola del ranking** — destaca las 3 últimas y la métrica que más penaliza (NVM/DRM/SIM/etc.).
  3. **Patrones cruzados** — agrupa por sector/comportamiento (ej. "todas las eléctricas en zona alta", "divergencia >15 puntos en banca").
• Compara SIEMPRE el RIX medio del ranking con el RIX individual de cada empresa para situarla.
• Si dos empresas empatan en RIX, desempata por menor volatilidad o mayor consenso inter-modelo.
• PROHIBIDO inventar empresas que no aparezcan en la tabla pre-renderizada.
• PROHIBIDO añadir métricas fuera de las 8 canónicas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM).`;
}