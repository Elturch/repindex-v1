
# Auditoría y Corrección del Agente Rix - Acceso a Datos

## Diagnostico

He auditado en detalle la Edge Function `chat-intelligence` y encontrado **4 bugs criticos** que, combinados, causan que el agente "no tenga acceso a la base de datos" cuando en realidad hay 35 registros de ChatGPT + IBEX-35 perfectamente disponibles para la semana mas reciente completa.

### Bug 1: Falso positivo en clasificacion off-topic

La funcion `categorizeQuestion` (linea 2123) usa el regex `cuent[oa]` para detectar preguntas fuera de tema (como "cuentame un cuento"). Pero este regex matchea "cuenta" en frases perfectamente validas como **"tomando en cuenta"**, **"teniendo en cuenta"**, **"dar cuenta de"**.

```
Prueba: "Me puedes habilitar un informe...solo tomando en cuenta chatgpt"
Resultado: off_topic (INCORRECTO - deberia ser corporate_analysis)
```

### Bug 2: Seleccion de periodo fragil (BUG PRINCIPAL)

La logica de ranking (lineas 4177-4216) selecciona el periodo MAS RECIENTE como "periodo actual" sin verificar si tiene datos suficientes. En este momento:

```
Periodo 2026-02-03 a 2026-02-10: 6 registros (sweep recien iniciado)
Periodo 2026-02-01 a 2026-02-08: 1050 registros (semana completa)
```

El sistema selecciona el periodo con 6 registros como "actual", y de esos solo 1 sobrevive la deduplicacion en el flujo de carga. El LLM recibe un ranking con 1 empresa y concluye correctamente que hay "cobertura insuficiente" - pero la semana anterior tiene datos completos que deberia estar usando.

### Bug 3: Paginacion rota en la carga de datos

El bucle de paginacion (lineas 3845-3875) intenta cargar hasta 10.000 registros para modo exhaustive, pero `fetchUnifiedRixData` **no acepta un offset** - siempre empieza desde el registro mas reciente. Cada iteracion del bucle devuelve exactamente los mismos 1000 registros por tabla:

```typescript
while (rixOffset < maxRixRecords) {
  const batch = await fetchUnifiedRixData({
    // NO HAY OFFSET - siempre obtiene los mismos datos
    limit: rixBatchSize,
  });
  rixOffset += batch.length; // Se incrementa pero nunca se usa
  if (batch.length < rixBatchSize) break; // Siempre sale aqui
}
```

Resultado: En modo exhaustive, en vez de 10.000 registros, solo se cargan ~2.000.

### Bug 4: El LLM no recibe datos filtrados para la pregunta

Cuando el usuario pide "solo ChatGPT y el IBEX-35", el sistema carga TODOS los datos sin filtrar por modelo ni por indice. El LLM tiene que buscar entre 1996 registros sin filtrar, en un contexto ya de 38.000 caracteres, para encontrar los ~35 registros relevantes. Esto diluye la senal en ruido.

---

## Plan de Correccion

### Archivo: `supabase/functions/chat-intelligence/index.ts`

#### Correccion 1: Regex off-topic (linea 2123)

Reemplazar `cuent[oa]` por patrones mas especificos que eviten falsos positivos con frases comunes:

```typescript
// ANTES (BUGGY):
if (/cuent[oa]|weather|.../i.test(q)) { return 'off_topic'; }

// DESPUES:
if (/\bcuento\b|\bcuentos\b|weather|.../i.test(q)) { return 'off_topic'; }
```

Esto matchea "cuento" y "cuentos" (historias) pero NO "cuenta" (en "tomar en cuenta").

#### Correccion 2: Seleccion de periodo inteligente (lineas 4177-4200)

Anadir un umbral minimo de registros (10) para considerar un periodo como "actual". Si el periodo mas reciente tiene menos de 10 registros, usar el siguiente periodo completo:

```typescript
// Seleccionar el periodo "actual" con suficientes datos
let effectiveCurrentIdx = 0;
const MIN_RECORDS_FOR_CURRENT = 10;

for (let i = 0; i < uniquePeriods.length; i++) {
  const periodData = allRixData.filter(run => getPeriodKey(run) === uniquePeriods[i]);
  if (periodData.length >= MIN_RECORDS_FOR_CURRENT) {
    effectiveCurrentIdx = i;
    break;
  }
}

// Si usamos un periodo que no es el mas reciente, loguear
if (effectiveCurrentIdx > 0) {
  console.log(`Skipping sparse latest period, using ${uniquePeriods[effectiveCurrentIdx]}`);
}

const currentPeriod = uniquePeriods[effectiveCurrentIdx];
const previousPeriod = uniquePeriods[effectiveCurrentIdx + 1];
```

#### Correccion 3: Paginacion funcional con offset (lineas 3845-3875)

Modificar `fetchUnifiedRixData` para aceptar un parametro `offset` y usar `.range()` de Supabase:

```typescript
interface FetchUnifiedRixOptions {
  supabaseClient: any;
  columns: string;
  tickerFilter?: string | string[];
  limit?: number;
  offset?: number; // NUEVO
  logPrefix?: string;
}

// En la funcion:
if (options.offset) {
  queryRix = queryRix.range(options.offset, options.offset + limit - 1);
  queryV2 = queryV2.range(options.offset, options.offset + limit - 1);
}
```

Y actualizar el bucle de paginacion:

```typescript
while (rixOffset < maxRixRecords) {
  const batch = await fetchUnifiedRixData({
    supabaseClient,
    columns: '...',
    limit: rixBatchSize,
    offset: rixOffset, // AHORA SE PASA
    logPrefix
  });
  if (!batch || batch.length === 0) break;
  allRixData.push(...batch);
  rixOffset += batch.length;
  if (batch.length < rixBatchSize) break;
  if (depthLevel === 'quick') break;
}
```

#### Correccion 4: Pre-filtrado inteligente para preguntas con filtros explicitos (nuevo)

Despues de extraer keywords (PASO 1), detectar si la pregunta contiene filtros explicitos de modelo IA o indice bursatil, y aplicarlos al cargar datos:

```typescript
// Detectar filtro de modelo IA
const modelFilters: Record<string, string> = {
  'chatgpt': 'ChatGPT', 'gpt': 'ChatGPT',
  'perplexity': 'Perplexity',
  'gemini': 'Google Gemini', 'deepseek': 'Deepseek',
  'grok': 'Grok', 'qwen': 'Qwen'
};

let requestedModel: string | null = null;
for (const [keyword, modelName] of Object.entries(modelFilters)) {
  if (question.toLowerCase().includes(keyword)) {
    requestedModel = modelName;
    break;
  }
}

// Detectar filtro de indice
let requestedIndex: string | null = null;
if (/ibex.?35/i.test(question)) requestedIndex = 'IBEX-35';
else if (/ibex.?mc/i.test(question)) requestedIndex = 'IBEX-MC';
```

Luego, al construir el ranking (PASO 6.3), aplicar estos filtros:

```typescript
let filteredData = currentWeekData;

if (requestedModel) {
  filteredData = filteredData.filter(r => r["02_model_name"] === requestedModel);
  context += `\n⚡ FILTRO APLICADO: Solo datos de ${requestedModel}\n`;
}

if (requestedIndex) {
  const indexTickers = new Set(
    (companiesCache || [])
      .filter(c => c.ibex_family_code === requestedIndex)
      .map(c => c.ticker)
  );
  filteredData = filteredData.filter(r => indexTickers.has(r["05_ticker"]));
  context += `⚡ FILTRO APLICADO: Solo empresas del ${requestedIndex}\n`;
}
```

---

## Resumen de cambios

| Lineas | Cambio | Impacto |
|--------|--------|---------|
| 2123 | Regex `cuent[oa]` a `\bcuento\b\|\bcuentos\b` | Elimina falsos positivos en frases comunes |
| 85-155 | Anadir parametro `offset` a `fetchUnifiedRixData` | Paginacion funcional para modo exhaustive |
| 3845-3875 | Pasar `offset: rixOffset` en el bucle | Carga real de 10.000 registros en exhaustive |
| 4177-4200 | Umbral minimo de 10 registros para periodo "actual" | Usa semana completa, no sweep parcial |
| 3590-3600 (nuevo) | Deteccion de filtros de modelo/indice | El LLM recibe datos pre-filtrados |
| 4200-4310 | Aplicar filtros al construir ranking | Contexto relevante, sin ruido |

## Resultado esperado

Tras estos cambios, la pregunta "top 5 y bottom 5 RIX solo chatgpt y el ibex35" producira:
- Clasificacion correcta como `corporate_analysis`
- Datos de la semana completa (no del sweep recien iniciado)
- Ranking pre-filtrado con solo las ~35 evaluaciones de ChatGPT para IBEX-35
- Un informe ejecutivo con Top 5 y Bottom 5 basado en datos reales
