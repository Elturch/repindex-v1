# Plan: Sistema de Barrido Estable - IMPLEMENTADO ✅

## Resumen de Cambios Realizados

### 1. Timeouts de 180s por modelo en `rix-search-v2` ✅
- Agregado `AbortController` con timeout de **180 segundos** por modelo
- Si un modelo (DeepSeek, Qwen, etc.) no responde en 3 min, se marca como error y continúa
- Previene bloqueos indefinidos

### 2. Nuevo modo `concurrent_stable` en orquestador ✅
- Reemplaza el modo `parallel_batch` roto
- Claim de 3-4 empresas atómicamente
- Procesamiento en paralelo con `Promise.allSettled`
- **ESPERA** a que todas terminen antes de responder
- Auto-limpieza de zombies (>5 min stuck)

### 3. Dashboard simplificado ("Semáforo") ✅
- 3 números grandes: Completados | Pendientes | Fallidos
- Barra de progreso visual
- Velocidad estimada y ETA
- 3 botones: Limpiar Zombis | Reanudar | Reset Total
- Mensaje de estado contextual

## Arquitectura Final

```
CRON cada 5 minutos (domingos 01:00-09:00 CET)
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ rix-batch-orchestrator (modo: concurrent_stable)               │
│                                                                │
│  1. Limpiar zombies automáticamente (>5 min stuck)            │
│  2. Claim 3-4 empresas atómicamente                           │
│  3. Procesar EN PARALELO con Promise.allSettled               │
│  4. ESPERAR a que TODAS terminen                              │
│  5. Responder con estadísticas                                │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│ rix-search-v2 (con timeouts de 180s por modelo)               │
│                                                                │
│  6 modelos con AbortController:                               │
│  - Perplexity (180s max)                                      │
│  - ChatGPT (180s max)                                         │
│  - Grok (180s max)                                            │
│  - Gemini (180s max)                                          │
│  - DeepSeek (180s max)                                        │
│  - Qwen (180s max)                                            │
└────────────────────────────────────────────────────────────────┘

Resultado: 3-4 empresas cada 5 min = ~40-48 empresas/hora = ~3-4 horas
```

## Acción Inmediata (SQL para desbloquear zombies actuales)

```sql
UPDATE sweep_progress 
SET status = 'pending', 
    started_at = NULL, 
    worker_id = NULL 
WHERE sweep_id = '2026-W06' 
AND status = 'processing';
```

## Métricas Esperadas

| Métrica | Antes | Después |
|---------|-------|---------|
| Timeout por modelo | Ninguno | 180 segundos |
| Zombies | Frecuentes | Eliminados (auto-cleanup) |
| Tiempo total barrido | 6-10h + intervención | ~3-4h automático |
| Comprensión dashboard | Baja | Alta (semáforo) |
