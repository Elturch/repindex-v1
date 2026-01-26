

# Plan: Corregir Drumroll para Basarse en Resultados Reales

## El Problema

La función `generateDrumrollQuestion` actualmente:
1. Solo recibe 500 caracteres de la respuesta (muy poco contexto)
2. No recibe los datos estructurados del análisis (métricas, scores, tendencias)
3. Propone informes genéricos ("mapa competitivo") en lugar de específicos basados en hallazgos

### Ejemplo del Problema Actual

```text
Usuario: "Analiza Telefónica"
Respuesta: [Análisis completo con métricas, detectando que DRM está en 45/100]
Drumroll actual: "Mapa Competitivo: Telefónica vs Vodafone" (genérico)
Drumroll esperado: "Análisis de Visibilidad Mediática: Por qué Telefónica tiene baja evidencia documental (DRM: 45/100) y cómo corregirlo"
```

---

## Solución Propuesta

### 1. Extraer Insights Estructurados del Análisis

Antes de llamar a `generateDrumrollQuestion`, crear un resumen de hallazgos clave:

```typescript
interface AnalysisInsights {
  company: string;
  ticker: string;
  overallScore: number;
  weakestMetrics: { name: string; score: number; interpretation: string }[];
  strongestMetrics: { name: string; score: number; interpretation: string }[];
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  competitorComparison?: { ahead: string[]; behind: string[] };
  divergenceLevel: 'low' | 'medium' | 'high';
  keyFinding: string; // La conclusión más importante del análisis
}

function extractAnalysisInsights(
  answer: string,
  rixData: any[],
  primaryCompany: { ticker: string; issuer_name: string }
): AnalysisInsights {
  // Extraer datos reales de rix_runs para la empresa
  const companyData = rixData.filter(r => r['05_ticker'] === primaryCompany.ticker);
  
  // Identificar métricas más débiles y fuertes
  const latestRun = companyData[0];
  const metrics = [
    { name: 'NVM (Narrativa)', score: latestRun?.['23_nvm_score'], category: latestRun?.['25_nvm_categoria'] },
    { name: 'DRM (Evidencia)', score: latestRun?.['26_drm_score'], category: latestRun?.['28_drm_categoria'] },
    { name: 'SIM (Sentimiento)', score: latestRun?.['29_sim_score'], category: latestRun?.['31_sim_categoria'] },
    // ... resto de métricas
  ].filter(m => m.score !== null);
  
  const weakest = metrics.sort((a, b) => a.score - b.score).slice(0, 2);
  const strongest = metrics.sort((a, b) => b.score - a.score).slice(0, 2);
  
  return {
    company: primaryCompany.issuer_name,
    ticker: primaryCompany.ticker,
    overallScore: latestRun?.['09_rix_score'] || 0,
    weakestMetrics: weakest.map(m => ({ 
      name: m.name, 
      score: m.score,
      interpretation: m.category || 'Sin categoría'
    })),
    strongestMetrics: strongest.map(m => ({
      name: m.name,
      score: m.score, 
      interpretation: m.category || 'Sin categoría'
    })),
    trend: calculateTrend(companyData),
    trendDelta: calculateDelta(companyData),
    divergenceLevel: calculateDivergence(companyData),
    keyFinding: extractKeyFinding(answer)
  };
}
```

### 2. Modificar Prompt del Drumroll

Cambiar el prompt para incluir insights estructurados:

```typescript
const drumrollPrompt = `Acabas de generar un análisis sobre: "${originalQuestion}"

═══════════════════════════════════════════════════════════════════════════════
                      HALLAZGOS CLAVE DEL ANÁLISIS
═══════════════════════════════════════════════════════════════════════════════

EMPRESA ANALIZADA: ${insights.company} (${insights.ticker})
SCORE RIX ACTUAL: ${insights.overallScore}/100
TENDENCIA: ${insights.trend === 'up' ? '📈 Subiendo' : insights.trend === 'down' ? '📉 Bajando' : '➡️ Estable'} (${insights.trendDelta > 0 ? '+' : ''}${insights.trendDelta} pts)

MÉTRICAS MÁS DÉBILES (oportunidad de mejora):
${insights.weakestMetrics.map(m => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join('\n')}

MÉTRICAS MÁS FUERTES:
${insights.strongestMetrics.map(m => `• ${m.name}: ${m.score}/100 (${m.interpretation})`).join('\n')}

NIVEL DE DIVERGENCIA ENTRE IAs: ${insights.divergenceLevel}
CONCLUSIÓN PRINCIPAL: ${insights.keyFinding}

SECTOR: ${sectorInfo || 'No específico'}
COMPETIDORES DISPONIBLES: ${competitors.join(', ') || 'No identificados'}

═══════════════════════════════════════════════════════════════════════════════

TU MISIÓN: Basándote en los HALLAZGOS REALES de arriba, propón UN informe complementario que PROFUNDICE en:

1. Si hay métricas débiles → Propón analizar causas y soluciones
2. Si hay tendencia negativa → Propón proyección de escenarios
3. Si hay alta divergencia → Propón entender por qué las IAs difieren
4. Si hay una fortaleza clara → Propón compararla con competidores

REGLAS:
- El informe debe ser ESPECÍFICO a los datos de arriba
- NO propongas cosas genéricas - referencia métricas o hallazgos concretos
- El título debe mencionar algo específico del análisis (una métrica, un score, una tendencia)

IDIOMA: ${languageName}

Responde en JSON:
{
  "title": "Título que referencia un hallazgo específico",
  "fullQuestion": "Pregunta ejecutable que profundiza en el hallazgo",
  "teaser": "Por qué este análisis es valioso dado lo encontrado",
  "reportType": "competitive|vulnerabilities|projection|sector"
}`;
```

### 3. Actualizar la Llamada en handleStandardChat

```typescript
// Extraer insights antes de generar drumroll
let drumrollQuestion: DrumrollQuestion | null = null;
if (depthLevel !== 'quick' && detectedCompanies.length > 0) {
  const insights = extractAnalysisInsights(
    answer,
    allRixData || [],
    detectedCompanies[0]
  );
  
  drumrollQuestion = await generateDrumrollQuestion(
    question,
    insights, // Pasar insights estructurados en lugar de solo el texto
    detectedCompanies,
    companiesCache,
    language,
    languageName,
    logPrefix
  );
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir `extractAnalysisInsights`, modificar `generateDrumrollQuestion` para recibir insights estructurados |

---

## Resultado Esperado

### Antes:
```text
Usuario: "Analiza Telefónica"
→ Drumroll: "Mapa Competitivo: Telefónica vs operadores europeos"
(Genérico, no relacionado con el análisis)
```

### Después:
```text
Usuario: "Analiza Telefónica" 
→ Análisis detecta: DRM (Evidencia Documental) = 45/100, tendencia -8 pts
→ Drumroll: "¿Por qué Telefónica tiene baja visibilidad en medios? Análisis de cobertura mediática y plan de mejora"
(Específico al hallazgo más relevante)
```

---

## Casos Especiales

1. **Sin empresas detectadas** (ej: "quién es Marc Murtra"): No generar drumroll, como ahora
2. **Pregunta general de ranking**: Drumroll sobre el líder o el que más subió
3. **Comparativa entre empresas**: Drumroll sobre la diferencia más notable

