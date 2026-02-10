

# Plan: Carga directa de datos del periodo actual — eliminar paginacion cruzada

## Por que hemos fallado 3 veces

El problema no es el truncamiento ni el batch size. El problema es **arquitectural**: la funcion `fetchUnifiedRixData` aplica `.range()` simultaneamente a dos tablas (`rix_runs` con 9.548 filas y `rix_runs_v2` con 4.142 filas), las mezcla con deduplicacion por lotes, y luego filtra en JavaScript por el periodo actual. Este enfoque tiene multiples puntos de fallo:

```text
Estado actual del flujo:
1. Paginar AMBAS tablas con .range(0, 999)     -> 1.000 de v2 (de 1.074 actuales)
2. Paginar AMBAS tablas con .range(1000, 1999) -> 74 restantes de v2 + mezcla legacy
3. Dedup por lote (no global)                  -> Las 74 filas pueden perderse
4. Filtrar en JS por periodo                   -> "Current period: 1.000 records" (FALTAN 74)
5. Empresas perdidas: Endesa, Santander, Iberdrola, Enagas, Ferrovial, Unicaja, Acciona Energia
```

La solucion es **no paginar ciegamente todo el historico** sino **pedir directamente los datos del periodo que necesitamos** con un filtro WHERE en la base de datos.

## Solucion definitiva: Carga directa por periodo

### Cambio 1 — Nueva funcion `fetchCurrentPeriodData`

Crear una funcion dedicada que:
1. Consulta los 2 periodos mas recientes directamente en `rix_runs_v2` (que es la fuente autoritativa para datos actuales)
2. Usa filtro `.eq("06_period_from", periodFrom)` para obtener EXACTAMENTE los registros del periodo
3. Pagina con `.range()` SOLO dentro de esa consulta filtrada (1.074 filas = 2 lotes de 1.000)
4. Garantiza completitud: si la semana tiene 1.074 registros, los carga TODOS

```text
Nuevo flujo:
1. SELECT DISTINCT period_from, period_to FROM rix_runs_v2 ORDER BY DESC LIMIT 2
2. Para cada periodo: paginar con .range() + filtro por periodo
3. Resultado: 1.074/1.074 registros del periodo actual (100%)
4. Sin dedup cruzada, sin mezcla de tablas, sin filas perdidas
```

### Cambio 2 — Reemplazar el bucle de paginacion actual (lineas 3893-3937)

Sustituir todo el bloque de paginacion actual por una llamada a la nueva funcion. El codigo actual:

```text
// ANTES: Pagina ambas tablas ciegamente
while (rixOffset < maxRixRecords) {
  const batch = await fetchUnifiedRixData({ ..., offset: rixOffset });
  // ...problema: mezcla rix_runs + rix_runs_v2 con mismo rango
}
```

Se reemplaza por:

```text
// DESPUES: Carga directa del periodo actual y anterior
// 1. Obtener los 2 periodos mas recientes
const { data: latestPeriods } = await supabaseClient
  .from('rix_runs_v2')
  .select('"06_period_from", "07_period_to"')
  .not('"09_rix_score"', 'is', null)
  .order('batch_execution_date', { ascending: false })
  .limit(1);

// 2. Cargar TODOS los registros del periodo actual con paginacion segura
let allCurrentData = [];
let offset = 0;
while (true) {
  const { data } = await supabaseClient
    .from('rix_runs_v2')
    .select(columns)
    .eq('"06_period_from"', currentPeriodFrom)
    .eq('"07_period_to"', currentPeriodTo)
    .not('"09_rix_score"', 'is', null)
    .range(offset, offset + 999);
  
  allCurrentData.push(...data);
  if (data.length < 1000) break;
  offset += 1000;
}
// Resultado: 1.074/1.074 garantizados
```

### Cambio 3 — Inyectar lista IBEX-35 verificada en el contexto

Ademas de los rankings, inyectar la lista definitiva de las 35 empresas IBEX-35 directamente desde `repindex_root_issuers` para que el LLM no tenga que adivinar:

```text
COMPOSICION OFICIAL IBEX-35 (fuente: repindex_root_issuers):
1. Acciona (ANA) - IBEX-35
2. Acciona Energia (ANE.MC) - IBEX-35
3. Acerinox (ACX) - IBEX-35
...
35. Unicaja Banco (UNI) - IBEX-35

Cuando el usuario pida un ranking IBEX-35, usa EXACTAMENTE estas 35 empresas.
```

### Cambio 4 — Mantener datos historicos (opcional, para tendencias)

Para la semana anterior (necesaria para tendencias), aplicar el mismo patron: filtro por periodo + paginacion local. Esto reemplaza la carga masiva de 6.128 registros por ~2.148 registros relevantes (2 semanas).

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | (1) Nueva funcion `fetchCurrentPeriodData` que consulta directamente por periodo con filtro WHERE; (2) Reemplazar bucle de paginacion cruzada en lineas 3893-3937; (3) Inyectar lista IBEX-35 verificada desde companiesCache en el contexto del LLM; (4) Cargar periodo anterior con el mismo patron para tendencias |

## Resultado esperado

| Metrica | Antes (roto) | Despues (solucion) |
|---------|-------------|-------------------|
| Registros periodo actual | 1.000 de 1.074 (93%) | 1.074 de 1.074 (100%) |
| Empresas IBEX-35 con dato | 28 de 35 | 35 de 35 |
| Registros cargados total | 6.128 (5.054 innecesarios) | ~2.148 (solo 2 semanas) |
| Endesa, Santander, Iberdrola | "No dispongo de ese dato" | Datos reales con score |
| Tiempo de carga | ~3-4s (6 lotes) | ~1-2s (2-3 lotes) |

## Por que esta solucion es definitiva

1. **Elimina la causa raiz**: Ya no paginamos ciegamente. Pedimos exactamente lo que necesitamos
2. **Sin dedup cruzada**: Solo consultamos rix_runs_v2 (fuente autoritativa). Sin mezcla de tablas
3. **Garantia matematica**: Si la DB tiene 1.074 registros para el periodo, los obtenemos TODOS
4. **Lista IBEX-35 explicita**: El LLM no puede equivocarse sobre la composicion del indice
5. **Mas rapido**: Cargamos 2.148 registros relevantes en vez de 6.128 con historico innecesario
6. **Escalable**: Funciona igual si el censo crece a 200, 300 o 500 empresas

