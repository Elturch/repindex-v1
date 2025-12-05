
-- Enable pg_net extension if not already enabled (needed for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create cron job to repopulate vector store every Sunday at 23:00 UTC
-- This runs after the weekly data load completes
SELECT cron.schedule(
  'repopulate-vector-store-weekly',
  '0 23 * * 0', -- Every Sunday at 23:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://yfbkrnhmpcrxsxjudbeh.supabase.co/functions/v1/populate-vector-store',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"clean": false, "includeRawResponses": true}'::jsonb
  ) AS request_id;
  $$
);
