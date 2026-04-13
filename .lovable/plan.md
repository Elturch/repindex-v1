

## Plan: Alinear sugerencias con las capacidades reales del agente Rix

### Problema

Tres fuentes de sugerencias generan preguntas que el agente no puede contestar bien:
- Las **plantillas fallback** (`useSmartSuggestions.ts`) incluyen preguntas vagas como "¿Qué dimensiones reputacionales son más importantes?" o "¿Cuál es la metodología?" que no activan skills concretos.
- Las **sugerencias live** (`fetch-smart-suggestions`) usan frases abiertas como "¿por qué las IAs ven realidades tan distintas?" que producen respuestas genéricas.
- El **ChatQueryGuide** tiene ~70 ejemplos con muchos que no mapean a skills ("¿Hay alguna empresa en crisis?", "Novedades relevantes de la semana").

### Solución

#### 1. Reescribir las plantillas fallback (`useSmartSuggestions.ts`)

Reemplazar las 10 plantillas ES y EN por preguntas que activan directamente los 7 skills del agente:

```text
ES:
- "Top 5 del IBEX 35 por reputación esta semana"          → skillRanking
- "Analiza la reputación de Telefónica"                     → skillCompanyProfile
- "Compara BBVA con Banco Santander"                        → skillComparison
- "Evolución de Repsol en las últimas 4 semanas"            → skillEvolution
- "Ranking del sector Banca y Servicios Financieros"        → skillSectorSnapshot
- "¿Por qué las IAs divergen sobre Iberdrola?"              → skillDivergence
- "Desglose de métricas de Inditex"                         → skillCompanyScores
- "Compara sector Energía vs Telecomunicaciones"            → skillSectorComparison
- "Top empresas del BME Growth esta semana"                 → skillRanking
- "Evolución del sector banca últimas 6 semanas"            → skillEvolution
```

#### 2. Reformular las sugerencias live (`fetch-smart-suggestions`)

Cambiar los templates de texto en la edge function para que usen verbos imperativos que mapean a skills:

| Tipo actual | Formato actual (vago) | Formato nuevo (skill-mapped) |
|---|---|---|
| `dimensional_anomaly` | "destaca en X pero tiene debilidad en Y" | "Analiza la reputación de {name} — desglose por dimensiones" |
| `model_divergence` | "¿por qué ven realidades tan distintas?" | "Analiza la divergencia entre IAs sobre {name}" |
| `weekly_move` | "¿qué ha pasado?" | "Evolución de {name} en las últimas 2 semanas" |
| `sector_pattern` | "¿qué explica la brecha?" | "Compara {top} con {bottom} en el sector {sector}" |
| `cross_index` | "¿cuáles son y por qué?" | "Ranking de empresas fuera del IBEX-35 por reputación" |
| `full_analysis` | ya correcto | sin cambio |

#### 3. Reducir y alinear el ChatQueryGuide (`ChatQueryGuide.tsx`)

Reducir de 9 categorías con ~70 ejemplos a 6 categorías con ~30 ejemplos, todos usando verbos que activan skills directos. Eliminar categorías problemáticas:
- Eliminar "Alertas" (no hay skill de alertas)
- Eliminar "Contexto" (demasiado vago)
- Eliminar "Métricas" como categoría separada (integrar en Análisis)

Reformular ejemplos restantes con patrones que funcionan: "Analiza...", "Compara...", "Top/Ranking de...", "Evolución de...", "Divergencia entre IAs sobre...".

### Archivos afectados

1. `src/hooks/useSmartSuggestions.ts` — reescribir `getFallbackTemplates`
2. `supabase/functions/fetch-smart-suggestions/index.ts` — reformular los 6 bloques de generación de texto (líneas 247-408)
3. `src/components/chat/ChatQueryGuide.tsx` — reducir CATEGORIES y reformular ejemplos

### Verificación

Desplegar la edge function y probar que las sugerencias generadas activan los skills correctos enviándolas como queries al agente.

