

# Reescritura completa de fetch-smart-suggestions

## Diagnóstico

La función actual consulta la tabla `documents` (vector store) con campos JSONB de metadata, lo cual produce scores de 0 falsos, sin filtro temporal, y genera preguntas que el agente no puede responder. Se reescribe para usar `rix_runs_v2` con datos reales.

## Nota sobre columnas

El usuario indicó columnas como `10_nvm_score`, `04_company_name`, `05_model` pero las columnas reales en `rix_runs_v2` son:
- `03_target_name` (nombre empresa)
- `02_model_name` (modelo IA)
- `05_ticker`, `09_rix_score`, `07_period_to`, `06_period_from`
- `23_nvm_score`, `26_drm_score`, `29_sim_score`, `32_rmm_score`, `35_cem_score`, `38_gam_score`, `41_dcm_score`, `44_cxm_score`

Se usarán los nombres reales del schema.

## Cambios (7 en 1 archivo)

### Archivo: `supabase/functions/fetch-smart-suggestions/index.ts` — reescritura completa

**S1 — Fuente de datos**: Todas las queries pasan de `documents` a `rix_runs_v2`. Primero se obtiene `max(07_period_to)` para identificar la semana más reciente.

**S2 — Filtrar scores nulos/0**: En anomalías dimensionales, se excluyen registros donde cualquier score dimensional sea `null` o `0`. Solo se consideran anomalías con ambos scores > 0.

**S3 — Textos de divergencia**: Se cambia de `"[modelo] da X... ¿quién tiene razón?"` a `"Las IAs divergen mucho sobre [empresa] (rango de X puntos) — ¿por qué las IAs ven realidades tan distintas?"`.

**S4 — Textos de anomalía dimensional**: Se cambia a `"Analiza la reputación de [empresa] — destaca en [métrica_alta] pero tiene debilidad en [métrica_baja]"`. Activa el skill companyProfile.

**S5 — Filtro temporal**: Se calcula `cutoffDate = maxPeriodTo - 14 días` y se filtran todas las queries con `gte("07_period_to", cutoffDate)`.

**S6 — Tipo "análisis completo"**: Se añaden 2-3 sugerencias `"Analiza la reputación de [empresa]"` para empresas con movimientos interesantes o alta divergencia.

**S7 — Empresas con datos completos**: Solo se generan sugerencias para empresas con >= 4 modelos en la semana más reciente.

**Adicional**: Se elimina Q3 (flags de documents), Q5 (sector de documents) y Q6 (cross-index de documents) porque dependían de metadata JSONB que no existe en rix_runs_v2. Se reemplazan por: sector patterns usando join con `repindex_root_issuers.sector_category`, y se mantiene cross-index buscando `ibex_family_code` en la misma tabla de issuers. Los labels dimensionales ya existen en `DIM_LABELS_ES/EN`.

## Flujo de la nueva función

```text
1. Query max(07_period_to) → latestWeek
2. cutoff = latestWeek - 14 days
3. Query rix_runs_v2 WHERE 07_period_to >= cutoff
   SELECT: ticker, model_name, target_name, rix_score, 8 dim scores
4. In-memory processing:
   a. Group by ticker → filter >= 4 models
   b. Anomalías dimensionales (delta >= 30, both > 0)
   c. Divergencias inter-modelo (rango >= 15)
   d. Weekly moves (compare 2 weeks)
   e. "Análisis completo" for top divergent/moved companies
5. Join with repindex_root_issuers for sector/ibex data
6. Shuffle + limit to count
```

## Despliegue
- Reescribir `supabase/functions/fetch-smart-suggestions/index.ts`
- Deploy + test con `supabase--curl_edge_functions`

