

# Fix: Datos en blanco en Chat Intelligence (ultimo barrido)

## Diagnostico confirmado con datos reales

La tabla `rix_runs` (legacy) termina el **25 de enero 2026**. El barrido actual (1-8 Feb) solo existe en `rix_runs_v2`. El dashboard funciona porque usa scores numericos. El chat falla por 3 bugs especificos:

### Bug 1: Busqueda full-text solo consulta tabla legacy
- **Linea 3654**: `supabaseClient.from('rix_runs')` — ignora completamente `rix_runs_v2`
- **Impacto**: Cuando el usuario pregunta por el ultimo barrido, las keywords no encuentran nada reciente. Los 2013 resultados que muestra el log provienen de semanas antiguas

### Bug 2: Columnas Grok/Qwen ausentes en fullDataColumns
- **Lineas 3719-3751**: Solicita `20_res_gpt_bruto`, `21_res_perplex_bruto`, `22_res_gemini_bruto`, `23_res_deepseek_bruto` pero NO `respuesta_bruto_grok` ni `respuesta_bruto_qwen`
- **Dato real**: En V2, Grok tiene 179 registros con `respuesta_bruto_grok` y Qwen 179 con `respuesta_bruto_qwen` — pero no se solicitan
- **Impacto**: 2 de 6 modelos aparecen sin texto en el informe

### Bug 3: `25_explicaciones_detalladas` siempre NULL en V2
- **Dato real**: 0 registros con este campo en V2 (confirmado en las 6 IAs)
- Solo `22_explicacion` tiene datos (179 por modelo)
- **Impacto**: Las secciones de explicacion detallada salen vacias

## Solucion

### Cambio 1: Busqueda full-text dual (PASO 2)

Duplicar la busqueda para que consulte ambas tablas en paralelo y combine resultados:

```text
Antes:
  supabaseClient.from('rix_runs').select(...).or(ilike filters)

Despues:
  Promise.all([
    supabaseClient.from('rix_runs').select(...).or(ilike filters).limit(5000),
    supabaseClient.from('rix_runs_v2').select(...columns + grok/qwen)
      .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
      .or(ilike filters).limit(5000)
  ])
  // Fusionar, deduplicar (V2 prioridad)
```

**Nota**: La query de V2 en PASO 2 necesita incluir tambien `respuesta_bruto_grok` y `respuesta_bruto_qwen` en las columnas y en los filtros ilike.

### Cambio 2: Anadir columnas Grok/Qwen a fullDataColumns (PASO 3)

```text
Antes (linea 3719):
  "23_res_deepseek_bruto",
  "22_explicacion",

Despues:
  "23_res_deepseek_bruto",
  "respuesta_bruto_grok",
  "respuesta_bruto_qwen",
  "22_explicacion",
```

Como estas columnas existen en `rix_runs_v2` pero NO en `rix_runs`, hay dos opciones:
- **Opcion A**: Modificar `fetchUnifiedRixData` para aceptar columnas extra solo para V2
- **Opcion B** (mas simple): Anadir las columnas a `rix_runs` como columnas vacias (sin datos) para que la query no falle

Se recomienda **Opcion A** ya que no requiere migracion de la tabla legacy.

### Cambio 3: Fallback de explicaciones detalladas

En la construccion del contexto (PASO 6), usar `22_explicacion` cuando `25_explicaciones_detalladas` sea null:

```text
const detailedExplanation = r["25_explicaciones_detalladas"] || 
  (r["22_explicacion"] ? { general: r["22_explicacion"] } : null);
```

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/chat-intelligence/index.ts` | PASO 2: busqueda dual; PASO 3: columnas extra; fetchUnifiedRixData: soporte v2ExtraColumns; PASO 6: fallback explicaciones |

## Detalles tecnicos

### Modificacion de fetchUnifiedRixData

Anadir parametro opcional `v2ExtraColumns`:

```text
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  v2ExtraColumns?: string;   // <-- NUEVO
  tickerFilter?: string | string[];
  limit?: number;
  logPrefix?: string;
}

// En la funcion:
const v2Columns = options.v2ExtraColumns 
  ? `${columns}, ${options.v2ExtraColumns}` 
  : columns;

// Usar v2Columns solo para la query de rix_runs_v2
let queryV2 = supabaseClient.from('rix_runs_v2').select(v2Columns)...
```

### PASO 2: Query dual con columnas V2

La busqueda full-text en V2 incluira filtros adicionales para las columnas de Grok/Qwen:

```text
.or(`"10_resumen".ilike.${sp},"20_res_gpt_bruto".ilike.${sp},...,"respuesta_bruto_grok".ilike.${sp},"respuesta_bruto_qwen".ilike.${sp},"22_explicacion".ilike.${sp}`)
```

### Impacto esperado

- Las tablas del chat mostraran datos de TODAS las semanas incluyendo la actual
- Los 6 modelos tendran texto bruto disponible para el LLM
- Las explicaciones detalladas usaran `22_explicacion` como fuente
- Sin impacto en el pipeline de barrido ni en el dashboard

