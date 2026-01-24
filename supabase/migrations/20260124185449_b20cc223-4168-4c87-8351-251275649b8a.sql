-- ============================================================================
-- WATCHDOG CRON para Corporate Scrape Orchestrator
-- Se ejecuta cada hora a los :30 minutos para retomar scraping corporativo
-- Sistema: 35 fases, 174 empresas activas
-- ============================================================================

-- Crear el cron job para el watchdog corporativo
SELECT cron.schedule(
  'corporate-scrape-watchdog-hourly',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/corporate-scrape-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODkzNzYsImV4cCI6MjA2MTE2NTM3Nn0.ByPEqSXIr3IfBW2m4MpJUenHdYdu_v1GcBJu1_00x3g"}'::jsonb,
    body := '{"mode": "process_single", "trigger": "watchdog"}'::jsonb
  ) AS request_id;
  $$
);

-- Comentario: 
-- Este watchdog complementa al rix-sweep-watchdog-hourly (que corre a los :00)
-- Entre ambos, el sistema procesa automáticamente ~2 empresas por hora sin intervención
-- Tiempo estimado para 174 empresas: ~87 horas (~3.5 días) en modo totalmente autónomo