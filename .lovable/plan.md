

# Añadir Grupo Azvi e Incluir en Barrido W07

## Resumen Ejecutivo
Añadir **Grupo Azvi** al sistema de issuers y generar su análisis completo RIX para incluirlo en el barrido actual (W07), pasando de 178 a **179 empresas**.

## Datos de la Empresa

| Campo | Valor |
|-------|-------|
| Nombre | Grupo Azvi |
| Sector | Construcción e Infraestructuras |
| Cotiza | NO (empresa privada, grupo familiar sevillano) |
| ibex_family_code | NO-COTIZA |
| Ticker | AZVI (formato para no cotizadas) |
| Website | https://www.grupoazvi.com/ |
| Descripción | Grupo empresarial centenario (100+ años) especializado en construcción, infraestructuras y servicios, con presencia en Europa, Latinoamérica y EEUU |

## Cambios Técnicos

### Paso 1: Insertar en `repindex_root_issuers`

```sql
INSERT INTO repindex_root_issuers (
  issuer_id,
  issuer_name,
  ticker,
  include_terms,
  exclude_terms,
  sample_query,
  status,
  ibex_status,
  languages,
  geography,
  cotiza_en_bolsa,
  ibex_family_code,
  ibex_family_category,
  sector_category,
  fase,
  website,
  notes,
  verified_competitors
) VALUES (
  'grupo-azvi',
  'Grupo Azvi',
  'AZVI',
  '["Grupo Azvi", "Azvi", "Azvi S.A."]',
  '[]',
  '("Grupo Azvi" OR "Azvi")',
  'active',
  'no_cotiza',
  ARRAY['es', 'en'],
  ARRAY['ES'],
  false,
  'NO-COTIZA',
  'No cotiza en bolsa',
  'Construcción e Infraestructuras',
  35,  -- Fase 35 tiene solo 4 empresas (cap 5)
  'https://www.grupoazvi.com/',
  'Grupo constructor centenario sevillano. Ingresado manualmente 2026-02-08.',
  '[]'
);
```

### Paso 2: Insertar en `sweep_progress` para W07

```sql
INSERT INTO sweep_progress (
  sweep_id,
  fase,
  ticker,
  issuer_name,
  status,
  models_completed,
  retry_count
) VALUES (
  '2026-W07',
  35,
  'AZVI',
  'Grupo Azvi',
  'pending',
  0,
  0
);
```

### Paso 3: Disparar Análisis RIX Completo

Insertar un trigger que invoque el análisis para esta empresa específica:

```sql
INSERT INTO cron_triggers (
  action,
  params,
  status
) VALUES (
  'process_single_company',
  '{"ticker": "AZVI", "issuer_name": "Grupo Azvi", "sweep_id": "2026-W07"}',
  'pending'
);
```

### Paso 4: Handler en el Orquestador

Añadir un nuevo case en `rix-batch-orchestrator/index.ts` para procesar `process_single_company`:

```typescript
} else if (trigger.action === 'process_single_company') {
  const params = trigger.params as { ticker: string; issuer_name: string; sweep_id?: string };
  console.log(`[cron_triggers] Processing single company: ${params.ticker}`);
  
  // Llamar directamente a rix-search-v2 con el ticker
  const response = await fetch(`${supabaseUrl}/functions/v1/rix-search-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      ticker: params.ticker, 
      issuer_name: params.issuer_name 
    }),
  });

  const responseText = await response.text();
  let data: any = {};
  try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText}`);
  }

  // Actualizar sweep_progress si existe
  if (params.sweep_id) {
    await supabase
      .from('sweep_progress')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        models_completed: data.results?.length || 6
      })
      .eq('sweep_id', params.sweep_id)
      .eq('ticker', params.ticker);
  }

  await supabase
    .from('cron_triggers')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
      result: data,
    })
    .eq('id', trigger.id);

  results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
  console.log(`[process_single_company] ${params.ticker} processed successfully`);
}
```

También añadir a la lista de prioridades:

```typescript
const PRIORITY: Record<string, number> = {
  // ...existing priorities...
  process_single_company: 5,  // Máxima prioridad para empresas individuales
  // ...
};
```

## Flujo de Ejecución

```text
1. INSERT en repindex_root_issuers → Empresa registrada
2. INSERT en sweep_progress (W07) → Añadida al barrido actual
3. INSERT en cron_triggers → Trigger creado
4. Watchdog (cada 5 min) → Detecta trigger pendiente
5. Orquestador → Procesa process_single_company
6. rix-search-v2 → Ejecuta búsqueda en 6 modelos
7. rix-analyze-v2 → Analiza y genera RIX Score
8. sweep_progress → Marcado como completed
```

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Total empresas | 178 | 179 |
| Empresas W07 | 178 | 179 |
| ChatGPT | 178/178 | 179/179 |
| (todos los modelos) | 178/178 | 179/179 |

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-batch-orchestrator/index.ts` | Añadir handler para `process_single_company` |
| Base de datos | 3 INSERTs: issuer, sweep_progress, cron_trigger |

## Consideraciones

| Aspecto | Detalle |
|---------|---------|
| Tiempo estimado | 2-3 minutos para búsqueda + análisis |
| Automatización | El trigger se procesa en la próxima ejecución del watchdog |
| Reutilizable | El handler `process_single_company` sirve para futuras adiciones ad-hoc |

