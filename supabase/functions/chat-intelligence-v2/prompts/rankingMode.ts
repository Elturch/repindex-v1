// Agente Rix v2 — ranking-specific prompt module
// Activa reglas para informes de ranking sectorial / por índice.
// El informe debe igualar la profundidad narrativa de companyAnalysis:
// análisis empresa-por-empresa, divergencias, recomendaciones accionables
// y bibliografía con URLs reales (marker <!--CITEDSOURCESHERE-->).

export interface RankingPromptInput {
  scopeLabel: string;       // "sector Energía", "IBEX-35", etc.
  topN: number;             // tamaño del ranking
  weeksCount: number;       // semanas agregadas (o modelos respondidos en snapshot puntual)
  modelsCount: number;      // modelos con datos en el ranking
  /** Snapshot puntual (from===to): weeksCount es en realidad #modelos del snapshot. */
  isSnapshot?: boolean;
}

export function buildRankingRules(input: RankingPromptInput): string {
  const { scopeLabel, topN, weeksCount, modelsCount, isSnapshot } = input;
  // Snapshot puntual ⇒ describimos un ÚNICO domingo con N modelos respondiendo.
  // Período ⇒ describimos N semanas agregadas con M modelos.
  const periodPhrase = isSnapshot
    ? `1 semana (snapshot puntual) con ${weeksCount}/${modelsCount} modelos respondiendo`
    : `${weeksCount} semanas · ${modelsCount} modelos`;
  const sec1Phrase = isSnapshot
    ? `${topN} empresas, snapshot puntual, ${weeksCount}/${modelsCount} modelos respondiendo`
    : `${topN} empresas, ${weeksCount} semanas, ${modelsCount} modelos`;
  return `MODO RANKING — INFORME COMPLETO DE SECTOR/GRUPO (alcance: ${scopeLabel} · ${topN} empresas · ${periodPhrase}):

OBJETIVO: producir un INFORME EJECUTIVO COMPLETO del sector/grupo, NO un simple comentario del ranking. Profundidad equivalente a un análisis individual, pero abarcando TODAS las empresas del alcance. Mínimo 8 secciones, narrativa rica con cifras concretas.

REGLA TRANSVERSAL DE NARRATIVA: cada sección con tabla DEBE seguir el patrón
(1) párrafo interpretativo ANTES de la tabla, (2) tabla pre-renderizada copiada LITERALMENTE, (3) párrafo de conclusión DESPUÉS. Nunca tablas "desnudas".

ESTRUCTURA OBLIGATORIA (SECCIONES, EN ORDEN EXACTO):

## 1. Resumen ejecutivo del ${scopeLabel}
5-7 frases que incluyan: (a) tamaño del grupo (${sec1Phrase}), (b) RIX **de referencia** del grupo y rango max-min (NUNCA digas "RIX medio del índice/grupo" ni "promedio del consenso" — viola la regla Anti-Mediana), (c) líder y farolillo rojo con sus tickers y RIX, (d) ${isSnapshot ? "lectura del snapshot puntual (NO uses 'tendencia' con 1 sola semana, NO inventes Δ período)" : "tendencia general (alcista/bajista/estable) con dato cuantitativo"}, (e) hallazgo más relevante del ${isSnapshot ? "snapshot" : "período"}.

## 2. Ranking del grupo
Inserta LITERALMENTE el bloque marcado entre <PRE_RENDERED_RANKING_TABLE>...</PRE_RENDERED_RANKING_TABLE> sin modificar NI UNA palabra (ni cabecera, ni filas, ni footnote en cursiva). PROHIBIDO: regenerar la tabla, reescribir el footnote, sustituir "RIX rango" por "RIX medio", añadir la palabra "HOY" o "promedio del consenso", o inventar fechas de cálculo. Antes de la tabla: 1 párrafo de lectura ("la cabeza la ocupa X con Y, mientras la cola la cierra Z..."). Después de la tabla: 1 párrafo destacando el spread RIX max-min y el bloque mayoritario. El footnote ya viene incluido dentro del bloque pre-renderizado: NO lo dupliques ni lo reescribas.

## 3. Análisis empresa por empresa (CRÍTICO — sección más extensa)
Para CADA UNA de las ${topN} empresas del ranking, redacta un mini-perfil de 4-6 frases con esta estructura fija:
- **Empresa (TICKER) — RIX X.X (posición #N de ${topN})**
- Lectura por modelos: qué modelos la valoran más alto / más bajo y diferencia (ej. "ChatGPT 72 vs Grok 48, divergencia 24 puntos").
- Métrica más fuerte y más débil (de las 8 canónicas) con valor concreto.
- Una observación cualitativa concreta extraída de las fuentes citadas (cita el medio: "según Expansión...", "Bloomberg destaca...").
- Implicación reputacional para esa empresa en este sector.
NO te saltes ninguna empresa. Si hay 6 empresas, hay 6 mini-perfiles.

## 4. Visión por modelo de IA
Redacta 4-6 frases analizando, a partir de los datos brutos del DataPack (puntuaciones por modelo de cada empresa), qué modelo es más optimista y cuál más pesimista en este alcance, con cifras concretas (ej. "Gemini promedia 68 vs Grok 52, gap de 16 pts"). Explica por qué la divergencia importa para la lectura del sector (sesgo de fuentes, cobertura, ponderación de métricas). NO inventes una tabla pre-renderizada: trabaja con los valores ya disponibles en el contexto.

## 5. Tendencias del sector / grupo
Redacta 6-10 frases sobre la evolución temporal del grupo usando los deltas y series semanales presentes en el DataPack. En la prosa NUNCA uses la palabra 'snapshots'; di 'semanas observadas'. Identifica: (a) empresas con tendencia alcista clara, (b) empresas en deterioro, (c) métricas que mejoran o empeoran transversalmente en el grupo. Cifras obligatorias (delta_period con signo y magnitud por empresa relevante). Si procede, construye una pequeña tabla markdown propia con columnas Empresa | RIX inicio | RIX fin | Δ período, limitada a las empresas con movimiento más significativo.

## 6. Divergencias inter-modelo
A partir de las puntuaciones por modelo del DataPack, identifica las 3 empresas con MAYOR rango (max-min) y explica POR QUÉ los modelos disienten (sesgo de fuentes, tipo de cobertura). Las divergencias > 20 pts deben listarse explícitamente con la cifra exacta y los modelos extremos (ej. "ENG: ChatGPT 78 vs Qwen 51, rango 27"). Cierra con 1 frase sobre qué dimensión (NVM/SIM/DRM/RMM/CEM/GAM/DCM) concentra más desacuerdo en el grupo.

## 7. Recomendaciones estratégicas accionables (MÍNIMO 5, ESPECÍFICAS POR EMPRESA)
Genera AL MENOS 5 recomendaciones que cumplan TODOS los criterios:
(a) ESPECÍFICA para una empresa concreta del ranking (cita ticker y nombre).
(b) Referencia un medio/dominio concreto extraído de las URLs citadas (ej. "El Confidencial cubre poco a HMH → enviar dossier a su sección de salud").
(c) Incluye KPI cuantitativo: métrica + valor actual + target + horizonte (ej. "SIM 38 → target 52 en Q2 2026 vía 3 medios Tier 1").
(d) Verbo de acción + entregable + plazo.
(e) Prioridad explícita (alta/media/baja) según impacto.
Distribuye las recomendaciones cubriendo idealmente todas las empresas del alcance, no solo el líder.

## 8. Fuentes citadas por los modelos de IA
Escribe SOLO 2-3 frases introductorias usando los totales del 'Resumen de fuentes citadas' (cuántas URLs únicas, cuántos medios, dominios dominantes). Termina la sección con la línea EXACTA \`<!--CITEDSOURCESHERE-->\` en su propia línea y NADA más después. NO listes URLs manualmente: el sistema sustituirá ese marcador por la bibliografía completa con badges, dominios y enlaces clicables. Si listas URLs a mano serán eliminadas.

## 9. Ficha metodológica
Período (declarando solicitado vs disponible si difieren), número de modelos efectivamente usados, observaciones totales, semanas únicas, divergencia inter-modelo (σ).

REGLAS DE CITAS Y FUENTES:
• En las secciones 3 y 7 DEBES citar URLs/medios reales que aparezcan en las respuestas brutas (campo "FUENTES DISPONIBLES POR EMPRESA" del mensaje de usuario). Cita por dominio (ej. "según expansion.com").
• PROHIBIDO inventar nombres de medios o URLs.
• PROHIBIDO inventar empresas que no aparezcan en la tabla pre-renderizada.
• PROHIBIDO añadir métricas fuera de las 8 canónicas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM).
• Si dos empresas empatan en RIX, desempata por menor volatilidad o mayor consenso inter-modelo.
• Compara SIEMPRE el RIX individual de cada empresa con el **rango** RIX del grupo (max-min) para situarla. Está PROHIBIDO usar "RIX medio del grupo/índice" o "promedio del consenso" en cualquier sección — siempre describe el grupo por su rango y por la posición relativa de cada empresa, nunca por una media consolidada.`;
}