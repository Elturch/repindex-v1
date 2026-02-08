
# Plan: Sistema Robusto de Scraping Corporativo con Detección Inteligente de Estados

## Diagnóstico del Problema Actual

### Estado Actual del Barrido corp-2026-02
| Estado | Cantidad | Última Actualización |
|--------|----------|----------------------|
| completed | 67 | 2026-02-01 17:38 |
| pending | 107 | 2026-02-08 10:55 (reset reciente) |

### Problemas Identificados

1. **Sin auto-continuación**: El watchdog procesa 1 empresa cada 15 min. 107 pendientes = ~27 horas
2. **Estados binarios insuficientes**: Solo existe `pending`, `processing`, `completed`, `failed`, `skipped`
3. **No distingue tipos de resultado**:
   - Empresa scrapeada pero sin noticias nuevas esta semana
   - Fallo temporal de conexión (reintentable)
   - Fallo permanente (website no existe, bloqueado, etc.)
4. **Sin integración con `cron_triggers`**: No aprovecha la arquitectura probada del RIX orchestrator

---

## Solución Propuesta

### 1. Nuevos Estados Semánticos

```text
Estados actuales:          Estados propuestos:
─────────────────          ───────────────────
pending                    pending
processing                 processing
completed                  completed (con datos corporativos Y/O noticias)
failed                     completed_no_news (scrape OK pero sin noticias nuevas)
skipped                    failed_retryable (timeout, rate limit - reintentar)
                           failed_permanent (website no existe, bloqueado)
                           skipped (sin website configurado)
```

### 2. Integración con cron_triggers (Auto-Continuación)

Añadir el scraping corporativo al `rix-batch-orchestrator`:

```text
┌─────────────────────────────────────────────────────────────┐
│                    rix-batch-orchestrator                   │
├─────────────────────────────────────────────────────────────┤
│ Acciones actuales:                                          │
│ • sweep_fase_X, repair_search, repair_analysis              │
│ • auto_sanitize, auto_populate_vectors                      │
│                                                             │
│ Acciones NUEVAS:                                            │
│ • corporate_scrape_batch  → Procesa N empresas              │
│ • corporate_scrape_repair → Reintenta failed_retryable      │
│ • corporate_scrape_report → Genera resumen de estados       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────┐
    │ cron_triggers│  ← Encadenamiento automático
    └─────────────┘
```

### 3. Lógica de Clasificación de Resultados

En `firecrawl-corporate-scrape`, tras procesar una empresa:

```text
┌──────────────────────────┐
│  Resultado del Scrape    │
└──────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │ ¿HTTP OK?    │
    └──────────────┘
       │No         │Sí
       ▼           ▼
┌──────────────┐  ┌────────────────────┐
│ Analizar     │  │ ¿Encontró páginas  │
│ código HTTP  │  │ corporativas/news? │
└──────────────┘  └────────────────────┘
       │                  │No        │Sí
       ▼                  ▼          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ 429 Rate     │  │ completed    │  │ ¿Noticias nuevas │
│ Limit?       │  │ _no_news     │  │ (< 30 días)?     │
│ → retryable  │  │              │  └──────────────────┘
│              │  │              │       │No        │Sí
│ 404/403/5xx? │  │              │       ▼          ▼
│ → permanent  │  │              │  ┌──────────┐ ┌──────────┐
└──────────────┘  └──────────────┘  │completed │ │completed │
                                    │_no_news  │ │          │
                                    └──────────┘ └──────────┘
```

### 4. Auto-Continuación Inteligente

El `corporate-scrape-orchestrator` insertará triggers en `cron_triggers` cuando:

1. **Quedan empresas pendientes**: `corporate_scrape_continue`
2. **Hay fallos reintentables**: `corporate_scrape_retry` (con backoff)
3. **Scrape completo**: `corporate_scrape_report` (genera resumen)

---

## Sección Técnica

### Archivo 1: Modificar `corporate_scrape_progress` (Migración SQL)

Añadir columna `result_type` para distinguir tipos de finalización:

```sql
-- Nueva columna para clasificar el resultado
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT NULL;

-- Valores posibles:
-- 'success_with_news' - Encontró y guardó noticias nuevas
-- 'success_no_news' - Scrape OK pero sin noticias nuevas (< 30 días)
-- 'success_corporate_only' - Solo datos corporativos, sin sección de noticias
-- 'error_timeout' - Timeout de Firecrawl (reintentable)
-- 'error_rate_limit' - Rate limit (reintentable)
-- 'error_website_down' - Website caído temporalmente (reintentable)
-- 'error_blocked' - Website bloqueó el scraper (permanente)
-- 'error_no_website' - No tiene website configurado (permanente)
-- 'error_parsing' - Error parseando la respuesta (reintentable)

-- Añadir columna para última fecha de noticias encontradas
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS latest_news_date DATE DEFAULT NULL;

-- Añadir columna para conteo de noticias encontradas en este scrape
ALTER TABLE corporate_scrape_progress
ADD COLUMN IF NOT EXISTS news_found_count INTEGER DEFAULT 0;
```

### Archivo 2: Modificar `firecrawl-corporate-scrape/index.ts`

Después de procesar noticias, clasificar el resultado:

```typescript
// Después de extraer noticias (~línea 600)
interface ScrapeResult {
  success: boolean;
  result_type: string;
  news_found_count: number;
  latest_news_date: string | null;
  error?: string;
}

function classifyResult(
  httpOk: boolean,
  httpStatus: number | null,
  corporateDataFound: boolean,
  newsArticles: NewsArticle[],
  errorMessage?: string
): ScrapeResult {
  // Error de conexión/HTTP
  if (!httpOk) {
    if (httpStatus === 429) {
      return { success: false, result_type: 'error_rate_limit', news_found_count: 0, latest_news_date: null, error: errorMessage };
    }
    if (httpStatus === 403 || httpStatus === 401) {
      return { success: false, result_type: 'error_blocked', news_found_count: 0, latest_news_date: null, error: errorMessage };
    }
    if (httpStatus === 404) {
      return { success: false, result_type: 'error_website_down', news_found_count: 0, latest_news_date: null, error: errorMessage };
    }
    if (errorMessage?.includes('timeout') || errorMessage?.includes('Timeout')) {
      return { success: false, result_type: 'error_timeout', news_found_count: 0, latest_news_date: null, error: errorMessage };
    }
    return { success: false, result_type: 'error_parsing', news_found_count: 0, latest_news_date: null, error: errorMessage };
  }

  // HTTP OK - evaluar contenido
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentNews = newsArticles.filter(n => {
    if (!n.published_date) return false;
    return new Date(n.published_date) >= thirtyDaysAgo;
  });

  if (recentNews.length > 0) {
    const latestDate = recentNews
      .map(n => n.published_date)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    return { 
      success: true, 
      result_type: 'success_with_news', 
      news_found_count: recentNews.length,
      latest_news_date: latestDate || null
    };
  }

  if (corporateDataFound) {
    return { 
      success: true, 
      result_type: newsArticles.length > 0 ? 'success_no_news' : 'success_corporate_only',
      news_found_count: 0,
      latest_news_date: null
    };
  }

  return { 
    success: true, 
    result_type: 'success_no_news',
    news_found_count: 0,
    latest_news_date: null
  };
}
```

### Archivo 3: Modificar `corporate-scrape-orchestrator/index.ts`

Añadir integración con `cron_triggers`:

```typescript
// Después de procesar una empresa (~línea 233)
// Insertar trigger de continuación si quedan pendientes

async function maybeInsertContinueTrigger(
  supabase: ReturnType<typeof createClient>,
  sweepId: string,
  status: { pending: number; processing: number; failed: number }
): Promise<void> {
  // Si no hay más trabajo, no insertar trigger
  if (status.pending === 0 && status.processing === 0) {
    // Verificar si hay failed_retryable que deban reintentarse
    const { count: retryableCount } = await supabase
      .from('corporate_scrape_progress')
      .select('*', { count: 'exact', head: true })
      .eq('sweep_id', sweepId)
      .eq('status', 'failed')
      .in('result_type', ['error_timeout', 'error_rate_limit', 'error_website_down', 'error_parsing'])
      .lt('retry_count', 3);
    
    if ((retryableCount || 0) > 0) {
      // Hay errores reintentables - insertar trigger con delay
      const { data: existingTrigger } = await supabase
        .from('cron_triggers')
        .select('id')
        .eq('action', 'corporate_scrape_retry')
        .in('status', ['pending', 'processing'])
        .limit(1)
        .maybeSingle();
      
      if (!existingTrigger) {
        await supabase.from('cron_triggers').insert({
          action: 'corporate_scrape_retry',
          params: { sweep_id: sweepId, retryable_count: retryableCount },
          status: 'pending'
        });
        console.log(`[Orchestrator] Inserted corporate_scrape_retry trigger (${retryableCount} retryable)`);
      }
    } else {
      console.log(`[Orchestrator] Corporate scrape complete! No more work.`);
    }
    return;
  }

  // Hay trabajo pendiente - insertar trigger de continuación
  const { data: existingTrigger } = await supabase
    .from('cron_triggers')
    .select('id')
    .eq('action', 'corporate_scrape_continue')
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();

  if (!existingTrigger) {
    await supabase.from('cron_triggers').insert({
      action: 'corporate_scrape_continue',
      params: { sweep_id: sweepId, pending: status.pending },
      status: 'pending'
    });
    console.log(`[Orchestrator] Inserted corporate_scrape_continue trigger (${status.pending} pending)`);
  }
}
```

### Archivo 4: Modificar `rix-batch-orchestrator/index.ts`

Añadir handlers para las nuevas acciones de corporate scrape:

```typescript
// En el action priority map (~línea 860)
corporate_scrape_continue: 50,  // Después de vector store
corporate_scrape_retry: 51,

// Handler para corporate_scrape_continue (~después de auto_populate_vectors)
} else if (trigger.action === 'corporate_scrape_continue') {
  console.log(`[cron_triggers] Processing corporate_scrape_continue trigger ${trigger.id}`);
  
  const triggerParams = trigger.params as { sweep_id?: string; pending?: number } | null;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/corporate-scrape-orchestrator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      mode: 'continue_cascade',
      sweep_id: triggerParams?.sweep_id,
      batch_size: 5,  // Procesar 5 empresas por invocación
      trigger: 'cron_triggers'
    }),
  });

  const responseText = await response.text();
  let data: unknown;
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
      result: data as Record<string, unknown>
    })
    .eq('id', trigger.id);

  results.push({ id: trigger.id, action: trigger.action, success: true, result: data });
  console.log(`[cron_triggers] corporate_scrape_continue completed`);

} else if (trigger.action === 'corporate_scrape_retry') {
  console.log(`[cron_triggers] Processing corporate_scrape_retry trigger ${trigger.id}`);
  
  const triggerParams = trigger.params as { sweep_id?: string } | null;
  
  // Primero resetear los errores reintentables a pending
  const sweepId = triggerParams?.sweep_id || getCurrentCorpSweepId();
  
  const { data: resetData } = await supabase
    .from('corporate_scrape_progress')
    .update({ status: 'pending', retry_count: supabase.sql`retry_count + 1` })
    .eq('sweep_id', sweepId)
    .eq('status', 'failed')
    .in('result_type', ['error_timeout', 'error_rate_limit', 'error_website_down', 'error_parsing'])
    .lt('retry_count', 3)
    .select();

  const resetCount = resetData?.length || 0;
  console.log(`[corporate_scrape_retry] Reset ${resetCount} retryable errors to pending`);

  // Luego procesar el batch
  const response = await fetch(`${supabaseUrl}/functions/v1/corporate-scrape-orchestrator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ 
      mode: 'continue_cascade',
      sweep_id: sweepId,
      batch_size: 3,
      trigger: 'retry'
    }),
  });

  // ... (mismo patrón de manejo de respuesta)
}
```

---

## Flujo Visual del Nuevo Sistema

```text
               DOMINGO 01:00 UTC
                     │
                     ▼
        ┌─────────────────────────┐
        │ pg_cron: corporate-     │
        │ scrape-weekly           │
        └─────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │ corporate-scrape-       │
        │ orchestrator            │
        │ mode: init + process    │
        └─────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   Procesa 5               Inserta trigger
   empresas               corporate_scrape_continue
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │ rix-batch-orchestrator  │◄── pg_cron cada 5 min
        │ (watchdog)              │
        └─────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
    Procesa trigger      Procesa trigger
    RIX (alta prio)      corporate_scrape
                         (prio 50-51)
                               │
                               ▼
        ┌─────────────────────────┐
        │ Resultado por empresa:  │
        ├─────────────────────────┤
        │ ✓ success_with_news     │
        │ ✓ success_no_news       │
        │ ✓ success_corporate_only│
        │ ⟳ error_timeout (retry) │
        │ ⟳ error_rate_limit      │
        │ ✗ error_blocked (perm)  │
        └─────────────────────────┘
                     │
                     ▼
         ¿Quedan pendientes?
           │Sí            │No
           ▼              ▼
    Insertar          ¿Hay retryable
    continue          con retry<3?
    trigger              │Sí    │No
                         ▼      ▼
                   Insertar   DONE!
                   retry
                   trigger
```

---

## Resumen de Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| **Migración SQL** | Añadir columnas `result_type`, `latest_news_date`, `news_found_count` |
| `firecrawl-corporate-scrape/index.ts` | Función `classifyResult()` para determinar tipo de resultado |
| `corporate-scrape-orchestrator/index.ts` | Función `maybeInsertContinueTrigger()` para auto-encadenamiento |
| `rix-batch-orchestrator/index.ts` | Handlers para `corporate_scrape_continue` y `corporate_scrape_retry` |

---

## Resultado Esperado

1. **Velocidad**: Procesamiento continuo en batches de 5, no 1 cada 15 min
2. **Claridad**: Estados semánticos que distinguen "sin noticias" de "falló"
3. **Resiliencia**: Reintentos automáticos con backoff para errores temporales
4. **Observabilidad**: Dashboard puede mostrar desglose de resultados
5. **Autonomía**: El sistema se auto-recupera sin intervención humana
