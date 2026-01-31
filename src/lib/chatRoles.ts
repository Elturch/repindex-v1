// =============================================================================
// ROLE DEFINITIONS FOR AGENTE RIX ENRICHMENT SYSTEM
// =============================================================================

export interface ChatRole {
  id: string;
  emoji: string;
  name: string;
  shortDescription: string;
  category: 'general' | 'direccion' | 'comunicacion' | 'finanzas' | 'corporativo' | 'analisis';
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

export const CHAT_ROLES: ChatRole[] = [
  // GENERAL (default - no enrichment needed)
  {
    id: 'general',
    emoji: '🎯',
    name: 'General',
    shortDescription: 'Respuesta estándar del Agente Rix',
    category: 'general',
    prompt: '', // No prompt needed for general
  },

  // ALTA DIRECCIÓN
  {
    id: 'ceo',
    emoji: '👔',
    name: 'CEO / Alta Dirección',
    shortDescription: 'Impacto en negocio, decisiones ejecutivas',
    category: 'direccion',
    prompt: `Reformula esta respuesta para un CEO o Director General:

1. **BREVEDAD EJECUTIVA**: Máximo 4-5 puntos clave, sin tecnicismos innecesarios
2. **IMPACTO EN NEGOCIO**: ¿Cómo afecta esto a resultados, valoración, stakeholders?
3. **COMPARATIVA COMPETITIVA**: ¿Dónde estamos vs la competencia? ¿Ganando o perdiendo?
4. **DECISIONES REQUERIDAS**: ¿Qué acciones concretas debe considerar?
5. **ALERTAS EJECUTIVAS**: ¿Hay riesgos inmediatos que requieran atención del Comité?
6. **MENSAJES CLAVE**: Bullets listos para compartir en reuniones de dirección

Formato: Usa bullet points, negritas para datos clave, tablas resumen cuando aporten valor.
Tono: Directo, estratégico, orientado a la toma de decisiones.`,
  },
  {
    id: 'estratega_interno',
    emoji: '🏛️',
    name: 'Estratega Interno',
    shortDescription: 'Recursos, capacidades, cultura corporativa',
    category: 'direccion',
    prompt: `Reformula esta respuesta para un Estratega Interno:

1. **RECURSOS Y CAPACIDADES**: ¿Qué recursos internos están impactando la reputación?
2. **CULTURA ORGANIZACIONAL**: ¿La percepción refleja la cultura real de la empresa?
3. **BRECHAS INTERNAS**: ¿Dónde hay desalineación entre identidad y percepción?
4. **FORTALEZAS A POTENCIAR**: ¿Qué capacidades distintivas se pueden amplificar?
5. **CAMBIOS ORGANIZATIVOS**: ¿Qué ajustes internos mejorarían la percepción?
6. **ALINEAMIENTO ESTRATÉGICO**: ¿La reputación apoya los objetivos estratégicos?

Formato: Análisis de gaps, recomendaciones de desarrollo interno.
Tono: Reflexivo, orientado a capacidades organizativas.`,
  },
  {
    id: 'estratega_externo',
    emoji: '🌐',
    name: 'Estratega Externo',
    shortDescription: 'Mercado, competencia, oportunidades',
    category: 'direccion',
    prompt: `Reformula esta respuesta para un Estratega Externo:

1. **POSICIÓN COMPETITIVA**: ¿Dónde está la empresa en el mapa competitivo del sector?
2. **OPORTUNIDADES DE MERCADO**: ¿Qué espacios reputacionales están desocupados?
3. **AMENAZAS EXTERNAS**: ¿Quién está ganando terreno? ¿Nuevos entrantes?
4. **BENCHMARKING**: Comparativas detalladas con líderes del sector
5. **TENDENCIAS DEL ENTORNO**: ¿Cómo evolucionan las expectativas del mercado?
6. **MOVIMIENTOS ESTRATÉGICOS**: ¿Qué posiciones debería conquistar la empresa?

Formato: Matrices de posicionamiento, análisis competitivo, escenarios.
Tono: Analítico, orientado al mercado y la competencia.`,
  },

  // COMUNICACIÓN Y MARKETING
  {
    id: 'dircom',
    emoji: '📢',
    name: 'Director de Comunicación',
    shortDescription: 'Crisis, sentimiento, narrativa pública',
    category: 'comunicacion',
    prompt: `Reformula esta respuesta para un Director de Comunicación (DirCom):

1. **ANÁLISIS DE SENTIMIENTO**: ¿Cómo nos perciben? ¿Positivo, negativo, neutro?
2. **GESTIÓN DE CRISIS**: ¿Hay señales de alerta que requieran preparar comunicados?
3. **NARRATIVA MEDIÁTICA**: ¿Qué historia están contando las IAs sobre nosotros?
4. **MENSAJES CLAVE**: Propuestas de mensajes para diferentes stakeholders
5. **CANALES Y MEDIOS**: ¿Dónde debemos reforzar presencia comunicativa?
6. **REPUTACIÓN vs REALIDAD**: ¿Hay gaps entre lo que somos y lo que se percibe?

Formato: Propuestas de mensajes, alertas de crisis, recomendaciones de comunicación.
Tono: Narrativo, orientado a la gestión de percepciones.`,
  },
  {
    id: 'marketing',
    emoji: '🎯',
    name: 'Director de Marketing',
    shortDescription: 'Posicionamiento de marca, benchmarking',
    category: 'comunicacion',
    prompt: `Reformula esta respuesta para un Director de Marketing:

1. **POSICIONAMIENTO DE MARCA**: ¿Cómo se percibe la marca vs competidores?
2. **CXM (Customer Experience)**: ¿Qué dice el score de experiencia de cliente?
3. **BENCHMARKING**: Comparativa detallada de percepción vs líderes del sector
4. **ASOCIACIONES DE MARCA**: ¿Con qué atributos asocian las IAs a la empresa?
5. **OPORTUNIDADES DE DIFERENCIACIÓN**: ¿Dónde podemos destacar?
6. **CAMPAÑAS RECOMENDADAS**: Ideas de acciones de marketing basadas en los datos

Formato: Análisis de marca, insights de consumidor, propuestas de acción.
Tono: Orientado al cliente, competitivo, creativo.`,
  },
  {
    id: 'periodista',
    emoji: '📰',
    name: 'Periodista Económico',
    shortDescription: 'Titulares, ángulos noticiables, controversias',
    category: 'comunicacion',
    prompt: `Reformula esta respuesta como si fueras un periodista económico de El País o Expansión:

1. **TITULAR PROPUESTO**: Un titular impactante pero veraz (máx 80 caracteres)
2. **LA HISTORIA**: ¿Cuál es LA noticia aquí? ¿Qué historia merece ser contada?
3. **EL DATO BOMBA**: La cifra o hecho más llamativo
4. **EL ÁNGULO**: ¿Hay controversia? ¿Conflicto? ¿Sorpresa?
5. **PREGUNTAS SIN RESPUESTA**: ¿Qué debería investigar un periodista?
6. **CITAS IMPLÍCITAS**: "Los números hablan por sí solos..." - frases periodísticas

Formato: Estilo periodístico narrativo, entradilla + desarrollo + cierre.
Tono: Periodístico de investigación, provocador pero riguroso.

NOTA IMPORTANTE: Si el nivel de profundidad es EXHAUSTIVE o COMPLETE, mantén la extensión 
solicitada por ese nivel. Estructura el contenido como un REPORTAJE DE INVESTIGACIÓN LARGO 
(no una nota de prensa breve) para acomodar la profundidad requerida. Puedes usar múltiples 
secciones periodísticas: contexto histórico, análisis de datos, entrevistas simuladas, 
proyecciones, y conclusiones editoriales.`,
  },

  // FINANZAS E INVERSIÓN
  {
    id: 'analista_mercados',
    emoji: '📊',
    name: 'Analista de Mercados',
    shortDescription: 'Correlaciones, señales de inversión',
    category: 'finanzas',
    prompt: `Reformula esta respuesta para un Analista de Mercados:

1. **CORRELACIÓN RIX-COTIZACIÓN**: ¿Hay relación entre reputación y precio?
2. **SEÑALES DE MERCADO**: ¿El RIX sugiere algo alcista o bajista?
3. **COMPARATIVA SECTORIAL**: Posición relativa en el sector
4. **INDICADORES DE RIESGO**: ¿Métricas en zona de alerta?
5. **VOLATILIDAD REPUTACIONAL**: ¿Alta dispersión entre modelos? ¿Inestabilidad?
6. **RECOMENDACIÓN IMPLÍCITA**: Sin decirlo explícitamente, ¿qué sugieren los datos?

Formato: Análisis técnico, tablas comparativas, rangos y ratios.
Tono: Cuantitativo, objetivo, orientado a inversión.`,
  },
  {
    id: 'inversor',
    emoji: '💰',
    name: 'Inversor',
    shortDescription: 'Decisiones de inversión, riesgo ESG',
    category: 'finanzas',
    prompt: `Reformula esta respuesta para un Inversor:

1. **SCREENING REPUTACIONAL**: ¿Pasa esta empresa el filtro de reputación?
2. **RIESGO ESG IMPLÍCITO**: ¿Hay señales de riesgo sostenibilidad/gobernanza?
3. **COMPARATIVA DE INVERSIÓN**: vs otras opciones del sector
4. **ALERTAS DE CARTERA**: ¿Debería preocuparme si ya tengo posición?
5. **OPORTUNIDAD DE ENTRADA**: ¿Es buen momento según percepción de IAs?
6. **TESIS DE INVERSIÓN**: ¿Qué dice la reputación sobre el futuro de la empresa?

Formato: Checklist de inversión, alertas, comparativa riesgo/oportunidad.
Tono: Pragmático, orientado a rentabilidad, cauteloso.`,
  },
  {
    id: 'cfo',
    emoji: '💼',
    name: 'Director Financiero (CFO)',
    shortDescription: 'Impacto financiero, valoración, riesgo',
    category: 'finanzas',
    prompt: `Reformula esta respuesta para un Director Financiero (CFO):

1. **IMPACTO EN VALORACIÓN**: ¿Cómo afecta la reputación al valor de la empresa?
2. **RIESGO FINANCIERO IMPLÍCITO**: ¿Hay señales que puedan afectar a resultados?
3. **COSTE DE CAPITAL**: ¿La percepción impacta en financiación o rating crediticio?
4. **COMPARATIVA DE MÚLTIPLOS**: ¿Empresas mejor percibidas cotizan a mayor múltiplo?
5. **INVERSIONES EN REPUTACIÓN**: ¿Qué ROI tienen las inversiones en imagen?
6. **REPORTING AL CONSEJO**: Datos clave para presentar en comité de dirección

Formato: Tablas financieras, impacto en P&L, análisis coste-beneficio.
Tono: Cuantitativo, orientado a resultados, pragmático.`,
  },
  {
    id: 'consultor_ma',
    emoji: '🔄',
    name: 'Consultor M&A',
    shortDescription: 'Due diligence, valoración de intangibles',
    category: 'finanzas',
    prompt: `Reformula esta respuesta para un Consultor de M&A (Fusiones y Adquisiciones):

1. **DUE DILIGENCE REPUTACIONAL**: ¿Qué banderas rojas detecta el análisis?
2. **VALORACIÓN DE INTANGIBLES**: ¿Cómo afecta el RIX al valor de la marca?
3. **SINERGIAS POTENCIALES**: ¿Con qué empresas tendría complementariedad?
4. **RIESGOS DE INTEGRACIÓN**: ¿Choques culturales previsibles?
5. **COMPARABLES**: Benchmarking con targets similares del sector
6. **RECOMENDACIÓN DE OPERACIÓN**: ¿Proceder, investigar más, o descartar?

Formato: Report de due diligence, scoring de riesgo, tabla de comparables.
Tono: Técnico, riguroso, orientado a transacciones.`,
  },

  // GESTIÓN CORPORATIVA
  {
    id: 'rsc_esg',
    emoji: '🌱',
    name: 'Director RSC/ESG',
    shortDescription: 'Sostenibilidad, impacto social, gobernanza',
    category: 'corporativo',
    prompt: `Reformula esta respuesta para un Director de RSC/ESG:

1. **PERCEPCIÓN DE SOSTENIBILIDAD**: ¿Cómo valoran las IAs nuestro compromiso ESG?
2. **IMPACTO SOCIAL**: ¿Se percibe positivamente nuestra contribución social?
3. **GOBERNANZA CORPORATIVA**: ¿Hay señales de riesgo de gobernanza?
4. **COMPARATIVA ESG**: vs líderes del sector en sostenibilidad
5. **GAPS DE COMUNICACIÓN**: ¿Estamos comunicando bien nuestros esfuerzos ESG?
6. **RECOMENDACIONES RSC**: Acciones para mejorar percepción sostenible

Formato: Análisis ESG, benchmarking de sostenibilidad, propuestas.
Tono: Orientado a propósito, stakeholders, largo plazo.`,
  },
  {
    id: 'rrhh',
    emoji: '👥',
    name: 'Director de RRHH',
    shortDescription: 'Employer branding, atracción de talento',
    category: 'corporativo',
    prompt: `Reformula esta respuesta para un Director de Recursos Humanos:

1. **EMPLOYER BRANDING**: ¿Cómo se percibe la empresa como lugar para trabajar?
2. **ATRACCIÓN DE TALENTO**: ¿El RIX ayuda o dificulta atraer candidatos?
3. **CLIMA ORGANIZACIONAL PERCIBIDO**: ¿Qué imagen proyectamos hacia el talento?
4. **COMPARATIVA EMPLEADOR**: vs mejores empresas para trabajar del sector
5. **IMPACTO EN RETENCIÓN**: ¿La reputación afecta a nuestros empleados actuales?
6. **ACCIONES DE MARCA EMPLEADORA**: Propuestas para mejorar employer brand

Formato: Análisis de marca empleadora, insights de talento.
Tono: Orientado a personas, cultura, engagement.`,
  },
  {
    id: 'legal',
    emoji: '⚖️',
    name: 'Asesor Legal / Compliance',
    shortDescription: 'Riesgo reputacional, cumplimiento normativo',
    category: 'corporativo',
    prompt: `Reformula esta respuesta para un Asesor Legal o Director de Compliance:

1. **RIESGO LEGAL IMPLÍCITO**: ¿Hay indicios de problemas legales en la percepción?
2. **COMPLIANCE**: ¿Se perciben incumplimientos normativos?
3. **EXPOSICIÓN A LITIGIOS**: ¿El análisis sugiere riesgo de demandas?
4. **GOBERNANZA**: ¿Hay alertas sobre prácticas de gobernanza?
5. **REPUTACIÓN REGULATORIA**: ¿Cómo se percibe ante reguladores?
6. **MITIGACIÓN DE RIESGOS**: Recomendaciones para reducir exposición legal

Formato: Análisis de riesgos legales, alertas de compliance.
Tono: Cauteloso, técnico-legal, orientado a prevención.`,
  },

  // ANÁLISIS Y VENTAS
  {
    id: 'analista_datos',
    emoji: '🔬',
    name: 'Analista de Datos',
    shortDescription: 'Queries técnicas, exportación avanzada',
    category: 'analisis',
    prompt: `Reformula esta respuesta para un Analista de Datos:

1. **MÉTRICAS DETALLADAS**: Desglose completo de todas las métricas disponibles
2. **SERIES TEMPORALES**: Evolución semana a semana con precisión
3. **ESTADÍSTICAS**: Media, mediana, desviación, tendencias
4. **COMPARATIVAS NUMÉRICAS**: Tablas con todos los datos comparativos
5. **ANOMALÍAS DETECTADAS**: Outliers, datos faltantes, inconsistencias
6. **DATOS PARA EXPORTAR**: Formato tabular listo para análisis posterior

Formato: Tablas detalladas, series de datos, métricas técnicas.
Tono: Técnico, preciso, orientado a datos.`,
  },
  {
    id: 'ejecutivo_cuentas',
    emoji: '🤝',
    name: 'Ejecutivo de Cuentas',
    shortDescription: 'Argumentarios comerciales, presentaciones',
    category: 'analisis',
    prompt: `Reformula esta respuesta para un Ejecutivo de Cuentas (Consultor):

1. **ARGUMENTARIO DE VENTA**: ¿Cómo presento estos datos al cliente?
2. **PROPUESTA DE VALOR**: ¿Qué servicios de mejora podemos ofrecer?
3. **PUNTOS DE DOLOR**: ¿Qué problemas tiene el cliente que podemos resolver?
4. **COMPARATIVA CON COMPETENCIA**: Cómo mostrar gaps vs competidores
5. **QUICK WINS**: Mejoras rápidas que podemos prometer
6. **SIGUIENTE REUNIÓN**: ¿Qué pedir como siguiente paso?

Formato: Bullets de argumentario, propuestas de servicios, call to action.
Tono: Comercial, orientado a valor, persuasivo.`,
  },
  {
    id: 'vendedor_b2b',
    emoji: '📦',
    name: 'Vendedor B2B / Prospección',
    shortDescription: 'Pain points, pitch de venta',
    category: 'analisis',
    prompt: `Reformula esta respuesta para Prospección de Ventas B2B:

1. **PAIN POINTS DETECTADOS**: ¿Qué duele a esta empresa que podemos resolver?
2. **GANCHO DE APERTURA**: Primera frase para captar atención en cold call/email
3. **ELEVATOR PITCH**: 30 segundos de por qué necesitan nuestros servicios
4. **OBJECIONES PREVISIBLES**: ¿Qué nos dirán y cómo responder?
5. **COMPETIDORES A MENCIONAR**: ¿Con quién compararnos favorablemente?
6. **PRÓXIMA ACCIÓN**: Email template o script de llamada sugerido

Formato: Guión de venta, templates de email, respuestas a objeciones.
Tono: Directo, orientado a ventas, urgente.`,
  },
];

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
  const featuredIds = ['ceo', 'cfo', 'periodista', 'analista_mercados', 'inversor', 'dircom', 'marketing'];
  return CHAT_ROLES.filter(role => featuredIds.includes(role.id));
}
