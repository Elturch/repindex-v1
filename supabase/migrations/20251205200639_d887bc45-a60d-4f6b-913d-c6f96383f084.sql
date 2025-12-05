-- Remove single execution CRON
SELECT cron.unschedule('sync-vector-store-weekly');

-- Create CRON that runs every 5 minutes on Sundays 23:00-23:59 UTC
-- This gives ~12 executions × 70 docs = 840 docs (enough for weekly ~612 new docs)
SELECT cron.schedule(
  'sync-vector-store-sunday',
  '*/5 23 * * 0',
  $$
  SELECT net.http_post(
    url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/populate-vector-store',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body:='{"includeRawResponses": true}'::jsonb
  ) as request_id;
  $$
);