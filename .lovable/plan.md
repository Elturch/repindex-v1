

# Plan Revisado: Sistema de Informes Estructurados - Corrección de Implementación

## 📋 Auditoría de Discrepancias

He auditado toda la conversación y el código actual. Estas son las **brechas críticas** entre lo planificado y lo implementado:

| Componente Planificado | Estado Actual | Problema |
|------------------------|---------------|----------|
| **Estructura Pirámide** (Síntesis → Interpretativo → Empírico) | ❌ No implementado | El `systemPrompt` no incluye instrucciones de formato por nivel de profundidad |
| **Pregunta Redoble de Tambor** | ❌ No generada | La función `generateDrumrollQuestion` no existe en el edge function |
| **`refineUserQuestion`** (pre-procesamiento) | ❌ No existe | No hay refinamiento inteligente de la pregunta del usuario |
| **`buildDepthPrompt`** (prompts por nivel) | ❌ No existe | El parámetro `depthLevel` se recibe pero se ignora completamente |
| **Guardrails elegantes** | ✅ Implementado | `categorizeQuestion` y `getRedirectResponse` funcionan correctamente |
| **Selector de profundidad UI** | ✅ Implementado | El toggle de Quick/Complete/Exhaustive está en ChatInput.tsx |
| **Card de Drumroll UI** | ✅ Implementado pero sin datos | El componente existe pero nunca recibe `drumrollQuestion` porque el backend no lo genera |
| **Traducciones** | ✅ Implementado | Todas las claves de traducción están completas |

### El Problema Principal

El edge function **recibe** el `depthLevel` pero **no lo usa**:

```typescript
// Línea 1516-1518 del edge function actual:
console.log(`${logPrefix} Depth level: ${depthLevel}`);
// Después de esto... NADA. Se ignora completamente.
```

La respuesta siempre se genera con el mismo formato genérico, independientemente del nivel seleccionado.

---

## 🔧 Plan de Corrección Detallada

### 1. Implementar `buildDepthPrompt` en el Edge Function

Crear la función que genera instrucciones de formato según el nivel de profundidad:

```typescript
function buildDepthPrompt(depthLevel: 'quick' | 'complete' | 'exhaustive'): string {
  const depthInstructions = {
    quick: `
═══════════════════════════════════════════════════════════════════════════════
            FORMATO REQUERIDO: SÍNTESIS EJECUTIVA (máximo 500 palabras)
═══════════════════════════════════════════════════════════════════════════════

Estructura OBLIGATORIA:

## Síntesis Estratégica
Un párrafo denso (4-5 líneas) con la conclusión principal. El directivo debe 
captar la esencia en 30 segundos.

## Puntos Clave
• [Punto 1]: Una línea con dato concreto
• [Punto 2]: Una línea con dato concreto  
• [Punto 3]: Una línea con dato concreto

## Recomendación
Una frase directa de acción si procede.

PROHIBIDO en este nivel:
- Tablas detalladas
- Citas individuales de modelos de IA
- Explicaciones de métricas
- Más de 500 palabras
`,

    complete: `
═══════════════════════════════════════════════════════════════════════════════
         FORMATO REQUERIDO: INFORME EJECUTIVO COMPLETO (máximo 1800 palabras)
═══════════════════════════════════════════════════════════════════════════════

Estructura OBLIGATORIA:

## Síntesis Estratégica
Párrafo denso (5-6 líneas) con conclusión principal y recomendación estratégica.
Debe ser presentable a comité de dirección sin más contexto.

## Análisis Interpretativo
Narrativa de 3-4 párrafos donde las IAs son BASE DE PENSAMIENTO, no protagonistas.
- Usa: "la percepción algorítmica indica...", "el consenso de modelos refleja..."
- NO nombres individuales de IAs excepto para divergencias significativas (>12 pts)
- Contextualiza con comparativas sectoriales cuando sea relevante

## Tabla Resumen
Incluye UNA tabla comparativa si hay datos de múltiples empresas o modelos.

| Empresa | RIX Promedio | Tendencia | Fortaleza | Debilidad |
|---------|--------------|-----------|-----------|-----------|

## Conclusiones
2-3 puntos accionables basados en el análisis.
`,

    exhaustive: `
═══════════════════════════════════════════════════════════════════════════════
         FORMATO REQUERIDO: INFORME EXHAUSTIVO (máximo 4500 palabras)
═══════════════════════════════════════════════════════════════════════════════

Estructura OBLIGATORIA:

## 1. Síntesis Estratégica
Conclusión contundente de 6-8 líneas para comité de dirección.
Incluye: hallazgo principal, implicación estratégica, recomendación.

## 2. Análisis Interpretativo
Narrativa profesional de 4-5 párrafos integrando patrones y señales.
- Contextualiza cada afirmación con datos del contexto
- Explica las métricas en su primera mención
- Identifica causas probables de los patrones observados

## 3. Base Empírica

### 3.1 Tabla de Scores por Modelo
| Empresa | ChatGPT | Perplexity | Gemini | DeepSeek | Promedio | Divergencia |
|---------|---------|------------|--------|----------|----------|-------------|

### 3.2 Desglose de Métricas (si aplica)
Para cada métrica relevante:
- **NVM (Narrativa)**: [Score] - [Interpretación]
- **DRM (Evidencia)**: [Score] - [Interpretación]
... (las 8 métricas)

### 3.3 Evolución Temporal
Tendencia de las últimas 4 semanas si hay datos disponibles.

### 3.4 Comparativa Competitiva
Posicionamiento frente a competidores directos del sector.

## 4. Citas Relevantes (si están disponibles)
Extractos textuales de los modelos de IA que respaldan el análisis.

## 5. Recomendaciones
Plan de acción en 3 horizontes temporales:
1. **Inmediato** (esta semana): [acción concreta]
2. **Corto plazo** (próximo mes): [acción táctica]
3. **Estratégico** (próximo trimestre): [visión]
`
  };

  return depthInstructions[depthLevel] || depthInstructions.complete;
}
```

### 2. Implementar `generateDrumrollQuestion`

Crear la función que genera el informe complementario sugerido:

```typescript
interface DrumrollQuestion {
  title: string;
  fullQuestion: string;
  teaser: string;
  reportType: 'competitive' | 'vulnerabilities' | 'projection' | 'sector';
}

async function generateDrumrollQuestion(
  originalQuestion: string,
  generatedAnswer: string,
  detectedCompanies: string[],
  sectorInfo: string | null,
  language: string,
  languageName: string,
  logPrefix: string
): Promise<DrumrollQuestion | null> {
  
  // Solo generar para preguntas corporativas con suficiente contexto
  if (detectedCompanies.length === 0 && !sectorInfo) {
    return null;
  }

  const primaryCompany = detectedCompanies[0] || null;
  
  const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

CONTEXTO:
- Empresa principal analizada: ${primaryCompany || 'No específica (análisis general)'}
- Sector: ${sectorInfo || 'No específico'}
- Otras empresas mencionadas: ${detectedCompanies.slice(1).join(', ') || 'Ninguna'}

TU MISIÓN: Proponer UN informe complementario de ALTO VALOR que el usuario NO pidió pero NECESITA para completar su visión.

TIPOS DE INFORMES POSIBLES:
1. **competitive**: Mapa competitivo con rivales directos (si analizó una empresa sola)
2. **vulnerabilities**: Análisis de puntos débiles detectados (si hay métricas bajas)
3. **projection**: Escenarios futuros basados en tendencias (si hay evolución temporal)
4. **sector**: Panorama completo del sector (si preguntó por una empresa específica)

REGLAS:
- El informe debe COMPLEMENTAR, no repetir lo ya dicho
- Debe revelar algo NO OBVIO que emerja de cruzar datos
- El título debe ser MAGNÉTICO (max 12 palabras)
- El teaser debe generar CURIOSIDAD sin revelarlo todo

IDIOMA: Genera TODO en ${languageName}

Responde SOLO en JSON válido:
{
  "title": "Título magnético del informe",
  "fullQuestion": "La pregunta exacta que ejecutará este informe (en ${languageName})",
  "teaser": "1-2 frases que adelanten el valor sin revelarlo todo",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;

  try {
    const result = await callAISimple(
      [
        { role: 'system', content: `Eres un estratega de inteligencia competitiva. Propones análisis de alto valor. Responde SOLO en JSON válido.` },
        { role: 'user', content: drumrollPrompt }
      ],
      'gpt-4o-mini',
      400,
      logPrefix
    );
    
    if (!result) return null;
    
    const cleanResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanResult);
    
    // Validar estructura
    if (parsed.title && parsed.fullQuestion && parsed.teaser && parsed.reportType) {
      console.log(`${logPrefix} Drumroll question generated: "${parsed.title}"`);
      return parsed as DrumrollQuestion;
    }
    
    return null;
  } catch (error) {
    console.warn(`${logPrefix} Error generating drumroll question:`, error);
    return null;
  }
}
```

### 3. Integrar en `handleStandardChat`

Modificar la función principal para usar las nuevas funciones:

**Paso A**: Inyectar instrucciones de profundidad en el prompt del sistema

```typescript
// Justo antes de construir el systemPrompt (alrededor de línea 2350)
const depthInstructions = buildDepthPrompt(depthLevel);

// En el systemPrompt, añadir después de "ESTÁNDARES DE CALIDAD":
${depthInstructions}
```

**Paso B**: Generar el drumroll después de la respuesta principal

```typescript
// Después de generar suggestedQuestions (alrededor de línea 2994)

// Generar pregunta "Redoble de Tambor"
let drumrollQuestion: DrumrollQuestion | null = null;
if (depthLevel !== 'quick') { // No drumroll para respuestas rápidas
  drumrollQuestion = await generateDrumrollQuestion(
    question,
    answer,
    detectedCompanyNames,
    mainSector,
    language,
    languageName,
    logPrefix
  );
}
```

**Paso C**: Incluir drumroll en la respuesta

```typescript
// En el return final (línea 3022-3036)
return new Response(
  JSON.stringify({
    answer,
    suggestedQuestions,
    drumrollQuestion, // AÑADIR
    metadata: {
      documentsFound: vectorDocs?.length || 0,
      structuredDataFound: allRixData?.length || 0,
      dataWeeks: allRixData ? [...new Set(allRixData.map(r => r.batch_execution_date))].length : 0,
      aiProvider: chatResult.provider,
      depthLevel,           // AÑADIR
      questionCategory,     // AÑADIR
    }
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

### 4. Persistir campos adicionales en BD

Actualizar el INSERT a la base de datos:

```typescript
// En la inserción del mensaje del asistente
await supabaseClient.from('chat_intelligence_sessions').insert([
  {
    session_id: sessionId,
    role: 'assistant',
    content: answer,
    documents_found: vectorDocs?.length || 0,
    structured_data_found: allRixData?.length || 0,
    suggested_questions: suggestedQuestions,
    drumroll_question: drumrollQuestion,  // AÑADIR
    depth_level: depthLevel,              // AÑADIR
    question_category: questionCategory,  // AÑADIR
    user_id: userId
  }
]);
```

---

## 📁 Archivos a Modificar

| Archivo | Cambios Específicos |
|---------|---------------------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir `buildDepthPrompt`, `generateDrumrollQuestion`, integrar en `handleStandardChat` |

---

## 🧪 Resultado Esperado

### Antes (estado actual):
```text
Usuario: "Analiza Telefónica" [nivel: Completo]
→ Informe genérico sin estructura definida
→ Sin drumroll
→ Preguntas sugeridas genéricas
```

### Después (con correcciones):
```text
Usuario: "Analiza Telefónica" [nivel: Completo]
→ ## Síntesis Estratégica
  Telefónica presenta un RIX promedio de 67 puntos...
  
→ ## Análisis Interpretativo
  La percepción algorítmica indica una posición consolidada...
  
→ ## Tabla Resumen
  | Modelo | RIX | NVM | DRM | ... |
  
→ ## Conclusiones
  1. Fortalecer presencia en narrativa digital
  2. ...

→ 🥁 REDOBLE DE TAMBOR
  ┌─────────────────────────────────────────────┐
  │ "Mapa Competitivo: Telefónica vs Vodafone   │
  │  y Orange en percepción algorítmica"        │
  │                                              │
  │ ⚡ Descubre dónde Telefónica lidera y       │
  │ dónde sus rivales están ganando terreno     │
  └─────────────────────────────────────────────┘
```

---

## ⏱ Tiempo Estimado

- **Implementación del edge function**: ~15 minutos
- **Testing y ajustes**: ~5 minutos
- **Total**: ~20 minutos

---

## 📝 Nota sobre las Preguntas Sugeridas

Las preguntas sugeridas actuales proponen empresas genéricas (de otros sectores o sin relación). Esto ocurre porque el análisis de datos (`analyzeDataForInsights`) busca anomalías en TODO el dataset, no solo en el contexto de la pregunta.

Para corregir esto, el prompt de generación de preguntas debe filtrarse para:
1. Priorizar empresas del mismo sector que la analizada
2. Evitar sugerir empresas ya mencionadas en la conversación
3. Enfocarse en competidores directos cuando aplique

Esto se puede añadir como mejora posterior al corregir las funciones principales.

