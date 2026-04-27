// Agente Rix v2 — ranking-specific prompt module
// Activa reglas para informes de ranking sectorial / por índice.
// El informe debe igualar la profundidad narrativa de companyAnalysis:
// análisis empresa-por-empresa, divergencias, recomendaciones accionables
// y bibliografía con URLs reales (marker <!--CITEDSOURCESHERE-->).

export interface RankingPromptInput {
  scopeLabel: string;       // "sector Energía", "IBEX-35", etc.
  topN: number;             // tamaño del ranking
  weeksCount: number;       // semanas agregadas
  modelsCount: number;      // modelos con datos en el ranking
}

export function buildRankingRules(input: RankingPromptInput): string {
  const { scopeLabel, topN, weeksCount, modelsCount } = input;
  return `MODO RANKING — INFORME COMPLETO DE SECTOR/GRUPO (alcance: ${scopeLabel} · ${topN} empresas · ${weeksCount} semanas · ${modelsCount} modelos):

OBJETIVO: producir un INFORME EJECUTIVO COMPLETO del sector/grupo, NO un simple comentario del ranking. Profundidad equivalente a un análisis individual, pero abarcando TODAS las empresas del alcance. Mínimo 8 secciones, narrativa rica con cifras concretas.

REGLA TRANSVERSAL DE NARRATIVA: cada sección con tabla DEBE seguir el patrón
(1) párrafo interpretativo ANTES de la tabla, (2) tabla pre-renderizada copiada LITERALMENTE, (3) párrafo de conclusión DESPUÉS. Nunca tablas "desnudas".

ESTRUCTURA OBLIGATORIA (SECCIONES, EN ORDEN EXACTO):

## 1. Resumen ejecutivo del ${scopeLabel}
5-7 frases que incluyan: (a) tamaño del grupo (${topN} empresas, ${weeksCount} semanas, ${modelsCount} modelos), (b) RIX medio del grupo y rango (max-min), (c) líder y farolillo rojo con sus tickers y RIX, (d) tendencia general (alcista/bajista/estable) con dato cuantitativo, (e) hallazgo más relevante del período.

## 2. Ranking del grupo
Inserta literalmente la tabla pre-renderizada de ranking. Antes: 1 párrafo de lectura ("la cabeza la ocupa X con Y, mientras la cola la cierra Z..."). Después: 1 párrafo destacando el spread RIX max-min y el bloque mayoritario.

## 3. Análisis empresa por empresa (CRÍTICO — sección más extensa)
Para CADA UNA de las ${topN} empresas del ranking, redacta un mini-perfil de 4-6 frases con esta estructura fija:
- **Empresa (TICKER) — RIX X.X (posición #N de ${topN})**
- Lectura por modelos: qué modelos la valoran más alto / más bajo y diferencia (ej. "ChatGPT 72 vs Grok 48, divergencia 24 puntos").
- Métrica más fuerte y más débil (de las 8 canónicas) con valor concreto.
- Una observación cualitativa concreta extraída de las fuentes citadas (cita el medio: "según Expansión...", "Bloomberg destaca...").
- Implicación reputacional para esa empresa en este sector.
NO te saltes ninguna empresa. Si hay 6 empresas, hay 6 mini-perfiles.

## 4. Visión por modelo de IA
Inserta literalmente el bloque [MODEL_BREAKDOWN_TABLE] del DataPack. Comenta qué modelo es más optimista/pesimista en este alcance y por qué la divergencia importa para la lectura del sector.

## 5. Tendencias del sector / grupo
Inserta literalmente la tabla [TEMPORAL_EVOLUTION_TABLE] COPIANDO TODAS SUS FILAS sin excepción (no resumas, no abrevies con '...', no recortes el final aunque haya muchas semanas). PROHIBIDO truncar, abreviar con '...' o resumir filas: la tabla debe aparecer íntegra tal como se entrega pre-renderizada. En la prosa NUNCA uses la palabra 'snapshots'; di 'semanas observadas'. Identifica: (a) empresas con tendencia alcista clara, (b) empresas en deterioro, (c) métricas que mejoran o empeoran transversalmente en el grupo. Cifras obligatorias (delta_period).

## 6. Divergencias inter-modelo
Inserta literalmente el bloque [DIVERGENCE_BLOCK]. Identifica las 3 empresas con MAYOR rango (max-min) y explica POR QUÉ los modelos disienten (sesgo de fuentes, tipo de cobertura). Las divergencias > 20 pts deben listarse explícitamente.

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
• Compara SIEMPRE el RIX individual de cada empresa con el RIX medio del grupo para situarla.`;
}