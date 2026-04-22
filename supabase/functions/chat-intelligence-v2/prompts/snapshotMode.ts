// Agente Rix v2 — reglas mode=snapshot (single week)
// Extraído literal de chat-intelligence/index.ts líneas 6978-6981 (snapshots semanales),
// 6998-7000 (cabecera de una sola semana) y 7014-7020 (deltas vs semana anterior).
// Constraint: max 40 LOC.

export interface SnapshotPromptInput {
  weekFromISO: string;  // period_from de la semana
  weekToISO: string;    // period_to de la semana
}

export function buildSnapshotRules(input: SnapshotPromptInput): string {
  const { weekFromISO, weekToISO } = input;
  return `MODO SNAPSHOT (mode=snapshot, una sola semana):

• Snapshot semanal del barrido dominical. Cada empresa se evalúa por 6 modelos de IA.
• Si hay <4 modelos en este snapshot, declara "snapshot incompleto" y continúa con los disponibles.
• Cabecera del informe: "Semana ${weekFromISO} – ${weekToISO}" (UNA semana, NO un rango más amplio).
• La sección de Cierre/Metodología DEBE repetir exactamente estas mismas fechas.

DATO PUNTUAL + DELTA vs SEMANA ANTERIOR:
• Para cada métrica muestra el VALOR de esta semana y, cuando exista, el delta vs la semana previa.
• Si has_delta=true: muéstralo numérico ("+3", "-5"). Si no, "-" o "n/d". NUNCA inventes.
• PROHIBIDO presentar agregados multi-semana (mean/min/max) en mode=snapshot;
  los datos son de UN solo corte temporal.`;
}