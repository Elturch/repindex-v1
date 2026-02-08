

# Añadir Grupo Azvi al Proceso de Noticias Corporativas

## Situación Actual

| Elemento | Estado |
|----------|--------|
| AZVI en `repindex_root_issuers` | ✅ Registrado (status: active) |
| Website configurado | ✅ https://www.grupoazvi.com/ |
| AZVI en `corporate_scrape_progress` | ❌ No existe |
| Barrido corporativo actual | `corp-2026-02` (174 empresas) |

## Acciones a Ejecutar

### Paso 1: Sincronizar Empresas Nuevas

Llamar al orquestador con `mode: sync_new` para detectar y añadir AZVI al barrido actual:

```typescript
await supabase.functions.invoke('corporate-scrape-orchestrator', {
  body: { mode: 'sync_new', sweep_id: 'corp-2026-02' }
});
```

Esto creará automáticamente un registro en `corporate_scrape_progress`:
- ticker: AZVI
- issuer_name: Grupo Azvi
- website: https://www.grupoazvi.com/
- status: pending

### Paso 2: Lanzar Scraping Inmediato

Insertar un trigger `corporate_scrape_continue` para que el orquestador procese las empresas pendientes (incluyendo AZVI):

```sql
INSERT INTO cron_triggers (action, params, status)
VALUES (
  'corporate_scrape_continue',
  '{"sweep_id": "corp-2026-02", "triggered_by": "manual_azvi_add"}',
  'pending'
);
```

### Alternativa Directa

También puedo llamar directamente al proceso single para AZVI una vez sincronizado:

```typescript
await supabase.functions.invoke('corporate-scrape-orchestrator', {
  body: { mode: 'process_single', sweep_id: 'corp-2026-02' }
});
```

Pero AZVI irá al final de la cola (ordenado por `created_at`), así que mejor usar el trigger.

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Empresas en barrido | 174 | 175 |
| AZVI corporate_snapshot | ❌ | ✅ |
| AZVI corporate_news | ❌ | ✅ (si hay noticias) |

## Ejecución

No requiere cambios de código. Solo dos llamadas API:
1. `corporate-scrape-orchestrator` con `sync_new`
2. Insertar trigger para procesar pendientes

El watchdog procesará el trigger en los próximos 5 minutos.

