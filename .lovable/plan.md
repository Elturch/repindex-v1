## Diagnóstico

La tarjeta **Top 5 No Cotizadas** del home aparece con "No hay datos disponibles" aunque hay 41 empresas no cotizadas con análisis ChatGPT para la última semana (2026-05-17).

Causa raíz, en `src/hooks/useLandingTopFives.ts` (línea 151), dentro de `fetchV2WeekEnriched`:

```ts
const score = r["52_cxm_excluded"] ? r["51_rix_score_adjusted"] : r["09_rix_score"];
if (score === null || score === undefined) return null;
```

Verificación en BD para semana 2026-05-17 / ChatGPT:

| cotiza | total | cxm_excluded | excluded_with_adj | excluded_null_adj |
|---|---|---|---|---|
| false | 41 | 41 | 0 | **41** |
| true | 134 | 3 | 0 | 3 |

Todas las no cotizadas tienen `52_cxm_excluded = true` y `51_rix_score_adjusted = NULL`, pero sí tienen `09_rix_score`. El hook descarta esos registros y por eso `topUntraded` queda vacío. Las 3 cotizadas con la misma anomalía no se notan porque hay otras 131 cotizadas válidas. Las tarjetas que se nutren de no cotizadas (Top Movers UP/DOWN, Top 5 Resto) sí muestran filas porque mezclan cotizadas y no cotizadas.

## Cambio

Un único archivo, una línea:

`src/hooks/useLandingTopFives.ts` — sustituir la asignación de `score` por un fallback robusto:

```ts
const adjusted = r["51_rix_score_adjusted"];
const raw = r["09_rix_score"];
const score = r["52_cxm_excluded"]
  ? (adjusted ?? raw)   // si el ajustado por CXM es null, usar el bruto
  : (raw ?? adjusted);
if (score === null || score === undefined) return null;
```

Con esto las 41 no cotizadas aparecerán en `topUntraded`, ordenadas por RIX descendente.

## Validación

1. Recargar el home, scroll a "Resto del Mercado".
2. La tarjeta **Top 5 No Cotizadas** debe mostrar (con ChatGPT): Almirall 75, Mutua Madrileña 68, Sanitas 65, Viamed 65, Quirónsalud 64.
3. Las demás tarjetas no deben cambiar de comportamiento.

## Fuera de alcance

- No tocamos la BD ni el campo `51_rix_score_adjusted`. Si en algún momento se quiere que las no cotizadas tengan score ajustado real, eso requiere otra migración / re-cálculo del pipeline V2 (no es trivial y no es lo que pide el usuario).
- No tocamos `MiniTablesGrid.tsx`, prompts, ni nada del agente.
