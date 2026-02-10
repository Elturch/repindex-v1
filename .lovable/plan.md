

# Plan: Corregir carga de sub-metricas y forzar completitud en informes de indices

## Diagnostico confirmado

### Bug 1: Sub-metricas no se cargan de la base de datos

La query que carga `allRixData` (linea 3899-3912) solo pide estas columnas:

```text
01_run_id, 02_model_name, 03_target_name, 05_ticker,
06_period_from, 07_period_to, 09_rix_score, 51_rix_score_adjusted,
32_rmm_score, 10_resumen, 11_puntos_clave, batch_execution_date
```

Faltan las 7 sub-metricas que el mapeo de ranking (linea 4267-4274) intenta leer:

```text
23_nvm_score, 26_drm_score, 29_sim_score,
35_cem_score, 38_gam_score, 41_dcm_score, 44_cxm_score
```

Resultado: todas aparecen como `-` en la tabla del contexto y el LLM dice "No dispongo de los sub-scores."

### Bug 2: El LLM omite empresas del ranking

Con 1.074 filas en contexto, el LLM decide "resumir" y muestra solo 25 de las 35 empresas IBEX-35 de ChatGPT. Endesa (posicion 3 con RIX 67) y Banco Santander (posicion 5 con RIX 66) quedan fuera, y el informe coloca a Merlin Properties y Banco Sabadell (posicion 6-7 con RIX 65) como "podio". No hay nada en el system prompt que impida este comportamiento.

## Solucion

### Cambio 1 — Anadir sub-metricas al SELECT (linea 3899-3912)

Anadir las 7 columnas que faltan a la query de carga:

```text
columns: `
  "01_run_id", "02_model_name", "03_target_name", "05_ticker",
  "06_period_from", "07_period_to", "09_rix_score", "51_rix_score_adjusted",
  "23_nvm_score", "26_drm_score", "29_sim_score", "32_rmm_score",
  "35_cem_score", "38_gam_score", "41_dcm_score", "44_cxm_score",
  "10_resumen", "11_puntos_clave", batch_execution_date
`
```

### Cambio 2 — Instruccion anti-omision en el system prompt

Buscar el bloque del system prompt donde se dan instrucciones sobre informes y anadir una regla de completitud:

```text
REGLA CRITICA PARA RANKINGS DE INDICES:
Cuando el usuario solicite un ranking de un indice (IBEX-35, IBEX-MC, etc.),
DEBES incluir TODAS las empresas del indice sin excepcion. No resumas,
no omitas, no agrupes. Usa la columna IBEX de la tabla de ranking para
filtrar. Si el indice tiene 35 empresas, la tabla del informe debe tener
exactamente 35 filas.
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Anadir 7 columnas de sub-metricas al SELECT de allRixData (linea 3899); anadir instruccion anti-omision al system prompt |

## Resultado esperado

- Las 8 sub-metricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) apareceran con valores reales en vez de `-`
- El LLM no podra omitir Endesa (67) ni Banco Santander (66) cuando se pida un ranking IBEX-35
- El podio sera correcto: Telefonica (71), Logista/Endesa (67), Banco Santander (66)

