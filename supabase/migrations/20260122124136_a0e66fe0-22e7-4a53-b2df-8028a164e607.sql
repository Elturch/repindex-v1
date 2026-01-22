-- Eliminar CRON antiguo si existe
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rix-weekly-sweep-v2';

-- Crear 34 CRONs escalonados para el barrido semanal
-- Cada fase se ejecuta cada 5 minutos empezando a las 04:00 UTC los domingos
-- Fase 1: 04:00, Fase 2: 04:05, ..., Fase 34: 06:45

-- Fase 1 - 04:00
SELECT cron.schedule(
  'rix-sweep-phase-01',
  '0 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 1}'::jsonb)$$
);

-- Fase 2 - 04:05
SELECT cron.schedule(
  'rix-sweep-phase-02',
  '5 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 2}'::jsonb)$$
);

-- Fase 3 - 04:10
SELECT cron.schedule(
  'rix-sweep-phase-03',
  '10 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 3}'::jsonb)$$
);

-- Fase 4 - 04:15
SELECT cron.schedule(
  'rix-sweep-phase-04',
  '15 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 4}'::jsonb)$$
);

-- Fase 5 - 04:20
SELECT cron.schedule(
  'rix-sweep-phase-05',
  '20 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 5}'::jsonb)$$
);

-- Fase 6 - 04:25
SELECT cron.schedule(
  'rix-sweep-phase-06',
  '25 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 6}'::jsonb)$$
);

-- Fase 7 - 04:30
SELECT cron.schedule(
  'rix-sweep-phase-07',
  '30 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 7}'::jsonb)$$
);

-- Fase 8 - 04:35
SELECT cron.schedule(
  'rix-sweep-phase-08',
  '35 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 8}'::jsonb)$$
);

-- Fase 9 - 04:40
SELECT cron.schedule(
  'rix-sweep-phase-09',
  '40 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 9}'::jsonb)$$
);

-- Fase 10 - 04:45
SELECT cron.schedule(
  'rix-sweep-phase-10',
  '45 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 10}'::jsonb)$$
);

-- Fase 11 - 04:50
SELECT cron.schedule(
  'rix-sweep-phase-11',
  '50 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 11}'::jsonb)$$
);

-- Fase 12 - 04:55
SELECT cron.schedule(
  'rix-sweep-phase-12',
  '55 4 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 12}'::jsonb)$$
);

-- Fase 13 - 05:00
SELECT cron.schedule(
  'rix-sweep-phase-13',
  '0 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 13}'::jsonb)$$
);

-- Fase 14 - 05:05
SELECT cron.schedule(
  'rix-sweep-phase-14',
  '5 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 14}'::jsonb)$$
);

-- Fase 15 - 05:10
SELECT cron.schedule(
  'rix-sweep-phase-15',
  '10 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 15}'::jsonb)$$
);

-- Fase 16 - 05:15
SELECT cron.schedule(
  'rix-sweep-phase-16',
  '15 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 16}'::jsonb)$$
);

-- Fase 17 - 05:20
SELECT cron.schedule(
  'rix-sweep-phase-17',
  '20 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 17}'::jsonb)$$
);

-- Fase 18 - 05:25
SELECT cron.schedule(
  'rix-sweep-phase-18',
  '25 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 18}'::jsonb)$$
);

-- Fase 19 - 05:30
SELECT cron.schedule(
  'rix-sweep-phase-19',
  '30 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 19}'::jsonb)$$
);

-- Fase 20 - 05:35
SELECT cron.schedule(
  'rix-sweep-phase-20',
  '35 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 20}'::jsonb)$$
);

-- Fase 21 - 05:40
SELECT cron.schedule(
  'rix-sweep-phase-21',
  '40 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 21}'::jsonb)$$
);

-- Fase 22 - 05:45
SELECT cron.schedule(
  'rix-sweep-phase-22',
  '45 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 22}'::jsonb)$$
);

-- Fase 23 - 05:50
SELECT cron.schedule(
  'rix-sweep-phase-23',
  '50 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 23}'::jsonb)$$
);

-- Fase 24 - 05:55
SELECT cron.schedule(
  'rix-sweep-phase-24',
  '55 5 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 24}'::jsonb)$$
);

-- Fase 25 - 06:00
SELECT cron.schedule(
  'rix-sweep-phase-25',
  '0 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 25}'::jsonb)$$
);

-- Fase 26 - 06:05
SELECT cron.schedule(
  'rix-sweep-phase-26',
  '5 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 26}'::jsonb)$$
);

-- Fase 27 - 06:10
SELECT cron.schedule(
  'rix-sweep-phase-27',
  '10 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 27}'::jsonb)$$
);

-- Fase 28 - 06:15
SELECT cron.schedule(
  'rix-sweep-phase-28',
  '15 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 28}'::jsonb)$$
);

-- Fase 29 - 06:20
SELECT cron.schedule(
  'rix-sweep-phase-29',
  '20 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 29}'::jsonb)$$
);

-- Fase 30 - 06:25
SELECT cron.schedule(
  'rix-sweep-phase-30',
  '25 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 30}'::jsonb)$$
);

-- Fase 31 - 06:30
SELECT cron.schedule(
  'rix-sweep-phase-31',
  '30 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 31}'::jsonb)$$
);

-- Fase 32 - 06:35
SELECT cron.schedule(
  'rix-sweep-phase-32',
  '35 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 32}'::jsonb)$$
);

-- Fase 33 - 06:40
SELECT cron.schedule(
  'rix-sweep-phase-33',
  '40 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 33}'::jsonb)$$
);

-- Fase 34 - 06:45
SELECT cron.schedule(
  'rix-sweep-phase-34',
  '45 6 * * 0',
  $$SELECT net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-batch-orchestrator', headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU"}'::jsonb, body:='{"trigger": "cron", "fase": 34}'::jsonb)$$
);