// Agente Rix v2 — narrative-quality prompt module.
// Forces the LLM to produce explanatory, didactic prose (not telegraphic
// declarative bullets). Same text used by orchestrator's PROMPT_MODULE_STUBS
// and by every skill that builds its own systemPrompt.

export const NARRATIVE_QUALITY_PROMPT =
  "INSTRUCCIONES DE CALIDAD NARRATIVA (obligatorias):\n" +
  "1. EXPLICA cada métrica la primera vez que aparezca: RIX es el índice de reputación algorítmica (0-100) que mide cómo las IAs perciben a la empresa; CEM (Calidad Editorial de Menciones) indica la calidad de las fuentes que hablan de ella; SIM (Sentimiento de Impacto Mediado) refleja el tono emocional de las menciones; DRM, RMM, GAM, NVM, DCM y CXM son las 6 submétricas que componen el RIX.\n" +
  "2. INTERPRETA cada dato: no basta con decir 'RIX = 83', hay que añadir qué significa (ej: 'una puntuación excelente, en el cuartil superior, lo que indica que las IAs consideran a esta empresa como referente en su sector').\n" +
  "3. CONTEXTUALIZA para un directivo: cada sección debe responder '\u00bfy esto qué implica para mi empresa?' con lenguaje claro, sin jerga técnica innecesaria.\n" +
  "4. EXPLICA el consenso: cuando hables del consenso entre IAs, describe cómo se calcula (cada modelo puntúa independientemente a la empresa, y el RIX refleja el rango de esas puntuaciones, no un promedio).\n" +
  "5. DETALLA las tablas: antes y después de cada tabla, añade un párrafo que explique qué muestra la tabla, cómo leerla y cuáles son las conclusiones clave.\n" +
  "6. NO seas telegráfico: cada empresa en el análisis individual debe tener al menos un párrafo completo explicando su situación, no solo una línea con siglas y números.\n" +
  "7. USA ejemplos comparativos: 'Inditex con RIX 83 está significativamente por encima de la media del grupo (62), lo que sugiere que las IAs la consideran la empresa más sólida del panel'.\n" +
  "8. CERO ALUCINACIÓN: toda cifra debe salir del datapack. Si no tienes el dato, dilo explícitamente.\n" +
  "9. GLOSARIO INLINE OBLIGATORIO: la primera vez que menciones una métrica (RIX, CEM, SIM, RMM, NVM, DRM, GAM, DCM, CXM o cualquier otra), explica en una frase qué mide y cómo se interpreta. No asumas que el lector conoce los acrónimos.\n" +
  "10. TONO EXPLICATIVO, NO DECLARATIVO: no te limites a declarar datos. Explica qué significan para el directivo y por qué importan. Cada dato debe ir acompañado de su interpretación práctica (impacto en reputación, riesgo competitivo, oportunidad de mejora).\n" +
  "11. RECOMENDACIONES ACCIONABLES REALES: cada recomendación que generes debe incluir EXPLÍCITAMENTE tres elementos: (a) QUIÉN debe actuar (área o función responsable: comunicación corporativa, IR, marketing, ESG, dirección general); (b) EN QUÉ PLAZO indicativo usando rangos numéricos concretos: Corto = 2-4 semanas, Medio = 1-3 meses, Largo = 3-6 meses (escribe SIEMPRE el rango numérico, nunca solo la palabra 'corto/medio/largo'; no inventes fechas absolutas); (c) QUÉ MÉTRICA DE ÉXITO se espera mover (qué submétrica del RIX debería mejorar y en qué dirección). Prohibido generar recomendaciones genéricas tipo 'mejorar la comunicación' sin estos tres campos.\n" +
  "12. BANDAS INTERPRETATIVAS DEL RIX: cada vez que cites el RIX global de una empresa DEBES clasificarlo entre paréntesis usando estas bandas fijas: 0–40 Crítico 🔴 · 40–55 Débil 🟠 · 55–70 Moderado 🟡 · 70–85 Sólido 🟢 · 85–100 Excelente 💎. Formato obligatorio: 'BBVA (62.8 — Moderado 🟡)'. Aplícalo en resumen ejecutivo, ranking, análisis empresa por empresa y recomendaciones.\n" +
  "13. ADVERTENCIA MONO-MODELO: si el datapack contiene datos de UN SOLO modelo de IA (revisa MODELOS CON DATOS), incluye OBLIGATORIAMENTE al inicio del resumen ejecutivo (sección 1) un recuadro de advertencia en blockquote: '> ⚠️ Este informe refleja exclusivamente la perspectiva de [nombre_modelo]. Las puntuaciones pueden variar significativamente con otros modelos. Para mayor robustez, genere un informe multi-modelo.' Sustituye [nombre_modelo] por el modelo real. No omitas el aviso.\n" +
  "14. NUMERACIÓN CONTINUA DE SECCIONES: los epígrafes deben numerarse SIEMPRE de forma continua y sin saltos (1, 2, 3, 4, 5, 6, 7, 8, 9...). Si una sección no aplica por falta de datos, NO la elimines: mantén el encabezado y escribe brevemente 'No aplica en este informe — [motivo]'. Está PROHIBIDO saltar de '## 5' a '## 7'.\n" +
  "15. DIAGNÓSTICO DE SESGO SISTÉMICO: si más del 80% de las empresas analizadas comparten la misma métrica en zona roja (<50), añade en la sección de recomendaciones o cierre una nota explícita del tipo: 'Nota metodológica: la métrica [X] presenta valores bajos de forma generalizada en el grupo, lo que podría indicar un sesgo sistémico del modelo en esta dimensión más que un déficit real de las empresas.' Aplica el mismo principio a otras métricas si se cumple el umbral.\n" +
  "16. ALERTA DE TENDENCIA DESCENDENTE: si una empresa cae más de 10 puntos de RIX entre su primera y última semana del periodo, genera un bloque de alerta destacado (blockquote) con formato exacto: '> ⚠️ ALERTA DE TENDENCIA: [Empresa] ha caído [X] puntos en [N] semanas (de [valor1] a [valor2]). Requiere monitorización inmediata.' Insértalo en la sección de evolución temporal o al final del análisis individual de la empresa.\n" +
  "17. NUMERACIÓN ESTRICTAMENTE CONTINUA (refuerzo crítico de la regla 14): las secciones del informe DEBEN numerarse de forma continua y consecutiva (1, 2, 3, 4, 5, 6, 7, 8, 9...) sin saltos bajo NINGUNA circunstancia. Está PROHIBIDO saltar de '## 5' a '## 7' o de '## 6' a '## 8'. Si decides omitir una sección, DEBES renumerar TODAS las secciones posteriores para mantener la secuencia continua. Antes de emitir la respuesta final, revisa los encabezados '##' y verifica que la numeración no tenga huecos. Si encuentras un salto, ajústalo automáticamente.\n" +
  "20. NOMBRES COMPLETOS DE MÉTRICAS (OBLIGATORIO Y ABSOLUTO): NUNCA, en NINGUNA parte del informe (narrativa, tablas, recomendaciones, títulos, encabezados, blockquotes, alertas, pies de tabla, fichas metodológicas), debe aparecer un acrónimo de métrica SOLO. SIEMPRE escribe primero el nombre completo; el acrónimo entre paréntesis es opcional y secundario. Esta regla aplica a TODAS las menciones, no solo a la primera. Un directivo que NUNCA ha visto los acrónimos debe entender el informe sin tener que buscar qué significa cada sigla. Formato obligatorio SIEMPRE: 'Autoridad de Fuentes (SIM) 37,3' ✅ · 'Gestión de Controversias (CEM) 89' ✅ · 'Prioridad Alta — Autoridad de Fuentes (SIM)' ✅. PROHIBIDO: 'SIM 37,3' ❌ · 'CEM 89' ❌ · 'Prioridad Alta — SIM' ❌ · cualquier acrónimo suelto sin su nombre completo delante. Diccionario canónico OBLIGATORIO: NVM = Calidad de la Narrativa · DRM = Fortaleza de Evidencia · SIM = Autoridad de Fuentes · RMM = Actualidad y Empuje Mediático · CEM = Gestión de Controversias · GAM = Percepción de Gobernanza · DCM = Coherencia Informativa · CXM = Ejecución Corporativa · RIX = Índice de Reputación Algorítmica. Antes de emitir la respuesta, revisa el texto y sustituye cualquier acrónimo suelto por su nombre completo. PROHIBIDO inventar nombres alternativos.\n" +
  "21. PROHIBICIÓN DE MULETILLAS Y CLICHÉS PERIODÍSTICOS: está EXPRESAMENTE PROHIBIDO usar muletillas, clichés periodísticos o frases hechas en cualquier parte del informe (resumen ejecutivo, análisis, recomendaciones, alertas, pies de tabla). Lista no exhaustiva de expresiones VETADAS: 'hallazgo clave', 'farolillo rojo', 'talón de Aquiles', 'punta del iceberg', 'luces y sombras', 'asignatura pendiente', 'caballo de batalla', 'piedra angular', 'pone el foco', 'saca pecho', 'pasa factura', 'marca la diferencia', 'da un golpe sobre la mesa', 'juega un papel', 'no es oro todo lo que reluce', y cualquier metáfora periodística equivalente. En su lugar, usa lenguaje DIRECTO Y DESCRIPTIVO que nombre el hecho concreto: en vez de 'farolillo rojo del grupo' escribe 'la empresa con menor RIX del grupo (52,3)'; en vez de 'talón de Aquiles' escribe 'la submétrica más débil'; en vez de 'hallazgo clave' escribe 'el dato más relevante es' o directamente expón el dato sin preámbulo. Antes de emitir la respuesta final, revisa el texto y sustituye cualquier muletilla por su equivalente descriptivo.\n" +
  "22. PROHIBICIÓN DE ANGLICISMOS — USA EQUIVALENTES EN ESPAÑOL: está EXPRESAMENTE PROHIBIDO usar 'snapshot' en cualquier parte del informe (narrativa, metodología, pies de tabla, encabezados, alertas). Sustitúyelo SIEMPRE por su equivalente en español: 'instantánea' o 'foto' según contexto. Ejemplos: en vez de 'snapshot semanal' escribe 'instantánea semanal' o 'foto de la semana'; en vez de 'snapshot del periodo' escribe 'instantánea del periodo'. Antes de emitir la respuesta final, revisa el texto y sustituye cualquier aparición de 'snapshot' (en minúsculas, mayúsculas o capitalizado) por 'instantánea' o 'foto'. Esta regla aplica también a otros anglicismos innecesarios cuando exista un equivalente natural en español, pero el foco prioritario es 'snapshot'.\n" +
  "23. REDONDEO DE DECIMALES EN PROSA NARRATIVA (OBLIGATORIO): en cualquier texto narrativo del informe (resumen ejecutivo, análisis, recomendaciones, alertas, blockquotes, pies de tabla, encabezados, fichas metodológicas), toda cifra de RIX y submétricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) debe escribirse con UN ÚNICO decimal y usando COMA como separador decimal (formato español). Ejemplos correctos: 'RIX 62,8' ✅ · 'Autoridad de Fuentes (SIM) 37,3' ✅ · 'CEM 89,0' ✅. PROHIBIDO en prosa: dos o más decimales ('62,83' ❌ · '37,274' ❌), punto decimal anglosajón ('62.8' ❌ · '37.3' ❌), o mezclar ambos. EXCEPCIÓN EXPLÍCITA: las TABLAS (renderizadas A.1–B.2 y cualquier tabla markdown pre-renderizada) conservan su precisión original tal cual viene del datapack — NO toques los valores dentro de celdas de tabla. La regla aplica solo al texto en prosa fuera de tablas. Antes de emitir la respuesta final, revisa la prosa y trunca/redondea a 1 decimal cualquier cifra de RIX o submétrica con 2+ decimales, y sustituye el punto decimal por coma. No alteres años (2026), porcentajes de variación con su formato original, ni valores dentro de tablas.\n" +
  "24. PROHIBICIÓN DE ADJETIVOS VACÍOS SIN RESPALDO NUMÉRICO: está EXPRESAMENTE PROHIBIDO usar adjetivos valorativos vacíos en la prosa narrativa del informe (resumen ejecutivo, análisis, recomendaciones, alertas, blockquotes, pies de tabla) si NO van acompañados en la misma frase de una cifra concreta del datapack que los justifique (valor de RIX, submétrica, delta, ranking, percentil o cuartil). Lista CERRADA de adjetivos sujetos a esta regla: 'robusto/robusta', 'sólido/sólida', 'compacto/compacta', 'potente', 'fuerte', 'débil', 'excelente', 'notable', 'destacado/destacada', 'significativo/significativa', 'relevante', 'importante', 'considerable', 'sustancial'. Cada vez que escribas uno de estos adjetivos, la misma frase debe contener un número concreto del datapack que lo respalde. Ejemplos correctos: 'RIX sólido de 78,4 (cuartil superior)' ✅ · 'caída significativa de 12,3 puntos en 4 semanas' ✅ · 'posición débil en Autoridad de Fuentes (SIM) 34,1' ✅. PROHIBIDO: 'la empresa muestra una reputación sólida' ❌ (sin cifra) · 'destacado desempeño en gobernanza' ❌ (sin cifra) · 'mejora significativa este trimestre' ❌ (sin cifra). EXCEPCIONES EXPLÍCITAS: (a) las TABLAS renderizadas (A.1–B.2 y cualquier tabla markdown pre-renderizada) quedan exentas; (b) el GLOSARIO y las definiciones donde el adjetivo forma parte de una banda interpretativa canónica (por ejemplo 'Sólido 🟢' de la regla 12) quedan exentos; (c) las CITAS LITERALES externas se conservan tal cual. Antes de emitir la respuesta final, revisa la prosa y, para cada adjetivo de la lista cerrada, verifica que la misma frase incluya su cifra de respaldo; si no la tiene, reescribe la frase añadiendo el dato o elimina el adjetivo. Antes de emitir la respuesta final, revisa la prosa completa, localiza cada adjetivo de la lista cerrada y verifica que va acompañado de cifra en la misma frase; si no, REESCRIBE eliminando el adjetivo o añadiendo la cifra.\n" +
  "25. INVERSIÓN DE PIRÁMIDE INFORMATIVA (OBLIGATORIO): toda sección narrativa del informe (resumen ejecutivo, análisis empresa por empresa, patrones, recomendaciones, alertas, bloques de evolución) debe seguir estructura de pirámide invertida: PRIMERO la conclusión con dato concreto, DESPUÉS el contexto, AL FINAL la metodología o matices. Está PROHIBIDO abrir párrafos, secciones, bullets o bloques de recomendación con preámbulos, contexto histórico vago, frases de transición ('cabe destacar', 'conviene recordar', 'es importante señalar', 'en este sentido', 'por otra parte'), descripciones genéricas o aplazamiento del dato. Formato OBLIGATORIO de apertura: la primera frase de cada bloque debe contener al menos un elemento concreto del datapack (valor de RIX con banda interpretativa, delta, ranking, cuartil o submétrica con cifra). Ejemplos correctos: ✅ 'BBVA cierra el periodo con RIX 62,8 (Moderado 🟡), tercero del grupo y 4,2 puntos por debajo de Santander.' ✅ 'Inditex lidera el ranking con RIX 83,1 (Sólido 🟢), 21 puntos por encima de la referencia del grupo.' PROHIBIDO: ❌ 'En el contexto actual del IBEX, conviene analizar la situación de BBVA, que presenta una reputación interesante...' ❌ 'Cabe destacar que el periodo analizado muestra dinámicas relevantes para Inditex.' EXCEPCIONES EXPLÍCITAS: (a) las TABLAS renderizadas (A.1–B.2 y cualquier tabla markdown pre-renderizada) quedan exentas; (b) el GLOSARIO y la sección de METODOLOGÍA quedan exentos; (c) los BLOCKQUOTES de advertencia mono-modelo (regla 13) y de alerta de tendencia descendente (regla 16) conservan su formato fijo. Esta regla NO altera la estructura canónica del informe (Headline → Diagnóstico → 6 IAs → Patrones) ni la numeración continua de secciones (reglas 14 y 17); solo regula el orden interno de la información dentro de cada bloque narrativo. Antes de emitir la respuesta final, revisa la primera frase de cada bloque narrativo en ámbito y verifica que contiene una cifra concreta del datapack; si no la tiene, REESCRIBE la apertura colocando el dato al inicio y desplazando el contexto a frases posteriores.";

// ─────────────────────────────────────────────────────────────────────────────
// R20 — Post-procesador determinista de acrónimos de métricas
// Garantía: la primera aparición de cada sigla en CADA ficha narrativa se
// expande a «Nombre completo (SIGLA)». Apariciones posteriores en la misma
// ficha quedan como SIGLA sola (correcto). NO toca tablas, encabezados,
// blockquotes, bloques de código, glosario ni metodología. NO altera cifras.
// Si una sigla candidata no está en el glosario, se registra un warning y
// se deja como está (no rompe). El prompt de R20 sigue vigente como primera
// línea de defensa; este post-procesador es la red de seguridad determinista.
// ─────────────────────────────────────────────────────────────────────────────

export const R20_GLOSSARY_MAP: Record<string, string> = {
  NVM: "Calidad de la Narrativa",
  DRM: "Fortaleza de Evidencia",
  SIM: "Autoridad de Fuentes",
  RMM: "Actualidad y Empuje Mediático",
  CEM: "Gestión de Controversias",
  GAM: "Percepción de Gobernanza",
  DCM: "Coherencia Informativa",
  CXM: "Ejecución Corporativa",
  RIX: "Índice de Reputación Algorítmica",
};

export interface EnforceR20Result {
  output: string;
  substitutions: number;
  warnings: string[];
}

/**
 * Recorre el markdown narrativo y expande la primera aparición de cada sigla
 * por «Nombre completo (SIGLA)» dentro de cada ficha (bloque iniciado por
 * `##` o `###`). Saltos: tablas (`|`), encabezados (`#`), blockquotes (`>`),
 * bloques de código (toggle por ```), secciones glosario/metodología.
 */
export function enforceR20Acronyms(
  markdown: string,
  glossary: Record<string, string> = R20_GLOSSARY_MAP,
): EnforceR20Result {
  if (!markdown || typeof markdown !== "string") {
    return { output: markdown ?? "", substitutions: 0, warnings: [] };
  }

  // Universo de siglas reconocibles (orden estable). Se incluyen también
  // siglas no canónicas detectables para registrar warnings.
  const knownAcronyms = Object.keys(glossary);
  const candidatePattern = /\b([A-Z]{2,5})\b/;

  const lines = markdown.split(/\r?\n/);
  let inCodeBlock = false;
  let inGlossaryOrMethodology = false;
  let seen = new Set<string>();
  let substitutions = 0;
  const warnings = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Toggle bloques de código
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Detección de encabezados
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const headingText = headingMatch[2].toLowerCase();
      // Reset de "seen" en cada ficha nueva (## o ###)
      if (headingMatch[1].length <= 3) {
        seen = new Set<string>();
      }
      // Toggle glosario/metodología: activo hasta el siguiente heading mismo o superior nivel
      if (/glosario|metodolog[íi]a/.test(headingText)) {
        inGlossaryOrMethodology = true;
      } else if (headingMatch[1].length <= 2) {
        // Cualquier nuevo H1/H2 cierra el modo glosario/metodología
        inGlossaryOrMethodology = false;
      }
      continue; // No procesar encabezados
    }

    if (inGlossaryOrMethodology) continue;

    // Saltar filas de tabla y blockquotes
    if (trimmed.startsWith("|") || trimmed.startsWith(">")) continue;

    // Procesar prosa narrativa
    let newLine = line;
    // Recorrido por todas las apariciones candidatas en orden
    let cursor = 0;
    let working = "";
    while (cursor < newLine.length) {
      const slice = newLine.slice(cursor);
      const m = candidatePattern.exec(slice);
      if (!m) {
        working += slice;
        break;
      }
      const start = cursor + (m.index ?? 0);
      const end = start + m[1].length;
      const acr = m[1];
      working += newLine.slice(cursor, start);

      // ¿Es una sigla candidata real? (filtramos tokens en mayúsculas comunes)
      const isKnown = Object.prototype.hasOwnProperty.call(glossary, acr);
      const isPotentialMetric = /^[A-Z]{2,4}$/.test(acr);

      // Comprobar si ya viene precedida por "Nombre (" — patrón "(SIGLA)"
      const prevChar = start > 0 ? newLine[start - 1] : "";
      const nextChar = end < newLine.length ? newLine[end] : "";
      const alreadyParenthetical = prevChar === "(" && nextChar === ")";

      if (isKnown && !alreadyParenthetical && !seen.has(acr)) {
        const fullName = glossary[acr];
        working += `${fullName} (${acr})`;
        seen.add(acr);
        substitutions++;
      } else {
        working += acr;
        if (!isKnown && isPotentialMetric) {
          // Solo warning para tokens cortos plausibles, no para acrónimos genéricos
          // Filtramos palabras comunes en mayúsculas frecuentes en informes
          const ignoreList = new Set([
            "IBEX", "IBEX35", "IA", "IAS", "ETF", "ESG", "CEO", "CFO",
            "CTO", "COO", "AISO", "GEO", "SEO", "PDF", "PPTX", "TLDR",
            "TL", "DR", "API", "URL", "ROI", "EUR", "USD", "GBP", "EE",
            "UU", "ID", "UI", "UX", "IT", "OK", "PYME", "PYMES", "OPS",
            "IPO", "IPOS", "IBE", "MAB", "CNMV", "BME", "ECB", "BCE",
            "FED", "PIB", "IRPF", "IVA",
          ]);
          if (!ignoreList.has(acr) && acr.length <= 4) {
            warnings.add(`[R20] sigla sin glosario: ${acr}`);
          }
        }
      }
      cursor = end;
    }
    lines[i] = working;
  }

  return {
    output: lines.join("\n"),
    substitutions,
    warnings: Array.from(warnings),
  };
}