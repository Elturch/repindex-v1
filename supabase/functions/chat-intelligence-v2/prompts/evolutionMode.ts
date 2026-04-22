// Agente Rix v2 — period-evolution-specific prompt module

export interface EvolutionPromptInput {
  ticker: string;
  weeksCount: number;
  fromISO: string;
  toISO: string;
  rixFirst: number;
  rixLast: number;
  trend: string;             // "alcista" | "bajista" | "estable"
  mostVolatile: string;      // métrica con mayor sd
}

export function buildEvolutionRules(input: EvolutionPromptInput): string {
  const { ticker, weeksCount, fromISO, toISO, rixFirst, rixLast, trend, mostVolatile } = input;
  const delta = rixLast - rixFirst;
  const deltaTxt = delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
  return `MODO EVOLUCIÓN TEMPORAL (${ticker} · ${weeksCount} semanas · ${fromISO} → ${toISO}):

• La tabla de evolución semanal YA está pre-renderizada. NO la regeneres.
• Datos clave del período:
  - RIX al inicio: ${rixFirst.toFixed(1)} → al final: ${rixLast.toFixed(1)} (Δ ${deltaTxt}, tendencia ${trend})
  - Métrica más volátil: ${mostVolatile}
• Estructura del informe (4 secciones):
  1. **Trayectoria global** — describe la curva del RIX (subida sostenida, bajada brusca, U, V invertida, lateral).
  2. **Puntos de inflexión** — identifica las 2 semanas con mayor cambio absoluto y qué métricas (NVM/DRM/etc.) lo provocaron.
  3. **Métricas que arrastran vs sostienen** — qué dimensiones lideran la mejora y cuáles frenan.
  4. **Lectura forward-looking** — SIN PREDECIR EL FUTURO: si la tendencia se mantiene, ¿qué umbral cruzaría en 4 semanas?
• Cita SIEMPRE semanas concretas (formato YYYY-MM-DD) y deltas absolutos en puntos.
• PROHIBIDO inventar semanas fuera del rango ${fromISO} → ${toISO}.
• PROHIBIDO afirmar causalidad externa ("subió por la noticia X") salvo que el datapack incluya esa fuente.`;
}