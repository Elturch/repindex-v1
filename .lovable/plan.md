

# Plan: Corregir Información de Modelos en VectorStorePanel

## Problema Identificado

El panel de información del Vector Store muestra datos incorrectos:

| Fuente | Dice actualmente | Realidad (según DB) |
|--------|-----------------|---------------------|
| RIX V1 | 2 modelos | **4 modelos** (ChatGPT, Perplexity, DeepSeek, Gemini) |
| RIX V2 | 7 IAs | **6 modelos** (Qwen, DeepSeek, Perplexity, ChatGPT, Gemini, Grok) |

## Cambio Requerido

**Archivo:** `src/components/admin/VectorStorePanel.tsx`

**Líneas 398-399:**

```typescript
// ANTES (incorrecto):
<li><strong>RIX V1:</strong> Análisis históricos (Make.com) - 2 modelos</li>
<li><strong>RIX V2:</strong> Análisis nuevos (Lovable) - 7 IAs</li>

// DESPUÉS (correcto):
<li><strong>RIX V1:</strong> Análisis históricos (Make.com) - 4 modelos</li>
<li><strong>RIX V2:</strong> Análisis nuevos (Lovable) - 6 IAs</li>
```

## Datos de la Base de Datos (confirmados)

**RIX V1 (`rix_runs`):** 9,548 registros totales
- ChatGPT: 2,390
- Perplexity: 2,388
- DeepSeek: 2,387
- Google Gemini: 2,383

**RIX V2 (`rix_runs_v2`):** 1,953 registros completados
- Qwen: 335
- DeepSeek: 334
- Perplexity: 332
- ChatGPT: 331
- Google Gemini: 330
- Grok: 291

## Impacto

Corrección cosmética en el panel de administración. No afecta la lógica de sincronización.

