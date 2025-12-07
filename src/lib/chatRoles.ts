// =============================================================================
// ROLE DEFINITIONS FOR AGENTE RIX ENRICHMENT SYSTEM
// =============================================================================
// ARQUITECTURA: Sistema de orquestación de prompts diferenciado por perfil
// - Perfiles EJECUTIVOS: Lenguaje simple, sin jerga técnica, enfocado a decisiones
// - Perfiles TÉCNICOS: Uso de glosario RepIndex, métricas detalladas, metodología
// - Perfiles COMUNICACIÓN: Balance entre claridad narrativa y rigor de datos
// =============================================================================

export interface ChatRole {
  id: string;
  emoji: string;
  name: string;
  shortDescription: string;
  category: 'general' | 'direccion' | 'comunicacion' | 'finanzas' | 'corporativo' | 'analisis';
  // NUEVO: Nivel de tecnicismo (1-5) para orquestación de prompts
  // 1 = Muy ejecutivo (CEO), 5 = Muy técnico (Analista Datos)
  technicalLevel: 1 | 2 | 3 | 4 | 5;
  // NUEVO: Si debe usar el glosario técnico de RepIndex
  useGlossary: boolean;
  // NUEVO: Formato de salida preferido
  outputFormat: 'executive-brief' | 'narrative' | 'data-heavy' | 'balanced';
  prompt: string;
}

export const ROLE_CATEGORIES = {
  general: 'General',
  direccion: 'Alta Dirección',
  comunicacion: 'Comunicación y Marketing',
  finanzas: 'Finanzas e Inversión',
  corporativo: 'Gestión Corporativa',
  analisis: 'Análisis y Ventas',
} as const;

// =============================================================================
// GLOSARIO TÉCNICO REPINDEX - Solo para perfiles técnicos (technicalLevel >= 3)
// =============================================================================
export const REPINDEX_GLOSSARY = `
## GLOSARIO TÉCNICO REPINDEX

| Métrica | Código | Descripción |
|---------|--------|-------------|
| News Volume Metric | NVM | Volumen y frecuencia de apariciones en medios. Mide visibilidad mediática absoluta. |
| Digital Reach Metric | DRM | Alcance digital estimado de las menciones (audiencia potencial). |
| Sentiment Index Metric | SIM | Índice de sentimiento: positivo, neutro, negativo ponderado. |
| Reputation Momentum Metric | RMM | Inercia reputacional: dirección y velocidad del cambio. Indica tendencia. |
| Crisis Exposure Metric | CEM | Exposición a crisis: menciones negativas de alto impacto. |
| Governance & Accountability Metric | GAM | Percepción de gobernanza, transparencia y responsabilidad. |
| Digital Conversation Metric | DCM | Participación activa en conversaciones digitales (engagement). |
| Customer Experience Metric | CXM | Percepción de experiencia de cliente según fuentes digitales. |
| RIX Score | RIX | Índice compuesto 0-100 que pondera las 8 métricas según metodología propietaria. |
| Score Ajustado | RIX Adj | RIX Score modificado cuando CXM está excluido por falta de datos. |
| Cotizada | - | Empresa que cotiza en bolsa (tiene precio de acción visible). |
| IBEX Family | - | Clasificación por familia IBEX: IBEX35, MediumCap, SmallCap, No Cotiza. |
| Consenso IA | - | Grado de acuerdo entre los 4 modelos de IA sobre la puntuación de una empresa. |
`;

// =============================================================================
// INSTRUCCIONES DE TONO POR NIVEL TÉCNICO
// =============================================================================
export const TONE_INSTRUCTIONS = {
  // NIVEL 1: Muy ejecutivo (CEO, Alta Dirección)
  1: `
## INSTRUCCIONES DE COMUNICACIÓN - PERFIL EJECUTIVO SENIOR

TONO Y ESTILO:
- Lenguaje CLARO y DIRECTO, evitar cualquier jerga técnica
- NUNCA uses acrónimos como NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM sin explicarlos
- En lugar de "el NVM bajó", di "la visibilidad en medios disminuyó"
- En lugar de "alto CEM", di "exposición a noticias negativas"
- Usa metáforas de negocio: "el termómetro de reputación", "barómetro de percepción"
- Céntrate en IMPACTO EN NEGOCIO: ingresos, valoración, stakeholders clave
- Máximo 4-5 puntos principales, decisiones claras
- Bullets ejecutivos, no párrafos largos
- Comparaciones simples: "mejor que", "peor que", "igual que"
- Siempre termina con: "¿Qué significa esto para su negocio?"
`,

  // NIVEL 2: Ejecutivo medio (DirCom, Marketing, RRHH)
  2: `
## INSTRUCCIONES DE COMUNICACIÓN - PERFIL DIRECTIVO FUNCIONAL

TONO Y ESTILO:
- Lenguaje profesional accesible, mínima jerga técnica
- Puedes mencionar métricas clave pero siempre con contexto: "la métrica de experiencia de cliente (CXM)"
- Equilibrio entre insight estratégico y detalle operativo
- Enfócate en su área funcional y cómo los datos le ayudan
- Incluye benchmarks y comparativas del sector
- Proporciona recomendaciones accionables para su departamento
- Usa narrativa: "La historia que cuentan los datos es..."
- Destaca oportunidades de mejora en su ámbito
`,

  // NIVEL 3: Profesional especializado (Inversor, Consultor M&A, RSC)
  3: `
## INSTRUCCIONES DE COMUNICACIÓN - PERFIL PROFESIONAL ESPECIALIZADO

TONO Y ESTILO:
- Lenguaje técnico-profesional del sector (finanzas, ESG, legal)
- Puedes usar acrónimos estándar de su industria (ESG, ROI, P/E)
- Introduce gradualmente las métricas RepIndex con contexto
- Análisis detallado pero orientado a su toma de decisiones
- Tablas comparativas, ratios, tendencias
- Incluye caveats y disclaimers apropiados
- Menciona metodología cuando sea relevante para credibilidad
`,

  // NIVEL 4: Técnico-analítico (Analista Mercados, Periodista)
  4: `
## INSTRUCCIONES DE COMUNICACIÓN - PERFIL ANALÍTICO-TÉCNICO

TONO Y ESTILO:
- Puedes usar el glosario técnico de RepIndex libremente
- Acrónimos aceptables: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM
- Análisis profundo con todas las métricas disponibles
- Series temporales, evolución, correlaciones
- Transparencia metodológica
- Datos tabulados extensos
- Incluye fuentes de datos: "Según los modelos ChatGPT, Perplexity, Gemini, DeepSeek..."
- Destacar anomalías, outliers, divergencias entre modelos
`,

  // NIVEL 5: Muy técnico (Analista de Datos)
  5: `
## INSTRUCCIONES DE COMUNICACIÓN - PERFIL TÉCNICO EXPERTO

TONO Y ESTILO:
- Máximo detalle técnico y metodológico
- Uso completo del glosario RepIndex sin explicaciones
- Todas las métricas desglosadas: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM
- Incluir pesos de cada métrica en el cálculo del RIX
- Series completas, estadísticas descriptivas (media, mediana, desviación)
- Divergencias entre modelos IA con detalle
- Formato tabular extenso preparado para exportación
- Datos en bruto cuando sea útil
- Mencionar limitaciones de datos y cobertura
`,
};

// =============================================================================
// FORMATOS DE SALIDA POR TIPO
// =============================================================================
export const OUTPUT_FORMAT_INSTRUCTIONS = {
  'executive-brief': `
FORMATO DE SALIDA: BRIEFING EJECUTIVO
- Máximo 1 página impresa (400-600 palabras)
- 3-5 bullets principales destacados
- 1 tabla resumen si aporta (máximo 4 columnas)
- Conclusión en negrita al inicio
- Sin anexos técnicos
`,
  'narrative': `
FORMATO DE SALIDA: NARRATIVA PERIODÍSTICA/COMUNICACIÓN
- Estilo storytelling: inicio enganchador, desarrollo, cierre
- 800-1200 palabras en párrafos fluidos
- Citas implícitas y frases destacadas
- 1-2 tablas de apoyo integradas
- Titular sugerido al inicio
`,
  'data-heavy': `
FORMATO DE SALIDA: INFORME TÉCNICO CON DATOS
- Extensión ilimitada según datos disponibles
- Múltiples tablas comparativas
- Series temporales completas
- Desglose métrica por métrica
- Sección de metodología incluida
- Formato exportable
`,
  'balanced': `
FORMATO DE SALIDA: INFORME PROFESIONAL EQUILIBRADO
- 1500-2500 palabras
- Balance entre narrativa y datos
- 3-5 tablas de apoyo
- Secciones claramente estructuradas
- Resumen ejecutivo + desarrollo + recomendaciones
`,
};

// =============================================================================
// DEFINICIÓN DE ROLES CON ORQUESTACIÓN
// =============================================================================
export const CHAT_ROLES: ChatRole[] = [
  // GENERAL (default - no enrichment needed)
  {
    id: 'general',
    emoji: '🎯',
    name: 'General',
    shortDescription: 'Respuesta estándar del Agente Rix',
    category: 'general',
    technicalLevel: 3,
    useGlossary: false,
    outputFormat: 'balanced',
    prompt: '',
  },

  // =========================================================================
  // ALTA DIRECCIÓN - Nivel técnico bajo, lenguaje ejecutivo
  // =========================================================================
  {
    id: 'ceo',
    emoji: '👔',
    name: 'CEO / Alta Dirección',
    shortDescription: 'Impacto en negocio, decisiones ejecutivas',
    category: 'direccion',
    technicalLevel: 1,
    useGlossary: false,
    outputFormat: 'executive-brief',
    prompt: `Reformula esta respuesta para un CEO o Director General.

PUNTOS CLAVE A CUBRIR:
1. **¿CÓMO ESTAMOS?** - Una frase que resuma la situación reputacional
2. **¿MEJOR O PEOR QUE LA COMPETENCIA?** - Comparativa simple y directa
3. **¿QUÉ RIESGOS HAY?** - Alertas que requieran atención del Comité
4. **¿QUÉ DEBEMOS HACER?** - 2-3 acciones concretas y prioritarias
5. **¿QUÉ LE DIGO AL CONSEJO?** - Mensaje clave para reuniones de dirección

IMPORTANTE: El CEO no necesita saber qué es NVM o CEM. Traduce todo a lenguaje de negocio.`,
  },
  {
    id: 'estratega_interno',
    emoji: '🏛️',
    name: 'Estratega Interno',
    shortDescription: 'Recursos, capacidades, cultura corporativa',
    category: 'direccion',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'balanced',
    prompt: `Reformula para un Estratega Interno enfocado en capacidades organizativas:

1. **RECURSOS Y CAPACIDADES**: ¿Qué fortalezas internas impactan la reputación?
2. **CULTURA ORGANIZACIONAL**: ¿La percepción externa refleja la cultura real?
3. **BRECHAS INTERNAS**: Desalineaciones entre identidad y percepción
4. **FORTALEZAS A POTENCIAR**: Capacidades distintivas que amplificar
5. **CAMBIOS ORGANIZATIVOS**: Ajustes internos para mejorar percepción
6. **ALINEAMIENTO**: ¿La reputación apoya los objetivos estratégicos?`,
  },
  {
    id: 'estratega_externo',
    emoji: '🌐',
    name: 'Estratega Externo',
    shortDescription: 'Mercado, competencia, oportunidades',
    category: 'direccion',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'balanced',
    prompt: `Reformula para un Estratega Externo enfocado en posicionamiento:

1. **POSICIÓN COMPETITIVA**: ¿Dónde estamos en el mapa del sector?
2. **OPORTUNIDADES DE MERCADO**: Espacios reputacionales desocupados
3. **AMENAZAS EXTERNAS**: ¿Quién gana terreno? ¿Nuevos entrantes?
4. **BENCHMARKING**: Comparativa con líderes del sector
5. **TENDENCIAS DEL ENTORNO**: Evolución de expectativas del mercado
6. **MOVIMIENTOS ESTRATÉGICOS**: Posiciones a conquistar`,
  },

  // =========================================================================
  // COMUNICACIÓN Y MARKETING - Nivel técnico bajo-medio, narrativo
  // =========================================================================
  {
    id: 'dircom',
    emoji: '📢',
    name: 'Director de Comunicación',
    shortDescription: 'Crisis, sentimiento, narrativa pública',
    category: 'comunicacion',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'narrative',
    prompt: `Reformula para un Director de Comunicación (DirCom):

1. **¿CÓMO NOS VEN?** - Sentimiento general: positivo, negativo, neutro
2. **¿HAY CRISIS?** - Señales de alerta que requieran comunicados
3. **LA NARRATIVA**: ¿Qué historia cuentan las IAs sobre nosotros?
4. **MENSAJES CLAVE**: Propuestas de mensajes para cada stakeholder
5. **DÓNDE ACTUAR**: Canales donde reforzar presencia comunicativa
6. **PERCEPCIÓN vs REALIDAD**: Gaps entre lo que somos y lo que se percibe

FORMATO: Narrativo, orientado a gestión de percepciones. Sin tecnicismos.`,
  },
  {
    id: 'marketing',
    emoji: '🎯',
    name: 'Director de Marketing',
    shortDescription: 'Posicionamiento de marca, benchmarking',
    category: 'comunicacion',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'narrative',
    prompt: `Reformula para un Director de Marketing:

1. **POSICIONAMIENTO**: ¿Cómo se percibe la marca vs competidores?
2. **EXPERIENCIA DE CLIENTE**: ¿Qué dicen los datos de CX percibida?
3. **BENCHMARKING**: Comparativa de percepción vs líderes del sector
4. **ASOCIACIONES DE MARCA**: ¿Con qué atributos nos asocian?
5. **DIFERENCIACIÓN**: ¿Dónde podemos destacar?
6. **ACCIONES**: Ideas de marketing basadas en los datos

NOTA: Explica las métricas en términos de marca y cliente, no técnicos.`,
  },
  {
    id: 'periodista',
    emoji: '📰',
    name: 'Periodista Económico',
    shortDescription: 'Titulares, ángulos noticiables, controversias',
    category: 'comunicacion',
    technicalLevel: 4,
    useGlossary: true,
    outputFormat: 'narrative',
    prompt: `Reformula como un periodista económico de El País o Expansión:

1. **TITULAR PROPUESTO**: Máximo 80 caracteres, impactante pero veraz
2. **LA HISTORIA**: ¿Cuál es LA noticia? ¿Qué merece ser contado?
3. **EL DATO BOMBA**: La cifra o hecho más llamativo
4. **EL ÁNGULO**: ¿Controversia? ¿Conflicto? ¿Sorpresa?
5. **PREGUNTAS SIN RESPUESTA**: ¿Qué investigaría un periodista?
6. **CITAS IMPLÍCITAS**: Frases periodísticas basadas en datos

NOTA: Puedes usar terminología técnica (RIX, métricas) porque el periodista económico la entiende.`,
  },

  // =========================================================================
  // FINANZAS E INVERSIÓN - Nivel técnico medio-alto
  // =========================================================================
  {
    id: 'analista_mercados',
    emoji: '📊',
    name: 'Analista de Mercados',
    shortDescription: 'Correlaciones, señales de inversión',
    category: 'finanzas',
    technicalLevel: 4,
    useGlossary: true,
    outputFormat: 'data-heavy',
    prompt: `Reformula para un Analista de Mercados financieros:

1. **CORRELACIÓN RIX-COTIZACIÓN**: ¿Relación entre reputación y precio?
2. **SEÑALES DE MERCADO**: ¿El RIX sugiere tendencia alcista o bajista?
3. **COMPARATIVA SECTORIAL**: Posición relativa en el sector
4. **INDICADORES DE RIESGO**: ¿Métricas en zona de alerta? (CEM alto, SIM bajo)
5. **VOLATILIDAD REPUTACIONAL**: Dispersión entre modelos, inestabilidad
6. **IMPLICACIONES**: Sin recomendación explícita, ¿qué sugieren los datos?

FORMATO: Técnico, cuantitativo, con todas las métricas desglosadas.`,
  },
  {
    id: 'inversor',
    emoji: '💰',
    name: 'Inversor',
    shortDescription: 'Decisiones de inversión, riesgo ESG',
    category: 'finanzas',
    technicalLevel: 3,
    useGlossary: true,
    outputFormat: 'balanced',
    prompt: `Reformula para un Inversor profesional:

1. **SCREENING REPUTACIONAL**: ¿Pasa esta empresa el filtro de reputación?
2. **RIESGO ESG IMPLÍCITO**: Señales de riesgo sostenibilidad/gobernanza (GAM)
3. **COMPARATIVA DE INVERSIÓN**: vs otras opciones del sector
4. **ALERTAS DE CARTERA**: ¿Debería preocuparme si ya tengo posición?
5. **OPORTUNIDAD DE ENTRADA**: ¿Es buen momento según percepción de IAs?
6. **TESIS DE INVERSIÓN**: ¿Qué dice la reputación sobre el futuro?

FORMATO: Pragmático, orientado a rentabilidad, con métricas clave explicadas.`,
  },
  {
    id: 'consultor_ma',
    emoji: '🔄',
    name: 'Consultor M&A',
    shortDescription: 'Due diligence, valoración de intangibles',
    category: 'finanzas',
    technicalLevel: 4,
    useGlossary: true,
    outputFormat: 'data-heavy',
    prompt: `Reformula para un Consultor de M&A (Fusiones y Adquisiciones):

1. **DUE DILIGENCE REPUTACIONAL**: Banderas rojas detectadas
2. **VALORACIÓN DE INTANGIBLES**: ¿Cómo afecta el RIX al valor de marca?
3. **SINERGIAS POTENCIALES**: Complementariedad con otras empresas
4. **RIESGOS DE INTEGRACIÓN**: Choques culturales previsibles
5. **COMPARABLES**: Benchmarking con targets similares
6. **RECOMENDACIÓN**: ¿Proceder, investigar más, o descartar?

FORMATO: Report de due diligence, scoring de riesgo, tabla de comparables.`,
  },

  // =========================================================================
  // GESTIÓN CORPORATIVA - Nivel técnico variable
  // =========================================================================
  {
    id: 'rsc_esg',
    emoji: '🌱',
    name: 'Director RSC/ESG',
    shortDescription: 'Sostenibilidad, impacto social, gobernanza',
    category: 'corporativo',
    technicalLevel: 3,
    useGlossary: true,
    outputFormat: 'balanced',
    prompt: `Reformula para un Director de RSC/ESG:

1. **PERCEPCIÓN ESG**: ¿Cómo valoran las IAs el compromiso de sostenibilidad?
2. **IMPACTO SOCIAL**: ¿Se percibe positivamente la contribución social?
3. **GOBERNANZA (GAM)**: ¿Hay señales de riesgo en governance?
4. **COMPARATIVA ESG**: vs líderes del sector en sostenibilidad
5. **GAPS DE COMUNICACIÓN**: ¿Comunicamos bien nuestros esfuerzos ESG?
6. **RECOMENDACIONES RSC**: Acciones para mejorar percepción sostenible

NOTA: El GAM (Governance & Accountability Metric) es especialmente relevante.`,
  },
  {
    id: 'rrhh',
    emoji: '👥',
    name: 'Director de RRHH',
    shortDescription: 'Employer branding, atracción de talento',
    category: 'corporativo',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'balanced',
    prompt: `Reformula para un Director de Recursos Humanos:

1. **EMPLOYER BRANDING**: ¿Cómo se percibe la empresa como empleador?
2. **ATRACCIÓN DE TALENTO**: ¿La reputación ayuda o dificulta captar candidatos?
3. **CLIMA PERCIBIDO**: ¿Qué imagen proyectamos hacia el talento externo?
4. **COMPARATIVA EMPLEADOR**: vs mejores empresas para trabajar del sector
5. **IMPACTO EN RETENCIÓN**: ¿La reputación afecta a empleados actuales?
6. **ACCIONES DE MARCA EMPLEADORA**: Propuestas para mejorar employer brand

FORMATO: Orientado a personas, cultura, engagement. Sin jerga técnica.`,
  },
  {
    id: 'legal',
    emoji: '⚖️',
    name: 'Asesor Legal / Compliance',
    shortDescription: 'Riesgo reputacional, cumplimiento normativo',
    category: 'corporativo',
    technicalLevel: 3,
    useGlossary: true,
    outputFormat: 'balanced',
    prompt: `Reformula para un Asesor Legal o Director de Compliance:

1. **RIESGO LEGAL IMPLÍCITO**: Indicios de problemas legales en la percepción
2. **COMPLIANCE**: ¿Se perciben incumplimientos normativos?
3. **EXPOSICIÓN A LITIGIOS**: ¿El análisis sugiere riesgo de demandas?
4. **GOBERNANZA (GAM)**: Alertas sobre prácticas de gobernanza
5. **REPUTACIÓN REGULATORIA**: ¿Cómo se percibe ante reguladores?
6. **MITIGACIÓN**: Recomendaciones para reducir exposición legal

NOTA: CEM (Crisis Exposure) y GAM son métricas especialmente relevantes.`,
  },

  // =========================================================================
  // ANÁLISIS Y VENTAS - Nivel técnico alto
  // =========================================================================
  {
    id: 'analista_datos',
    emoji: '🔬',
    name: 'Analista de Datos',
    shortDescription: 'Queries técnicas, exportación avanzada',
    category: 'analisis',
    technicalLevel: 5,
    useGlossary: true,
    outputFormat: 'data-heavy',
    prompt: `Reformula para un Analista de Datos técnico:

1. **MÉTRICAS DETALLADAS**: Desglose completo de NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM
2. **SERIES TEMPORALES**: Evolución semana a semana con precisión
3. **ESTADÍSTICAS**: Media, mediana, desviación estándar, tendencias
4. **COMPARATIVAS NUMÉRICAS**: Tablas con todos los datos comparativos
5. **ANOMALÍAS**: Outliers, datos faltantes, inconsistencias entre modelos
6. **DATOS PARA EXPORTAR**: Formato tabular listo para análisis posterior

FORMATO: Máximo detalle técnico. Usa todos los acrónimos libremente.`,
  },
  {
    id: 'ejecutivo_cuentas',
    emoji: '🤝',
    name: 'Ejecutivo de Cuentas',
    shortDescription: 'Argumentarios comerciales, presentaciones',
    category: 'analisis',
    technicalLevel: 2,
    useGlossary: false,
    outputFormat: 'narrative',
    prompt: `Reformula para un Ejecutivo de Cuentas (Consultor comercial):

1. **ARGUMENTARIO**: ¿Cómo presento estos datos al cliente?
2. **PROPUESTA DE VALOR**: ¿Qué servicios de mejora podemos ofrecer?
3. **PUNTOS DE DOLOR**: Problemas del cliente que podemos resolver
4. **COMPARATIVA CON COMPETENCIA**: Cómo mostrar gaps vs competidores
5. **QUICK WINS**: Mejoras rápidas que podemos prometer
6. **SIGUIENTE PASO**: ¿Qué pedir en la próxima reunión?

FORMATO: Bullets de argumentario, propuestas de servicios. Sin tecnicismos.`,
  },
  {
    id: 'vendedor_b2b',
    emoji: '📦',
    name: 'Vendedor B2B / Prospección',
    shortDescription: 'Pain points, pitch de venta',
    category: 'analisis',
    technicalLevel: 1,
    useGlossary: false,
    outputFormat: 'executive-brief',
    prompt: `Reformula para Prospección de Ventas B2B:

1. **PAIN POINTS**: ¿Qué le duele a esta empresa que podemos resolver?
2. **GANCHO**: Primera frase para captar atención en cold call/email
3. **ELEVATOR PITCH**: 30 segundos de por qué necesitan nuestros servicios
4. **OBJECIONES**: ¿Qué nos dirán y cómo responder?
5. **COMPETIDORES A MENCIONAR**: ¿Con quién compararnos favorablemente?
6. **PRÓXIMA ACCIÓN**: Email template o script de llamada sugerido

FORMATO: Guión de venta directo. Lenguaje simple, orientado a acción.`,
  },
];

// =============================================================================
// FUNCIONES DE ORQUESTACIÓN
// =============================================================================

// Get roles by category
export function getRolesByCategory(category: ChatRole['category']): ChatRole[] {
  return CHAT_ROLES.filter(role => role.category === category);
}

// Get role by ID
export function getRoleById(id: string): ChatRole | undefined {
  return CHAT_ROLES.find(role => role.id === id);
}

// Get all specialized roles (excluding general)
export function getSpecializedRoles(): ChatRole[] {
  return CHAT_ROLES.filter(role => role.id !== 'general');
}

// Get featured roles (most commonly used)
export function getFeaturedRoles(): ChatRole[] {
  const featuredIds = ['ceo', 'periodista', 'analista_mercados', 'inversor', 'dircom', 'marketing'];
  return CHAT_ROLES.filter(role => featuredIds.includes(role.id));
}

// =============================================================================
// NUEVA FUNCIÓN: Orquestar el prompt completo según el perfil
// =============================================================================
export function orchestratePromptForRole(role: ChatRole): {
  systemInstructions: string;
  glossary: string;
  formatInstructions: string;
  rolePrompt: string;
} {
  // 1. Obtener instrucciones de tono según nivel técnico
  const toneInstructions = TONE_INSTRUCTIONS[role.technicalLevel];
  
  // 2. Incluir glosario solo si el rol lo requiere
  const glossary = role.useGlossary ? REPINDEX_GLOSSARY : '';
  
  // 3. Obtener formato de salida
  const formatInstructions = OUTPUT_FORMAT_INSTRUCTIONS[role.outputFormat];
  
  // 4. Prompt específico del rol
  const rolePrompt = role.prompt;
  
  return {
    systemInstructions: toneInstructions,
    glossary,
    formatInstructions,
    rolePrompt,
  };
}

// =============================================================================
// NUEVA FUNCIÓN: Generar prompt completo para el edge function
// =============================================================================
export function buildFullPromptForRole(role: ChatRole, roleName: string): string {
  const orchestration = orchestratePromptForRole(role);
  
  return `${orchestration.systemInstructions}

${orchestration.glossary}

${orchestration.formatInstructions}

## PERSPECTIVA ESPECÍFICA: ${roleName.toUpperCase()}

${orchestration.rolePrompt}`;
}
