

# Plan: Crear CRON Job para Fase 35

## Situación Actual

- **174 empresas** en el sistema
- **34 fases con CRON** (fases 01-34) → cubren 170 empresas
- **Fase 35 sin CRON** → 4 empresas hospitalarias huérfanas:
  - Grupo Hospitalario HLA (HLA)
  - Ribera Salud (RS)
  - Viamed Salud (VIA)
  - Vithas (VIT)

## Solución

Crear un nuevo CRON job `rix-sweep-phase-35` que se ejecute a las **02:50 UTC (03:50 CET)**, 5 minutos después de la fase 34.

## Comando SQL a Ejecutar

El CRON debe seguir el mismo patrón que los existentes:

```sql
SELECT cron.schedule(
  'rix-sweep-phase-35',
  '50 2 * * 0',
  $$
  SELECT net.http_post(
    url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body:='{"trigger": "cron", "fase": 35}'::jsonb
  )
  $$
);
```

## Cambios Técnicos

### 1. Actualizar Edge Function `update-cron-schedules`

Modificar para que:
- Soporte 35 fases en lugar de 34
- Pueda crear CRONs nuevos además de actualizarlos

### 2. Ejecutar Creación del CRON

Usar el SQL insert tool para crear el CRON directamente.

## Resultado Final

| Fase | Hora UTC | Hora CET | Empresas |
|------|----------|----------|----------|
| 34 | 02:45 | 03:45 | 5 empresas |
| 35 | 02:50 | 03:50 | 4 hospitales |

- **Total sweep**: 00:00 - 02:50 UTC (01:00 - 03:50 CET)
- **174/174 empresas cubiertas** ✅

