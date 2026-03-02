

# Auditoria: Riesgos del Plan Anterior sobre el Pipeline Multi-Experto

He revisado todo el flujo E1-E6 y confirmo que el plan anterior tiene **un riesgo real de romper cosas** y hay **bugs existentes graves** que el plan no aborda correctamente. Aqui va el analisis completo:

---

## PROBLEMA CRITICO 1: `allRixData` siempre vacio — rompe drumroll, metadata, insights y verified sources

**Estado actual (lineas 5390-5391):**
```text
const allRixData: any[] = [];
const detectedCompanyFullData: any[] = [];
```

Estos arrays NUNCA se llenan. El plan anterior propone poblarlos desde `dataPack.snapshot`, pero hay un problema de **formato incompatible**:

- `dataPack.snapshot` usa claves como `modelo`, `rix`, `nvm`, `drm`...
- El codigo downstream (lineas 5650-5750, 5848-5950) espera claves como `"02_model_name"`, `"09_rix_score"`, `"23_nvm_score"`, `"05_ticker"`, `"06_period_from"`, `"07_period_to"`, `batch_execution_date`

**Si simplemente mapeamos mal, se rompe:**
- El drumroll (linea 5632): `allRixData.length > 0` + `extractAnalysisInsights(allRixData, ...)`
- La metadata de metodologia (lineas 5652-5672): modelos usados, periodos, divergencia
- `analyzeDataForInsights()` (linea 5848): analisis de divergencias entre modelos
- `extractSourcesFromRixData()` (linea 5704): fuentes verificadas
- `structured_data_found` en session save (linea 5691)

**Solucion correcta:** Mapear `dataPack.snapshot` al formato legacy con las claves exactas que espera el downstream. Incluir `dataPack.empresa_primaria` para ticker/nombre.

---

## PROBLEMA CRITICO 2: `handleBulletinRequest` — la firma NO tiene `language`/`languageName`

**Estado actual (lineas 4308-4319):**
La funcion tiene 10 parametros y termina en `streamMode`. La llamada en linea 3634-3637 SI pasa `language` y `languageName` como argumentos 11 y 12, pero **JavaScript los ignora silenciosamente** porque la firma no los declara.

**Consecuencias:**
- "Company not found" (lineas 4359-4367) siempre en espanol
- Las post-suggestions del bulletin usan idioma incorrecto

**Esto NO lo arreglamos en la ronda anterior** — solo se arreglaron pericial y enrich.

---

## PROBLEMA 3: Fallback questions en `generateRoleSpecificQuestions` (lineas 4260-4302)

Las preguntas de fallback estan hardcoded en espanol para cada rol (CEO, CMO, etc.). Si el LLM falla, el usuario siempre ve preguntas en espanol.

---

## PROBLEMA 4: `analyzeDataForInsights` es codigo muerto

Toda la funcion `analyzeDataForInsights()` (lineas 5848-6050+) es efectivamente codigo muerto porque `allRixData` siempre esta vacio. La comprobacion `allRixData.length === 0` en linea 5849 siempre devuelve `{ dataQuality: "insufficient" }`.

Esto significa que:
- Los "hidden patterns" nunca se detectan
- Las preguntas sugeridas basadas en anomalias/divergencias nunca se generan
- El drumroll nunca se genera (porque depende de `allRixData.length > 0`)

---

## PLAN DE CORRECCION (4 cambios)

### Cambio 1: Poblar `allRixData` desde `dataPack.snapshot` con formato correcto

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (linea 5390)

Reemplazar:
```text
const allRixData: any[] = [];
```

Con un mapeo que convierte `dataPack.snapshot` al formato legacy:
```text
const allRixData = dataPack.snapshot.map(s => ({
  "02_model_name": s.modelo,
  "03_target_name": dataPack.empresa_primaria?.nombre || "",
  "05_ticker": dataPack.empresa_primaria?.ticker || "",
  "06_period_from": s.period_from,
  "07_period_to": s.period_to,
  "09_rix_score": s.rix,
  "51_rix_score_adjusted": s.rix_adj,
  "23_nvm_score": s.nvm,
  "26_drm_score": s.drm,
  "29_sim_score": s.sim,
  "32_rmm_score": s.rmm,
  "35_cem_score": s.cem,
  "38_gam_score": s.gam,
  "41_dcm_score": s.dcm,
  "44_cxm_score": s.cxm,
  batch_execution_date: s.period_to,
}));
```

Esto restaura:
- Drumroll generation
- Methodology metadata (modelos, periodos, divergencia)
- Session save con `structured_data_found` correcto
- `analyzeDataForInsights()` funcionando

### Cambio 2: Anadir `language`/`languageName` a la firma de `handleBulletinRequest`

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (linea 4318-4319)

Anadir los parametros que ya se pasan desde la llamada:
```text
streamMode: boolean = false,
language: string = "es",
languageName: string = "Espanol",
```

Y reemplazar el bloque "company not found" (lineas 4359-4367) para usar `t(language, ...)` en lugar de strings hardcoded en espanol.

### Cambio 3: Internacionalizar fallback questions en `generateRoleSpecificQuestions`

**Archivo:** `supabase/functions/chat-intelligence/index.ts` (lineas 4260-4302)

Anadir claves i18n al diccionario `PIPELINE_I18N` para los fallback por rol y usarlas con `t(language, ...)`.

### Cambio 4: NO tocar `analyzeDataForInsights` ni el drumroll

Estos se arreglan automaticamente al poblar `allRixData` (Cambio 1). No requieren modificacion de codigo, solo de datos.

---

## Verificacion: Que NO se rompe

| Componente | Riesgo | Verificacion |
|------------|--------|--------------|
| Pipeline E1-E6 | Ninguno | No se tocan E1, E2, E3, E4, E5 |
| `buildOrchestratorPrompt` | Ninguno | Ya se arreglo en la ronda anterior |
| `buildDepthPrompt` | Ninguno | No se toca |
| Streaming SSE | Ninguno | Solo cambia el contenido de `allRixData` pre-stream |
| Auto-continuation | Ninguno | No depende de `allRixData` |
| Compliance gate | Ninguno | Opera sobre texto, no datos |
| Non-streaming path | Se beneficia | Mismo fix aplica (misma variable) |
| Session save | Se beneficia | `structured_data_found` reportara dato real |
| Vector search | Ninguno | No se toca |
| Graph expansion | Ninguno | No se toca |

## Resumen

| Cambio | Prioridad | Riesgo |
|--------|-----------|--------|
| Poblar `allRixData` desde `dataPack.snapshot` | CRITICO | Bajo (mapeo directo) |
| Firma de `handleBulletinRequest` + i18n | ALTO | Nulo (anadir params al final) |
| Fallback questions i18n | MEDIO | Nulo (solo texto) |

