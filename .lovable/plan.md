
# Inyectar la regla del snapshot dominical al agente y robustecer la selección de períodos

## El problema raíz

Los snapshots se ejecutan siempre los **domingos** y `batch_execution_date` lo acredita: los snapshots completos tienen `batch_execution_date` en domingo (Feb 15, Feb 8, Feb 1, Jan 25, Jan 18…). Esto es una regla de negocio fundamental que el sistema no conoce.

La BD tiene dos tipos de períodos:
- **Snapshots reales** (domingos): 1.000+ registros, 6 modelos, ~175 empresas, `batch_execution_date` en domingo.
- **Períodos fragmentados** (pruebas o desfases v1/v2): pocas empresas, fechas no dominicales.

El guardrail actual `MIN_RECORDS_FOR_CURRENT = 10` es demasiado bajo y no usa este conocimiento. Cuando hay períodos fragmentados como el fantasma `2026-02-03 → 2026-02-10` (6 registros de CEP.MC), el sistema a veces los confunde. Y los datos de rix_runs (v1) y rix_runs_v2 comparten la misma semana con `period_from` distintos (ej: `2026-01-18` vs `2026-01-19`), creando "períodos duplicados" invisibles que fragmentan el conteo.

## Dos cambios: código + system prompt

---

### Cambio 1 — Función de selección de período basada en domingos

**Archivo:** `supabase/functions/chat-intelligence/index.ts` — líneas 4509-4534

Reemplazar la lógica de selección de período actual por una función `selectCanonicalPeriod()` que:

1. Agrupa todos los registros por `batch_execution_date` (no por `period_to`).
2. Para cada fecha de batch, comprueba si es domingo (`getDay() === 0`).
3. Selecciona la `batch_execution_date` más reciente que sea domingo Y tenga al menos 180 registros (30 empresas × 6 modelos = snapshot mínimamente significativo).
4. Si ninguna fecha dominical tiene ≥180 registros, fallback: usar la fecha con más registros independientemente del día (cubre pruebas o emergencias).
5. Una vez identificada la `batch_execution_date` canónica, filtra todos los records de `allRixData` que tengan esa fecha → ese es el "snapshot actual".

```
Nueva lógica (pseudocódigo):
  
  groupByBatchDate = Map<date, records[]>
  
  sundays = groupByBatchDate.entries()
    .filter(([date, _]) => isSunday(date) && records.length >= 180)
    .sort(descending by date)
  
  canonicalDate = sundays[0]?.date
  
  if (!canonicalDate) {
    // Fallback: la fecha con más registros
    canonicalDate = max(groupByBatchDate, by record count)
  }
  
  currentWeekData = allRixData.filter(r => r.batch_execution_date === canonicalDate)
  previousDate = sundays[1]?.date  // el domingo anterior
  previousWeekData = allRixData.filter(r => r.batch_execution_date === previousDate)
```

Esto elimina de raíz el problema del período fantasma: el fantasma `2026-02-03 → 2026-02-10` tiene `batch_execution_date = 2026-02-08` (sábado), no un domingo → es ignorado automáticamente.

También soluciona el problema v1/v2 con `period_from` distintos para la misma semana: ambas tablas comparten `batch_execution_date` (el domingo), así que se agrupan correctamente.

---

### Cambio 2 — Inyectar la norma del snapshot dominical en el system prompt

**Archivo:** `supabase/functions/chat-intelligence/index.ts` — línea ~4804 (inicio del system prompt principal)

Añadir un bloque de **Conocimiento Institucional del Sistema** justo después de la firma del agente:

```
═══════════════════════════════════════════════════════════════════════
           ARQUITECTURA DE DATOS: REGLAS CRÍTICAS DE NEGOCIO
═══════════════════════════════════════════════════════════════════════

REGLA 1 — LOS SNAPSHOTS SON SEMANALES Y SIEMPRE EN DOMINGO:
El sistema RepIndex ejecuta un barrido completo CADA DOMINGO. Esto genera 
un snapshot con ~175 empresas × 6 modelos de IA = ~1.050 registros.
Cada snapshot tiene una fecha única de ejecución (batch_execution_date) 
que siempre es un domingo. NUNCA digas que solo un modelo ha evaluado 
esta semana si el snapshot está completo: si hay 1.050 registros con 6 
modelos, todos evaluaron.

REGLA 2 — PERÍODOS PARCIALES Y DE PRUEBA:
Pueden existir registros con fechas no dominicales. Son pruebas técnicas 
o barridos parciales. NUNCA los uses como referencia de "la semana actual".
La semana actual es siempre el snapshot dominical más reciente y completo 
(el que tiene más registros con batch_execution_date en domingo).

REGLA 3 — COBERTURA DE MODELOS:
Un snapshot completo tiene SIEMPRE 6 modelos: ChatGPT, Perplexity, Gemini, 
DeepSeek, Grok y Qwen. Si el contexto te dice que solo N modelos están 
disponibles siendo N < 4, estás viendo datos parciales o de prueba. 
Decláralo explícitamente al usuario.

REGLA 4 — TRAZABILIDAD TEMPORAL:
Cuando cites datos, siempre referencia la fecha del snapshot (domingo) 
no el period_from/period_to. Ejemplo correcto: "En el snapshot del 15 
de febrero de 2026..." Esto da al usuario certeza de cuándo se tomó la 
fotografía de la reputación.
```

---

### Cambio 3 — Añadir aviso de cobertura al contexto construido

**Archivo:** `supabase/functions/chat-intelligence/index.ts` — tras la selección de período (línea ~4535)

Añadir un bloque de diagnóstico en el contexto que el agente recibe:

```typescript
const modelsInCurrentSnapshot = new Set(currentWeekData.map(r => r["02_model_name"]));
const snapshotDate = new Date(currentWeekData[0]?.batch_execution_date);
const isSundaySnapshot = snapshotDate.getDay() === 0;

context += `\n📅 SNAPSHOT ACTIVO:\n`;
context += `- Fecha de ejecución: ${snapshotDate.toISOString().split('T')[0]} (${isSundaySnapshot ? 'Domingo ✅' : 'No es domingo ⚠️ — puede ser barrido de prueba'})\n`;
context += `- Modelos con datos: ${Array.from(modelsInCurrentSnapshot).join(', ')} (${modelsInCurrentSnapshot.size}/6)\n`;
context += `- Registros totales: ${currentWeekData.length}\n`;
context += `- Empresas cubiertas: ${new Set(currentWeekData.map(r => r["05_ticker"])).size}\n`;

if (modelsInCurrentSnapshot.size < 4) {
  context += `⚠️ AVISO CRÍTICO: Solo ${modelsInCurrentSnapshot.size} modelos disponibles. Este snapshot puede estar incompleto.\n`;
}
```

---

## Qué cambia en la BD (limpieza puntual)

El registro fantasma `(period_from: 2026-02-03, period_to: 2026-02-10, batch: 2026-02-08 sábado)` deja de causar problemas porque la nueva lógica lo ignora por ser sábado. No es estrictamente necesario borrarlo, pero es recomendable para higiene de datos.

---

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| `supabase/functions/chat-intelligence/index.ts` | (1) Nueva función `selectCanonicalPeriod()` por `batch_execution_date` dominical (2) Bloque de conocimiento institucional en system prompt (3) Bloque de diagnóstico del snapshot en contexto |

## Lo que NO cambia

- Lógica de `fetchUnifiedRixData` (sigue fusionando v1+v2 correctamente).
- Todos los roles, incluyendo el nuevo rol pericial.
- El guardrail IBEX-35 y los filtros de modelo.
- El streaming y el SSE.

## Despliegue

Tras los cambios, se despliega `chat-intelligence`.
