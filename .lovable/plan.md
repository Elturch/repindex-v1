# ✅ COMPLETADO: Fix Grok + Adelantar Barrido a 01:00 CET

## Estado: LISTO PARA DOMINGO

---

## ✅ Problema 1: Grok SOLUCIONADO

### Cambios Aplicados en `rix-search-v2`

| Cambio | Antes | Después |
|--------|-------|---------|
| Modelo | `grok-3` | `grok-4` |
| Tool type | `web_search_preview` | `web_search` |
| Parser | Formato legacy | Formato xAI 2026 |

### Prueba Exitosa

```
[11:13:50] Grok returned 24428 chars in 153406ms ✅
[11:13:50] Extracted from output array, length: 24428 ✅
```

---

## 🔴 Problema 2: EJECUTAR SQL PARA ADELANTAR CRONs

### SQL A EJECUTAR EN SUPABASE SQL EDITOR

Copia y pega este SQL completo en: https://supabase.com/dashboard/project/jzkjykmrwisijiqlwuua/sql/new

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- ADELANTAR BARRIDO RIX: 05:00 CET → 01:00 CET (4 horas antes)
-- Ejecutar ANTES del domingo 1 de febrero 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- Fase 01-12: hora 4 UTC → hora 0 UTC (01:00-01:55 CET)
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

-- Fase 13-24: hora 5 UTC → hora 1 UTC (02:00-02:55 CET)
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

-- Fase 25-34: hora 6 UTC → hora 2 UTC (03:00-03:45 CET)
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
SELECT jobname, schedule 
FROM cron.job 
WHERE jobname LIKE 'rix-sweep-phase%' 
ORDER BY jobname;
```

---

## Nuevo Cronograma Dominical (Post-SQL)

| Hora CET | Hora UTC | Evento |
|----------|----------|--------|
| **01:00** | 00:00 | 🚀 Inicio Fase 01 |
| 01:55 | 00:55 | Fase 12 completa |
| 02:00 | 01:00 | Fase 13 |
| 02:55 | 01:55 | Fase 24 completa |
| 03:00 | 02:00 | Fase 25 |
| **03:45** | 02:45 | ✅ Fase 34 (último CRON) |
| 04:00-06:00 | 03:00-05:00 | Watchdog completa pendientes |
| **~06:00** | ~05:00 | 🎉 Barrido RIX completo |

---

## Checklist Final

- [x] ✅ Grok: `grok-3` → `grok-4`
- [x] ✅ Grok: `web_search_preview` → `web_search`
- [x] ✅ Grok: Parser actualizado para formato xAI 2026
- [x] ✅ Grok: Probado - 24,428 caracteres en respuesta
- [x] ✅ Edge function desplegada
- [ ] ⏳ **SQL CRONs: PENDIENTE DE EJECUTAR POR EL USUARIO**

---

## Acción Requerida

1. **Abre**: https://supabase.com/dashboard/project/jzkjykmrwisijiqlwuua/sql/new
2. **Copia** el SQL de arriba
3. **Ejecuta** (Run)
4. **Verifica** que las 34 fases muestren el nuevo schedule

Una vez ejecutado, el barrido de mañana domingo empezará a las **01:00 CET** automáticamente.
