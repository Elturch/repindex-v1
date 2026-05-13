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
  "11. RECOMENDACIONES ACCIONABLES REALES: cada recomendación que generes debe incluir EXPLÍCITAMENTE tres elementos: (a) QUIÉN debe actuar (área o función responsable: comunicación corporativa, IR, marketing, ESG, dirección general); (b) EN QUÉ PLAZO indicativo (corto = <1 mes, medio = 1-3 meses, largo = 3-6 meses) sin inventar fechas concretas; (c) QUÉ MÉTRICA DE ÉXITO se espera mover (qué submétrica del RIX debería mejorar y en qué dirección). Prohibido generar recomendaciones genéricas tipo 'mejorar la comunicación' sin estos tres campos.";