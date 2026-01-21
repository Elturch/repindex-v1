-- Schedule weekly RIX V2 sweep every Sunday at 04:00 UTC (05:00 CET)
SELECT cron.schedule(
  'rix-weekly-sweep-v2',
  '0 4 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body := '{"trigger": "cron", "full_sweep": true}'::jsonb
  ) AS request_id;
  $$
);