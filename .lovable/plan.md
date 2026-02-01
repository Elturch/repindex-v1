
# Plan: Arreglar repair_search y Aumentar Velocidad de Procesamiento

## Diagnóstico Confirmado

| Problema | Causa Raíz | Impacto |
|----------|------------|---------|
| repair_search falla con 400 | `rix-search-v2` exige `issuer_name` (línea 927), pero el orquestador no lo envía (línea 931) | 0 reparaciones ejecutándose |
| Batch muy lento | `batch_size = 5` por defecto en repair_search | 56 registros pendientes / 5 = 11 iteraciones mínimo |
| Grok sigue fallando | Cambio a `grok-4-1-fast` desplegado, pero no se ha ejecutado aún por el bug anterior | 51 registros sin datos |

## Cambios a Realizar

### 1. Hacer `issuer_name` opcional en repair_mode (rix-search-v2)

**Archivo:** `supabase/functions/rix-search-v2/index.ts`

**Líneas 927-932:** Modificar validación para que en `repair_mode`, busque `issuer_name` automáticamente:

```typescript
// ANTES (línea 927-932):
if (!ticker || !issuer_name) {
  return new Response(
    JSON.stringify({ error: 'Missing required fields: ticker, issuer_name' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// DESPUÉS:
if (!ticker) {
  return new Response(
    JSON.stringify({ error: 'Missing required field: ticker' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// En repair_mode, buscar issuer_name si no viene
let resolvedIssuerName = issuer_name;
if (!resolvedIssuerName && repair_mode) {
  const { data: issuerData } = await supabase
    .from('repindex_root_issuers')
    .select('issuer_name')
    .eq('ticker', ticker)
    .single();
  
  resolvedIssuerName = issuerData?.issuer_name || ticker;
  console.log(`[repair_mode] Resolved issuer_name for ${ticker}: ${resolvedIssuerName}`);
}

if (!resolvedIssuerName) {
  return new Response(
    JSON.stringify({ error: 'Missing issuer_name and not in repair_mode' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Usar `resolvedIssuerName` en lugar de `issuer_name`** en todo el código posterior (líneas 979, 995, etc.)

### 2. Corregir referencia al modelo Grok en single_model mode

**Archivo:** `supabase/functions/rix-search-v2/index.ts`

**Línea 986:** Cambiar referencia de `grok-4` a `grok-4-1-fast`:

```typescript
// ANTES:
} else if (targetConfig.name === 'grok-4') {

// DESPUÉS:
} else if (targetConfig.name === 'grok-4-1-fast') {
```

### 3. Aumentar batch_size del repair_search (orquestador)

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

**Línea 875:** Aumentar batch_size por defecto:

```typescript
// ANTES:
const batchSize = triggerParams?.batch_size || 5;

// DESPUÉS:
const batchSize = triggerParams?.batch_size || 20;
```

### 4. Mejorar filtro de semana exacta

**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

**Línea 900:** Cambiar `.gte()` a `.eq()` para semana exacta:

```typescript
// ANTES:
.gte('06_period_from', periodFromStr);

// DESPUÉS:
.eq('06_period_from', periodFromStr);
```

---

## Resumen de Archivos

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/rix-search-v2/index.ts` | Líneas 927-932: hacer issuer_name opcional en repair_mode; Línea 986: corregir referencia a grok-4-1-fast |
| `supabase/functions/rix-batch-orchestrator/index.ts` | Línea 875: batch_size 5→20; Línea 900: .gte→.eq |

## Resultado Esperado

1. **repair_search funcionará** - Ya no habrá error 400 porque issuer_name se resuelve automáticamente
2. **4x más rápido** - batch_size de 20 en lugar de 5
3. **Sin mezcla de semanas** - Filtro exacto por fecha de periodo
4. **Grok recuperado** - Los 51 registros fallidos se reprocesarán con `grok-4-1-fast`

## Flujo Post-Deploy

1. Desplegar ambas funciones
2. Ir a /admin → Sweep Health Dashboard
3. Hacer clic en "Forzar" para disparar `auto_recovery`
4. El sistema procesará los 56 registros pendientes en ~3 iteraciones (20 por batch)
