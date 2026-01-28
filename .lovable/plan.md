

# Plan de Auditoría y Corrección del Sistema de Datos RIX

## Diagnóstico Confirmado

### Estado Actual de los Datos

**Base de datos `repindex_root_issuers`**: 174 empresas totales
- 133 cotizadas en bolsa
- 41 no cotizadas (empresas privadas, grupos hospitalarios, etc.)
- Las 8 empresas de salud añadidas el 22 de enero ya tienen datos

**Tabla `rix_runs` (legacy - Make.com)**:
- 9,548 registros totales
- 169 empresas únicas (5 faltantes son las más recientes)
- 4 modelos de IA: ChatGPT, Perplexity, Gemini, DeepSeek
- 22 semanas de historial (octubre 2025 → enero 2026)

**Tabla `rix_runs_v2` (Lovable)**:
- 2,082 registros totales
- 174 empresas únicas (cobertura completa)
- 6 modelos de IA: + Grok, Qwen
- 4 semanas de historial (16-19 enero 2026)
- 98 empresas con datos de precio de acción

**Vector Store**: 11,862 documentos indexados (fusionado correctamente)

### Problemas Críticos Identificados

1. **El endpoint `rix-regression-analysis` SOLO consulta `rix_runs`**
   - Ignora completamente los datos de V2
   - Por eso el Agente Rix reporta "154 empresas" en vez de 174
   - Falta el contexto de Grok y Qwen en las correlaciones

2. **Falta paginación inteligente en la regresión**
   - El chat-intelligence tiene paginación configurada (2,000-10,000 registros)
   - Pero la regresión usa un límite fijo de 1,000 por tabla

3. **18 empresas faltan en la semana 2026-01-18**:
   - 8 empresas de salud (añadidas después del barrido)
   - 10 empresas privadas internacionales
   - Esto es normal: se añadieron post-barrido

---

## Plan de Corrección

### 1. Actualizar `rix-regression-analysis` para fusionar V2

Modificar el endpoint para usar la misma lógica de fusión que `chat-intelligence`:

**Cambios técnicos:**
- Reemplazar la consulta simple a `rix_runs` por una fusión con `rix_runs_v2`
- Priorizar V2 como fuente autoritativa para semanas recientes
- Agregar los 6 modelos de IA al análisis estadístico
- Incluir las 174 empresas en los cálculos

**Pseudocódigo:**
```
text
// ANTES: Solo rix_runs
const data = await supabase.from('rix_runs').select(...)

// DESPUÉS: Fusión con V2
const [rixData, v2Data] = await Promise.all([
  fetchAllFromTable('rix_runs', ...),
  fetchAllFromTable('rix_runs_v2', ...)
])
const unified = deduplicateWithV2Priority(rixData, v2Data)
```

### 2. Mejorar paginación en la regresión

Implementar el mismo patrón de paginación que ya existe en `fetchUnifiedRixData`:

```
text
// Paginar ambas tablas para obtener TODOS los registros
async function fetchAllPaginated(table, columns) {
  const pageSize = 1000
  let allData = []
  let offset = 0
  
  while (true) {
    const { data } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1)
    
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return allData
}
```

### 3. Actualizar conteo de empresas dinámicamente

Modificar la regresión para obtener el conteo real de issuers:

```
text
// Obtener conteo real de empresas
const { count } = await supabase
  .from('repindex_root_issuers')
  .select('*', { count: 'exact', head: true })
```

### 4. Añadir validación de cobertura

Incluir en la respuesta de regresión un reporte de cobertura:

```
text
{
  dataProfile: {
    totalIssuers: 174,
    issuersWithData: 174,
    issuersWithPrices: 133,
    coveragePercent: 100,
    modelsIncluded: ["ChatGPT", "Perplexity", "Gemini", "DeepSeek", "Grok", "Qwen"]
  }
}
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-regression-analysis/index.ts` | Fusionar datos de V2, paginación, conteo dinámico |
| `supabase/functions/chat-intelligence/index.ts` | Verificar que el contexto de regresión use datos fusionados |

---

## Resultado Esperado

Después de la implementación:

- El Agente Rix reportará **174 empresas** (no 154)
- Las correlaciones incluirán datos de los **6 modelos de IA**
- El análisis estadístico usará **~11,600 registros** históricos
- Las empresas de salud y privadas aparecerán en los análisis
- Los precios de acción de las 133 cotizadas se usarán como ancla real

---

## Verificación Post-Implementación

1. Ejecutar endpoint de regresión y verificar:
   - `totalRecords` ≈ 11,600
   - `companiesWithPrices` = 133
   - `modelsIncluded` = 6 modelos

2. Preguntar al Agente Rix: "¿Cuántas empresas tienes en tu base de datos?" → Debe responder 174

3. Verificar en `/admin` que el panel de Vector Store muestre cobertura completa

