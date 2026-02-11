

# Plan: Blindar el pipeline SQL-to-Narrative contra duplicados y eliminar carga masiva residual

## Diagnostico

El pipeline SQL-to-Narrative esta implementado (PASO 5B, lineas 3978-4104), pero tiene dos problemas criticos:

1. **Carga masiva residual**: El PASO 5 (lineas 3888-3976) sigue cargando ~1.074 registros de `rix_runs_v2` ANTES de ejecutar el pipeline SQL. Estos datos se usan como fallback y en busquedas por keywords, pudiendo inyectar datos conflictivos en el contexto del LLM junto con los resultados SQL limpios.

2. **Sin deduplicacion en el prompt SQL**: El prompt de generacion SQL (linea 4031) usa un JOIN flexible que puede devolver AMBOS registros si existen `ANE` y `ANE.MC` para la misma empresa y periodo. No hay clausula `NOT EXISTS` para priorizar el ticker canonico.

3. **Datos del keyword search contaminan**: Las lineas 4300-4392 inyectan "DATOS COMPLETOS DE EMPRESAS MENCIONADAS" desde `allRixData` (los 1.074 registros), que pueden incluir duplicados y contradicen los datos limpios del SQL.

## Cambios a realizar

### Cambio 1 -- Anadir regla de deduplicacion al prompt SQL (lineas 4029-4037)

Agregar una regla al SQL schema prompt que instruya al generador SQL a excluir tickers cortos cuando existe la version canonica (.MC):

```text
REGLA 9 (DEDUPLICACION): Si existen registros con ticker "X" y "X.MC" para 
el mismo periodo y modelo, usar SOLO el ticker que coincida EXACTAMENTE con 
repindex_root_issuers.ticker. Anadir:
WHERE NOT EXISTS (
  SELECT 1 FROM rix_runs_v2 r2 
  WHERE r2."05_ticker" = r."05_ticker" || '.MC' 
  AND r2."06_period_from" = r."06_period_from" 
  AND r2."02_model_name" = r."02_model_name"
  AND r2."09_rix_score" IS NOT NULL
)
```

### Cambio 2 -- Reducir carga masiva del PASO 5 (lineas 3888-3976)

En lugar de eliminar completamente la carga (se necesita para descubrir periodos y para el fallback), reducir a consultar SOLO los metadatos necesarios:
- Mantener la consulta de descubrimiento de periodos (lineas 3920-3937)
- Reducir las columnas cargadas al minimo: solo ticker, modelo, score, periodo (sin resumen ni puntos clave)
- Esta data solo se usa como fallback si el SQL pipeline falla

### Cambio 3 -- Evitar que el keyword search inyecte datos duplicados (lineas 4330-4392)

Cuando se construyen los "DATOS COMPLETOS DE EMPRESAS MENCIONADAS", filtrar por ticker canonico usando `companiesCache`. Si una empresa aparece con dos tickers, solo usar el que coincide con la tabla maestra.

### Cambio 4 -- Actualizar los ejemplos SQL del prompt (lineas 4039-4050)

Incluir la clausula `NOT EXISTS` en TODOS los ejemplos SQL para que el LLM la replique consistentemente.

## Detalle tecnico

### Archivo: `supabase/functions/chat-intelligence/index.ts`

| Seccion | Lineas | Cambio |
|---------|--------|--------|
| SQL schema prompt - reglas | 4029-4037 | Agregar regla 9 de deduplicacion con NOT EXISTS |
| SQL schema prompt - ejemplos | 4039-4050 | Actualizar los 4 ejemplos SQL con clausula NOT EXISTS |
| Carga masiva PASO 5 | 3897-3917 | Reducir columnas a minimo (sin resumen/puntos_clave) |
| Keyword search context | 4330-4392 | Filtrar duplicados por ticker canonico antes de inyectar |

## Resultado esperado

- El SQL generado SIEMPRE excluye tickers duplicados, priorizando el canonico
- Si `ANE` y `ANE.MC` coexisten, solo `ANE.MC` aparece en los resultados
- Los datos del keyword search no contradicen los datos SQL
- La carga masiva se reduce en peso pero mantiene su funcion de fallback
- Acciona (ANA, score 55) y Acciona Energia (ANE.MC, score 46) nunca se confunden

