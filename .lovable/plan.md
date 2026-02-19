
# Plan: Habilitar evolución multi-semana en el chat (4 semanas pedidas por el usuario)

## Los dos problemas encadenados

### Problema 1 — PostgREST trunca el fetch inicial a 1.000 filas (bug ya identificado)

En `fetchUnifiedRixData` (línea 112), la rama para `offset=0` usa `.limit()` en lugar de `.range()`. PostgREST tiene un límite de servidor de 1.000 filas que ignora silenciosamente cualquier `.limit(N)` mayor que 1.000 cuando no se usa `.range()`.

Con 1.050 registros por domingo, el fetch solo trae el primer domingo. `selectCanonicalPeriod` ve 1 fecha → `sundayDates = ["2026-02-15"]` → `previousDate = null`. Con 4 domingos a 1.050 registros cada uno = 4.200 registros totales, el fetch inicial necesita obligatoriamente `.range(0, 4999)`.

**Corrección (líneas 108-113):**
```typescript
// Antes:
if (offset > 0) {
  query = query.range(offset, offset + limit - 1);
} else {
  query = query.limit(Math.max(limit, 2500));  // BUG: trunca a 1.000
}

// Después:
const effectiveLimit = Math.max(limit, 5000); // 5 domingos × 1.050 = 5.250
query = query.range(offset, offset + effectiveLimit - 1);
```

Con 5.000 como límite efectivo, el sistema trae los 5.174 registros existentes y `sundayDates` tiene los 5 domingos canónicos disponibles.

---

### Problema 2 — `detectedCompanyFullData` solo muestra el snapshot más reciente (pérdida de histórico)

En la sección 6.1 (líneas 4413-4420), aunque se cargan hasta 120 registros por empresa (6 modelos × 20 semanas), el código filtra deliberadamente por `latestDate` y descarta todas las semanas anteriores:

```typescript
// Línea 4416-4421 — elimina todo excepto el domingo más reciente:
const latestDate = sortedDates[0] || null;
const latestRecords = latestDate
  ? records.filter((r: any) => r.batch_execution_date?.toString().split('T')[0] === latestDate)
  : records.slice(0, 6);
const recordsToShow = latestRecords.length >= 1 ? latestRecords : records.slice(0, 6);
```

Cuando el LLM recibe el contexto, solo ve los datos de la semana del 15-feb para la empresa, aunque la BD tenga 5 semanas completas. El LLM no puede narrar una evolución de 4 semanas si nunca recibe esos datos.

**Corrección:** Detectar si la pregunta contiene palabras clave de evolución/tendencia ("últimas N semanas", "evolución", "tendencia", "histórico", "mes", "4 semanas"...) y en ese caso incluir en el contexto todas las semanas disponibles de la empresa, no solo la última.

```typescript
// Detectar intención de análisis multi-semana
const isMultiWeekRequest = /\b(evoluci[oó]n|tendencia|hist[oó]rico|[úu]ltimas?\s+\d+\s+semanas?|[úu]ltimo\s+mes|semanas?\s+anteriores?|cronol[oó]gic|progres[oió]n)\b/i.test(question);

// Número de semanas solicitadas (por defecto 4)
const requestedWeeks = (() => {
  const match = question.match(/[úu]ltimas?\s+(\d+)\s+semanas?/i);
  return match ? Math.min(parseInt(match[1]), 5) : 4; // máximo 5 (lo que hay en BD)
})();

// En lugar de filtrar solo latestDate, incluir N semanas si es multi-semana
const datesToShow = isMultiWeekRequest
  ? sortedDates.slice(0, requestedWeeks)  // las N semanas pedidas
  : [sortedDates[0]];                      // solo la última (comportamiento actual)

const recordsToShow = records
  .filter((r: any) => datesToShow.includes(r.batch_execution_date?.toString().split('T')[0]))
  .sort((a: any, b: any) => {
    // Primero por fecha DESC, luego por modelo ASC
    const dateDiff = b.batch_execution_date?.toString().localeCompare(a.batch_execution_date?.toString());
    return dateDiff !== 0 ? dateDiff : (a["02_model_name"] || '').localeCompare(b["02_model_name"] || '');
  });
```

---

### Problema 3 (colateral) — `selectCanonicalPeriod` solo devuelve 2 fechas

La función actualmente solo expone `canonicalDate` y `previousDate` (máximo 2 semanas). Para consultas de 4 semanas, hay que exponer `sundayDates` completo (ya existe en el array pero no se usa más allá de las 2 primeras posiciones) y construir el contexto con datos de cada semana solicitada.

**Corrección:** Añadir al bloque de contexto del snapshot las semanas históricas cuando `isMultiWeekRequest = true`:

```typescript
if (isMultiWeekRequest && sundayDates.length > 1) {
  context += `\n📅 HISTÓRICO DISPONIBLE (${sundayDates.length} semanas):\n`;
  sundayDates.forEach((date, i) => {
    const weekData = allRixData.filter(r => r.batch_execution_date?.toString().split('T')[0] === date);
    const models = new Set(weekData.map(r => r["02_model_name"]));
    context += `- Semana ${i + 1}: ${date} → ${weekData.length} registros, ${models.size} modelos\n`;
  });
}
```

---

## Archivos a modificar

| Archivo | Líneas | Cambio |
|---|---|---|
| `supabase/functions/chat-intelligence/index.ts` | 108-113 | Cambiar `.limit()` a `.range()` con efectiveLimit = 5.000 |
| `supabase/functions/chat-intelligence/index.ts` | 4413-4421 | Añadir detección de `isMultiWeekRequest` y mostrar N semanas en contexto empresa |
| `supabase/functions/chat-intelligence/index.ts` | 4541-4551 | Añadir bloque de histórico multi-semana al contexto del snapshot |

## Lo que NO cambia

- La tabla `rix_runs` — intacta
- El dashboard y los hooks frontend — sin cambios
- La lógica de `selectCanonicalPeriod` — correcta, ya filtra domingos con ≥180 registros
- El `fullDataColumns` de empresa (línea 3965) — ya incluye `batch_execution_date` y los 6 modelos

## Datos disponibles en BD (confirmados)

| Domingo | Registros | Modelos |
|---------|-----------|---------|
| 2026-02-15 | 1.050 | 6 |
| 2026-02-08 | 1.056 | 6 |
| 2026-02-01 | 1.062 | 6 |
| 2026-01-25 | 969 | 6 |
| 2026-01-18 | 1.037 | 6 |

Con el fix del `.range()`, los 5.174 registros estarán disponibles para el chat. Una petición de "evolución de las últimas 4 semanas de AIRTIFICIAL" recibirá en contexto 6 modelos × 4 domingos = 24 filas de datos, más los textos brutos de cada modelo por semana.

## Resultado esperado

- "Dame la evolución de las últimas 4 semanas de Telefónica" → el LLM recibe datos de los 4 domingos con los 6 modelos cada uno
- "¿Cómo ha evolucionado el mercado en enero?" → el agente compara los 4 domingos de enero con métricas concretas
- La pericial comparada (2 semanas) también se beneficia del fix del `.range()` que corrige el truncamiento
