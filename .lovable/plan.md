
# Auto-Chain: Generación Automática del Newsroom

## Objetivo
Añadir un tercer eslabón a la cadena automática:

```text
┌─────────────────┐     ┌──────────────────────┐     ┌────────────────────────┐
│ auto_sanitize   │ ──→ │ auto_populate_vectors│ ──→ │ auto_generate_newsroom │
│ (sweep limpio)  │     │ (vector store OK)    │     │ (generar noticias)     │
└─────────────────┘     └──────────────────────┘     └────────────────────────┘
```

## Cambios Técnicos

### Archivo: `supabase/functions/rix-batch-orchestrator/index.ts`

**Ubicación**: Después de procesar `auto_populate_vectors` (líneas ~1025-1037)

Cuando `auto_populate_vectors` complete con `remaining_total = 0`:
1. Verificar que no existe ya un trigger `auto_generate_newsroom` pendiente
2. Insertar trigger para generar el newsroom automáticamente

```typescript
// Después de marcar auto_populate_vectors como completado (remaining_total = 0)
if (remainingTotal === 0) {
  // Verificar que no existe ya un trigger pendiente
  const { data: existingNewsroomTrigger } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'auto_generate_newsroom')
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();

  if (!existingNewsroomTrigger) {
    await supabase.from('cron_triggers').insert({
      action: 'auto_generate_newsroom',
      params: { 
        triggered_by: 'auto_populate_vectors_chain',
        auto_chain: true,
        source_filter: sourceFilter
      },
      status: 'pending',
    });
    console.log('[auto_populate_vectors] Vector Store complete! Inserted auto_generate_newsroom trigger.');
  }
}
```

**Ubicación**: En el switch de procesamiento de triggers (~línea 1039)

Añadir nuevo case para manejar el trigger `auto_generate_newsroom`:

```typescript
} else if (trigger.action === 'auto_generate_newsroom') {
  console.log(`[cron_triggers] Processing auto_generate_newsroom trigger ${trigger.id}`);
  
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-news-story`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      trigger: 'cron',
      saveToDb: true 
    }),
  });

  const responseText = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText}`);
  }

  await supabase
    .from('cron_triggers')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
      result: data,
    })
    .eq('id', trigger.id);

  results.push({ 
    id: trigger.id, 
    action: trigger.action, 
    success: true, 
    result: data 
  });
  console.log('[auto_generate_newsroom] Newsroom generation completed successfully');
}
```

**Ubicación**: En la lista PRIORITY (~línea 856)

Añadir la nueva acción al sistema de prioridades:

```typescript
const PRIORITY: Record<string, number> = {
  repair_search: 10,
  repair_analysis: 20,
  auto_sanitize: 30,
  vector_store_continue: 40,
  auto_populate_vectors: 50,
  auto_generate_newsroom: 55,  // Después del vector store
  corporate_scrape_continue: 60,
  corporate_scrape_retry: 61,
  auto_continue: 90,
};
```

## Flujo Completo

| Paso | Trigger | Condición para encadenar |
|------|---------|--------------------------|
| 1 | Sweep completo | Watchdog detecta sweep 100% |
| 2 | `auto_sanitize` | missing=0, invalid=0 |
| 3 | `auto_populate_vectors` | remaining_total=0 |
| 4 | `auto_generate_newsroom` | *(nuevo)* |

## Consideraciones

| Aspecto | Detalle |
|---------|---------|
| **Timeout** | `generate-news-story` puede tardar ~30-60s (Gemini 3 Pro) |
| **Duplicados** | Se verifica que no exista trigger pendiente antes de insertar |
| **Logs** | Añadidos para trazabilidad completa |
| **Prioridad** | 55 = después de vector store, antes de corporate scraping |

## Resultado Esperado

Cuando el barrido semanal complete:
1. El watchdog detecta 100% completado
2. Dispara `auto_sanitize` → limpia datos
3. Si sweep limpio → dispara `auto_populate_vectors` → actualiza vector store
4. Si vector store completo → dispara `auto_generate_newsroom` → genera noticias
5. Newsroom publicado automáticamente sin intervención manual
