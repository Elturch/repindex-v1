-- Weekly CRON job to sync vector store every Sunday at 23:00 UTC
SELECT cron.schedule(
  'sync-vector-store-weekly',
  '0 23 * * 0',
  $$
  SELECT net.http_post(
    url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/populate-vector-store',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body:='{"includeRawResponses": true}'::jsonb
  ) as request_id;
  $$
);