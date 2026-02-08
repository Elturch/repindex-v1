# Plan: Sistema Robusto de Scraping Corporativo - IMPLEMENTADO ✅

## Estado: Completado (2026-02-08)

### Cambios Realizados

| Archivo | Cambios |
|---------|---------|
| **Migración SQL** ✅ | Columnas `result_type`, `latest_news_date`, `news_found_count` añadidas |
| `firecrawl-corporate-scrape/index.ts` ✅ | Función `classifyResult()` para determinar tipo de resultado |
| `corporate-scrape-orchestrator/index.ts` ✅ | Función `maybeInsertContinueTrigger()` para auto-encadenamiento |
| `rix-batch-orchestrator/index.ts` ✅ | Handlers para `corporate_scrape_continue` y `corporate_scrape_retry` |

---

## Arquitectura Implementada

### 1. Estados Semánticos

```text
Estados disponibles en result_type:
───────────────────────────────────
success_with_news     → Scrape OK + noticias nuevas (<30 días)
success_no_news       → Scrape OK pero sin noticias recientes
success_corporate_only → Solo datos corporativos, sin sección news
error_timeout         → Timeout (reintentable)
error_rate_limit      → HTTP 429 (reintentable)
error_website_down    → HTTP 404/5xx (reintentable)
error_blocked         → HTTP 401/403 (permanente)
error_parsing         → Error de parseo (reintentable)
```

### 2. Flujo de Auto-Continuación

```text
pg_cron (Domingo 01:00 UTC)
        │
        ▼
corporate-scrape-orchestrator
(mode: init + continue_cascade)
        │
        ├─→ Procesa batch de 5 empresas
        │
        └─→ maybeInsertContinueTrigger()
                │
                ├─→ Quedan pendientes? → corporate_scrape_continue
                │
                └─→ Hay errores reintentables? → corporate_scrape_retry
                        │
                        ▼
              rix-batch-orchestrator
              (watchdog cada 5 min)
                        │
                        ▼
              Procesa triggers con prioridades:
              repair_search:           10
              repair_analysis:         20
              auto_sanitize:           30
              vector_store_continue:   40
              auto_populate_vectors:   50
              corporate_scrape_continue: 60  ← NUEVO
              corporate_scrape_retry:    61  ← NUEVO
              auto_continue:           90
```

### 3. Lógica de Reintentos

- Máximo 3 reintentos por empresa
- Solo `result_type` reintentables: `error_timeout`, `error_rate_limit`, `error_website_down`, `error_parsing`
- Errores permanentes (`error_blocked`) no se reintentan

---

## Resultado Esperado

1. **Velocidad**: Procesamiento continuo en batches de 5 (vs 1 cada 15 min)
2. **Claridad**: Estados semánticos distinguen "sin noticias" de "falló"
3. **Resiliencia**: Reintentos automáticos con backoff para errores temporales
4. **Observabilidad**: Dashboard puede mostrar desglose de resultados
5. **Autonomía**: El sistema se auto-recupera sin intervención humana
