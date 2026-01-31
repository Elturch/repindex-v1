

# Plan: Arreglar Grok y Adelantar Barrido a 01:00 CET

## Problema 1: Grok con 69% de Fallos

### Diagnóstico

| Error | Causa | Impacto |
|-------|-------|---------|
| HTTP 422: `unknown variant web_search_preview` | xAI deprecó `web_search_preview` en enero 2026 | 100% de llamadas a Grok fallan |
| Respuesta: `[object Object]` (15 chars) | El parser no extrae correctamente el texto | Datos corruptos en BD |

**Prueba real ejecutada**:
```
POST /rix-search-v2 {"ticker": "IBE", "single_model": "grok"}
→ HTTP 422: unknown variant `web_search_preview`, expected `web_search` or `x_search`
```

### Solución Técnica

**Archivo**: `supabase/functions/rix-search-v2/index.ts`

**Cambio 1**: Actualizar el tipo de herramienta de Grok (línea ~249)

```typescript
// ANTES (deprecated desde 12 ene 2026)
tools: [{ type: 'web_search_preview' }],

// DESPUÉS (formato actual de xAI)
tools: [{ type: 'web_search' }],
```

**Cambio 2**: Corregir el parser de respuestas de Grok (líneas ~253-298)

La API `/v1/responses` de xAI devuelve el contenido en `output_text` directamente o en un array `output` con objetos de tipo `message`:

```typescript
parseResponse: (data: any) => {
  console.log('[Grok-Parse] Response:', JSON.stringify(data).substring(0, 500));
  
  // Formato actual de xAI Responses API (enero 2026)
  // La respuesta viene en output_text (string) o output (array)
  
  // Prioridad 1: output_text directo
  if (data.output_text && typeof data.output_text === 'string') {
    return data.output_text;
  }
  
  // Prioridad 2: output como array con mensajes
  if (Array.isArray(data.output)) {
    const textParts = data.output
      .filter((item: any) => item.type === 'message')
      .map((item: any) => {
        // El contenido puede estar en content[].text o text directo
        if (Array.isArray(item.content)) {
          return item.content
            .filter((c: any) => c.type === 'output_text' || c.type === 'text')
            .map((c: any) => c.text)
            .join('');
        }
        return item.text || item.content || '';
      })
      .filter(Boolean);
    
    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }
  
  // Fallback: intentar extraer de cualquier campo text/content
  if (data.text) return data.text;
  if (data.content) return typeof data.content === 'string' 
    ? data.content 
    : JSON.stringify(data.content);
  
  console.log('[Grok-Parse] Could not extract text from:', Object.keys(data));
  return '';
}
```

---

## Problema 2: Adelantar Horario a 01:00 CET

### Cambio Requerido

Los 34 CRONs de fases están programados actualmente así:
```
Fase 01: 0 4 * * 0  (04:00 UTC = 05:00 CET)
Fase 02: 5 4 * * 0  (04:05 UTC)
...
Fase 34: 45 6 * * 0 (06:45 UTC = 07:45 CET)
```

**Nuevo horario (01:00 CET = 00:00 UTC)**:
```
Fase 01: 0 0 * * 0  (00:00 UTC = 01:00 CET)
Fase 02: 5 0 * * 0  (00:05 UTC)
...
Fase 34: 45 2 * * 0 (02:45 UTC = 03:45 CET)
```

### SQL para Actualizar CRONs

Este SQL debe ejecutarse manualmente en Supabase:

```sql
-- Adelantar barrido 4 horas (de 04:00 UTC a 00:00 UTC)
-- Fase 01-12: hora 4 → hora 0
UPDATE cron.job SET schedule = CONCAT(SUBSTRING(schedule, 1, 2), '0 * * 0')
WHERE jobname ~ '^rix-sweep-phase-0[1-9]$' OR jobname = 'rix-sweep-phase-10' 
   OR jobname = 'rix-sweep-phase-11' OR jobname = 'rix-sweep-phase-12';

-- Fase 13-24: hora 5 → hora 1
UPDATE cron.job SET schedule = CONCAT(SUBSTRING(schedule, 1, 2), '1 * * 0')
WHERE jobname ~ '^rix-sweep-phase-1[3-9]$' OR jobname ~ '^rix-sweep-phase-2[0-4]$';

-- Fase 25-34: hora 6 → hora 2
UPDATE cron.job SET schedule = CONCAT(SUBSTRING(schedule, 1, 2), '2 * * 0')
WHERE jobname ~ '^rix-sweep-phase-2[5-9]$' OR jobname ~ '^rix-sweep-phase-3[0-4]$';
```

**Script alternativo más seguro (fase por fase)**:

```sql
-- Ejecutar en Supabase SQL Editor
UPDATE cron.job SET schedule = '0 0 * * 0' WHERE jobname = 'rix-sweep-phase-01';
UPDATE cron.job SET schedule = '5 0 * * 0' WHERE jobname = 'rix-sweep-phase-02';
UPDATE cron.job SET schedule = '10 0 * * 0' WHERE jobname = 'rix-sweep-phase-03';
UPDATE cron.job SET schedule = '15 0 * * 0' WHERE jobname = 'rix-sweep-phase-04';
UPDATE cron.job SET schedule = '20 0 * * 0' WHERE jobname = 'rix-sweep-phase-05';
UPDATE cron.job SET schedule = '25 0 * * 0' WHERE jobname = 'rix-sweep-phase-06';
UPDATE cron.job SET schedule = '30 0 * * 0' WHERE jobname = 'rix-sweep-phase-07';
UPDATE cron.job SET schedule = '35 0 * * 0' WHERE jobname = 'rix-sweep-phase-08';
UPDATE cron.job SET schedule = '40 0 * * 0' WHERE jobname = 'rix-sweep-phase-09';
UPDATE cron.job SET schedule = '45 0 * * 0' WHERE jobname = 'rix-sweep-phase-10';
UPDATE cron.job SET schedule = '50 0 * * 0' WHERE jobname = 'rix-sweep-phase-11';
UPDATE cron.job SET schedule = '55 0 * * 0' WHERE jobname = 'rix-sweep-phase-12';
UPDATE cron.job SET schedule = '0 1 * * 0' WHERE jobname = 'rix-sweep-phase-13';
UPDATE cron.job SET schedule = '5 1 * * 0' WHERE jobname = 'rix-sweep-phase-14';
UPDATE cron.job SET schedule = '10 1 * * 0' WHERE jobname = 'rix-sweep-phase-15';
UPDATE cron.job SET schedule = '15 1 * * 0' WHERE jobname = 'rix-sweep-phase-16';
UPDATE cron.job SET schedule = '20 1 * * 0' WHERE jobname = 'rix-sweep-phase-17';
UPDATE cron.job SET schedule = '25 1 * * 0' WHERE jobname = 'rix-sweep-phase-18';
UPDATE cron.job SET schedule = '30 1 * * 0' WHERE jobname = 'rix-sweep-phase-19';
UPDATE cron.job SET schedule = '35 1 * * 0' WHERE jobname = 'rix-sweep-phase-20';
UPDATE cron.job SET schedule = '40 1 * * 0' WHERE jobname = 'rix-sweep-phase-21';
UPDATE cron.job SET schedule = '45 1 * * 0' WHERE jobname = 'rix-sweep-phase-22';
UPDATE cron.job SET schedule = '50 1 * * 0' WHERE jobname = 'rix-sweep-phase-23';
UPDATE cron.job SET schedule = '55 1 * * 0' WHERE jobname = 'rix-sweep-phase-24';
UPDATE cron.job SET schedule = '0 2 * * 0' WHERE jobname = 'rix-sweep-phase-25';
UPDATE cron.job SET schedule = '5 2 * * 0' WHERE jobname = 'rix-sweep-phase-26';
UPDATE cron.job SET schedule = '10 2 * * 0' WHERE jobname = 'rix-sweep-phase-27';
UPDATE cron.job SET schedule = '15 2 * * 0' WHERE jobname = 'rix-sweep-phase-28';
UPDATE cron.job SET schedule = '20 2 * * 0' WHERE jobname = 'rix-sweep-phase-29';
UPDATE cron.job SET schedule = '25 2 * * 0' WHERE jobname = 'rix-sweep-phase-30';
UPDATE cron.job SET schedule = '30 2 * * 0' WHERE jobname = 'rix-sweep-phase-31';
UPDATE cron.job SET schedule = '35 2 * * 0' WHERE jobname = 'rix-sweep-phase-32';
UPDATE cron.job SET schedule = '40 2 * * 0' WHERE jobname = 'rix-sweep-phase-33';
UPDATE cron.job SET schedule = '45 2 * * 0' WHERE jobname = 'rix-sweep-phase-34';

-- Verificar cambios
SELECT jobname, schedule FROM cron.job 
WHERE jobname LIKE 'rix-sweep-phase%' 
ORDER BY jobname;
```

---

## Nuevo Cronograma Dominical

| Hora CET | Hora UTC | Evento |
|----------|----------|--------|
| **01:00** | 00:00 | Inicio Fase 01 |
| 02:00 | 01:00 | Fase 13 |
| 03:00 | 02:00 | Fase 25 |
| **03:45** | 02:45 | Fin Fase 34 (último CRON) |
| 04:00-06:00 | 03:00-05:00 | Watchdog completa pendientes |
| **~06:00** | ~05:00 | Barrido RIX completo |

---

## Archivos a Modificar

| Archivo | Cambio | Urgencia |
|---------|--------|----------|
| `supabase/functions/rix-search-v2/index.ts` | Fix Grok: `web_search_preview` → `web_search` + parser | **CRÍTICO** |
| Supabase SQL Editor | Ejecutar SQL para adelantar CRONs | **CRÍTICO** |

---

## Verificación Post-Despliegue

### Paso 1: Probar Grok corregido
```bash
POST /rix-search-v2
{"ticker": "IBE", "issuer_name": "Iberdrola", "single_model": "grok"}
# Esperar: success: true, response con >4000 caracteres
```

### Paso 2: Verificar horarios actualizados
```sql
SELECT jobname, schedule FROM cron.job 
WHERE jobname LIKE 'rix-sweep-phase%' 
ORDER BY jobname;
-- Fase 01 debe mostrar: '0 0 * * 0'
```

### Paso 3: Monitorear domingo 01:00 CET
- Verificar en logs que las fases arrancan
- Comprobar que Grok devuelve contenido válido (>4000 chars)

---

## Resumen Ejecutivo

1. **Grok está roto** por cambio de API de xAI (enero 2026)
   - Fix: cambiar `web_search_preview` → `web_search`
   - Fix: actualizar parser para nuevo formato de respuesta

2. **Horario se adelanta 4 horas**
   - Antes: 05:00-07:45 CET
   - Después: 01:00-03:45 CET
   - SQL listo para ejecutar en Supabase

3. **Tiempo estimado**: 
   - Código: 15 minutos
   - SQL: 5 minutos
   - Verificación: 10 minutos

