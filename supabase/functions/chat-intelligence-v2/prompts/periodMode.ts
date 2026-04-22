// Agente Rix v2 — reglas mode=period (multi-week)
// Extraído literal de chat-intelligence/index.ts líneas 6982-7005 (DOCTRINA TEMPORAL,
// REGLA DE CABECERA) y 7014-7020 (DELTAS SEMANALES).
// Constraint: max 60 LOC.

export interface PeriodPromptInput {
  fromISO: string;          // period_from real del DataPack
  toISO: string;            // period_to real del DataPack
  weeksCount: number;       // semanas reales en el DataPack
  requestedLabel?: string;  // etiqueta original ("últimas 4 semanas", "Q1 2026", ...)
}

export function buildPeriodRules(input: PeriodPromptInput): string {
  const { fromISO, toISO, weeksCount, requestedLabel } = input;
  const labelLine = requestedLabel
    ? `Etiqueta solicitada por el usuario: "${requestedLabel}".`
    : "";

  return `MODO PERÍODO (mode=period, ${weeksCount} semanas en el DataPack):

DOCTRINA TEMPORAL (INQUEBRANTABLE):
• Los snapshots son SEMANALES, ejecutados siempre en domingo. Cada barrido cubre
  la semana completa anterior (domingo → sábado, 7 días).
• Período analizado = period_from del barrido más antiguo → period_to del más reciente.
• "Semana evaluada" = la del barrido más reciente.
• NUNCA inventes rangos de fechas. USA SIEMPRE las fechas reales del DataPack.

CABECERA DEL INFORME (INQUEBRANTABLE):
• La cabecera DEBE mostrar EXACTAMENTE: "${fromISO} – ${toISO}" (${weeksCount} semanas).
• PROHIBIDO calcular fechas hacia atrás desde la fecha actual.
• PROHIBIDO mostrar "4 semanas" ni "último mes" si el rango real no lo respalda.
• La Sección de Cierre/Metodología DEBE repetir EXACTAMENTE estas mismas fechas.
${labelLine}

AGREGACIÓN MULTI-SEMANA (mode=period):
• Para cada métrica usa los agregados del DataPack: mean, first_week, last_week, delta_period, trend.
• PROHIBIDO presentar el valor de la última semana como "el dato" del período.
  Sí puedes citarlo como "última lectura" pero el dato principal es la media del período.
• Muestra evolución: first_week → last_week (delta_period). Indica trend (alcista/bajista/estable).
• Si una métrica tiene volatility alta, decláralo ("oscila entre min y max").
• Tabla de evolución semanal: una fila por semana con los 6 scores o, si no caben, Rango y Consenso.

DELTAS SEMANALES (INQUEBRANTABLE):
• Si has_delta=true para una métrica, MUESTRA su delta numérico (ej. "+3", "-5").
• Si has_delta=false o delta=null, muestra "-" o "n/d". NUNCA inventes un número.
• PROHIBIDO mostrar delta con asterisco o nota al pie diciendo que "no hay histórico".
  Si no hay datos, simplemente NO lo muestres.`;
}