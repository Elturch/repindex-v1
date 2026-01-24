-- ============================================================================
-- UPGRADE: Watchdogs de cada hora a cada 15 minutos
-- Resultado: 4x más rápido - 174 empresas en ~2 días en lugar de ~7 días
-- ============================================================================

-- Eliminar los cron jobs actuales
SELECT cron.unschedule('rix-sweep-watchdog-hourly');
SELECT cron.unschedule('corporate-scrape-watchdog-hourly');

-- RIX watchdog cada 15 minutos (minutos 0, 15, 30, 45)
SELECT cron.schedule(
  'rix-sweep-watchdog-15min',
  '0,15,30,45 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODkzNzYsImV4cCI6MjA2MTE2NTM3Nn0.ByPEqSXIr3IfBW2m4MpJUenHdYdu_v1GcBJu1_00x3g"}'::jsonb,
    body := '{"trigger": "watchdog", "fase": "auto", "mode": "resume"}'::jsonb
  ) AS request_id;
  $$
);

-- Corporate watchdog cada 15 minutos (minutos 7, 22, 37, 52 - desfasado para evitar colisiones)
SELECT cron.schedule(
  'corporate-scrape-watchdog-15min',
  '7,22,37,52 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/corporate-scrape-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODkzNzYsImV4cCI6MjA2MTE2NTM3Nn0.ByPEqSXIr3IfBW2m4MpJUenHdYdu_v1GcBJu1_00x3g"}'::jsonb,
    body := '{"mode": "process_single", "trigger": "watchdog"}'::jsonb
  ) AS request_id;
  $$
);