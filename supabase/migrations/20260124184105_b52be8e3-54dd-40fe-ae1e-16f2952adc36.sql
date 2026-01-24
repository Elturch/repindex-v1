-- Crear cron job watchdog para auto-reanudar barridos incompletos
-- Se ejecuta cada hora para verificar si hay empresas pendientes y continuar el proceso
SELECT cron.schedule(
  'rix-sweep-watchdog-hourly',
  '0 * * * *',  -- Cada hora en punto (UTC)
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body := '{"trigger": "watchdog", "fase": "auto", "mode": "resume"}'::jsonb
  ) AS request_id;
  $$
);