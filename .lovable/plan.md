

## Plan: Restaurar InfoBar y fuentes verificadas en el pipeline legacy (E1-E6)

### Problema diagnosticado

Hay dos problemas independientes, ambos causados porque la consulta ("¿Qué empresa del ibex 35 tiene más consenso entre las IAs?") fue procesada por el **pipeline legacy E1-E6** (no por Skills), y este pipeline no genera los metadatos necesarios:

1. **InfoBar desaparecida**: El `report_context` solo se construye dentro de `buildDataPackFromSkills()` (linea ~2118). El E2 legacy `buildDataPack()` nunca asigna `report_context` al pack. Resultado: `dataPack.report_context` es `undefined`, y el evento SSE `done` envía `reportContext: null`. Tanto la UI como el HTML exportado quedan sin InfoBar.

2. **Fuentes verificadas vacías**: `detectedCompanyFullData` se alimenta de `_rawRunsForSources` (solo existe en Skills) o `allRixData` (mapeado desde `dataPack.snapshot`). Pero el mapeo en linea ~8813 **no incluye** los campos `20_res_gpt_bruto` ni `21_res_perplex_bruto`, que son los que contienen las URLs citadas por las IAs. Además, para consultas INDEX, `dataPack.snapshot` contiene datos agregados por empresa (medianas), no los runs individuales con textos brutos.

### Cambios

**Archivo**: `supabase/functions/chat-intelligence/index.ts`

#### Cambio 1: Construir `report_context` en `buildDataPack()` (legacy E2)

Antes del `return pack` en la ruta INDEX (~linea 4205) y en la ruta COMPANY (~linea 4540), añadir la construcción de `report_context` con los mismos campos que usa el Skills builder:
- `company`, `sector`, `user_question`, `date_from`, `date_to`, `timezone`, `models`, `models_count`, `sample_size`, `weeks_analyzed`

Estos datos ya existen en el pack: `empresa_primaria`, `snapshot`, `ranking`, las fechas de `indexData`/`companyData`.

#### Cambio 2: Preservar runs con textos brutos para extracción de fuentes en ruta INDEX

En la ruta INDEX del E2, guardar los runs que contengan `20_res_gpt_bruto` o `21_res_perplex_bruto` en `pack._rawRunsForSources`. Actualmente estos campos **no se consultan** en el `indexColumns` (linea 3923). Se deben añadir al SELECT y almacenar una muestra representativa (ej. top 10 empresas por ranking) para que `extractSourcesFromRixData()` pueda extraer URLs.

#### Cambio 3: Incluir campos brutos en el fetch de la ruta INDEX

Añadir `"20_res_gpt_bruto", "21_res_perplex_bruto"` al `indexColumns` del E2 INDEX route para que los datos lleguen.

**Archivo**: `supabase/functions/chat-intelligence/index.ts` -- 3 ediciones puntuales.

**Redeploy**: `chat-intelligence`.

### Resultado esperado

- La InfoBar aparecerá tanto en UI como en exportación HTML para consultas INDEX/sector procesadas por el pipeline legacy.
- Las fuentes verificadas se extraerán de los textos brutos de las top empresas del ranking, mostrando la bibliografía en el informe.

