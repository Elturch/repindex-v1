-- Fase 1: Limpiar CRON Jobs problemáticos

-- 1. Eliminar job ID 1 (URL incorrecta - apunta a proyecto inexistente)
SELECT cron.unschedule(1);

-- 2. Eliminar job ID 3 (sync-vector-store-sunday) - duplicado de jobs 7+8
SELECT cron.unschedule(3);

-- 3. Eliminar job ID 4 (generate-weekly-news-monday 5AM) - duplicado de job 9 (6AM)
SELECT cron.unschedule(4);