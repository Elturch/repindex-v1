-- Schedule vector store sync every Sunday at 23:00 UTC (00:00 CET)
-- Also runs every 5 minutes between 23:00-23:59 UTC if processing continues
SELECT cron.schedule(
  'populate-vector-store-weekly',
  '0 23 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/populate-vector-store',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body := '{"trigger": "cron", "mode": "incremental"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule vector store continuation every 5 minutes between 23:05-23:55 UTC on Sundays
SELECT cron.schedule(
  'populate-vector-store-continuation',
  '5,10,15,20,25,30,35,40,45,50,55 23 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/populate-vector-store',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body := '{"trigger": "cron", "mode": "continuation"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule weekly news generation every Monday at 06:00 UTC (07:00 CET)
SELECT cron.schedule(
  'generate-news-story-weekly',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/generate-news-story',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb,
    body := '{"trigger": "cron", "generate_all": true}'::jsonb
  ) AS request_id;
  $$
);