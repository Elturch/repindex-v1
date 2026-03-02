

# Plan: Pipeline Multi-Experto E1-E6 — IMPLEMENTADO ✅

## Estado: COMPLETADO

El pipeline multi-experto ha sido conectado y está activo en `handleStandardChat`.

## Cambios realizados

### 1. `handleStandardChat` refactorizado (~160 líneas vs ~2.600 antiguas)
- E1 `runClassifier` reemplaza `detectCompaniesInQuestion` regex
- E2 `buildDataPack` reemplaza PASOs 0-5.5 (queries SQL duplicadas)
- E3 `extractQualitativeFacts` extrae hechos de los 6 textos brutos
- E4 `runComparator` cruza cuanti + cuali para diagnóstico trazable
- E5 `buildOrchestratorPrompt` genera prompt limpio (reemplaza 500 líneas monolíticas)
- Graph expansion, vector search y regression se mantienen como contexto complementario inyectado en E5

### 2. Prompt E5 enriquecido
- Reglas de estilo narrativo (frases ≤25 palabras, párrafos ≤4 líneas)
- Escala de consenso (5-6 IAs = hecho consolidado, 3-4 = señal fuerte)
- Nombres descriptivos de métricas (no acrónimos)
- Protocolo de datos corporativos con niveles de confianza
- Justificación metodológica "Radar Reputacional"
- Todas las reglas anti-alucinación
- Adaptación a perspectivas/roles profesionales
- NO incluye "6 campos obligatorios" ni extensiones contradictorias

### 3. Eliminado
- System prompt monolítico de 500 líneas
- User prompt con extensiones contradictorias (4.500-5.400 vs 2.500-4.000)
- PASOs 0-6 con queries SQL duplicadas
- `buildDepthPrompt` (dead code, función aún existe pero no se invoca)
- Regla "6 campos obligatorios por recomendación" (causaba fabricación)

### 4. Mantenido sin cambios
- Streaming SSE con compliance gate
- Auto-continuation
- Suggested questions + drumroll
- Session save
- Bulletin mode (flujo separado)
- Graph expansion, vector search, regression (como contexto complementario)
