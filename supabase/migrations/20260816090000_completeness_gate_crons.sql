-- sweep-completeness-gate · GATE DE COMPLETITUD tras el barrido semanal.
-- Reemplaza el cron sweep-absent-repair-sun-2230 (22:30 dom, ~19h tarde) por varias pasadas
-- JUSTO TRAS EL BARRIDO (dom 03:30/05:00/06:30/08:00 UTC) + backstop lun 05:30 UTC.
-- El bearer (publishable key) se extrae EN TIEMPO DE EJECUCIÓN vía regexp desde el job
-- refresh-issuer-status-monthly (no se hardcodea ningún secreto en el comando).

-- 1) Retira los crons antiguos de sweep-absent-repair y cualquier cron de gate previo (idempotente)
DO $mig$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT jobid FROM cron.job WHERE jobname IN (
      'sweep-absent-repair-sun-2230',
      'sweep-absent-repair-mon-0530',
      'sweep-gate-sun-0330','sweep-gate-sun-0500','sweep-gate-sun-0630','sweep-gate-sun-0800','sweep-gate-mon-0530'
    )
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END
$mig$;

-- 2) Programa las pasadas del gate. Cada comando resuelve el bearer por regexp en runtime.
SELECT cron.schedule('sweep-gate-sun-0330','30 3 * * 0', $cmd$
select net.http_post(
  url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-gate',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] from cron.job where jobname='refresh-issuer-status-monthly' limit 1)),
  body:='{"trigger":"sun-0330"}'::jsonb,
  timeout_milliseconds:=175000);
$cmd$);

SELECT cron.schedule('sweep-gate-sun-0500','0 5 * * 0', $cmd$
select net.http_post(
  url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-gate',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] from cron.job where jobname='refresh-issuer-status-monthly' limit 1)),
  body:='{"trigger":"sun-0500"}'::jsonb,
  timeout_milliseconds:=175000);
$cmd$);

SELECT cron.schedule('sweep-gate-sun-0630','30 6 * * 0', $cmd$
select net.http_post(
  url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-gate',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] from cron.job where jobname='refresh-issuer-status-monthly' limit 1)),
  body:='{"trigger":"sun-0630"}'::jsonb,
  timeout_milliseconds:=175000);
$cmd$);

-- Última pasada del domingo: final=true → email de confirmación si hubo reparaciones.
SELECT cron.schedule('sweep-gate-sun-0800','0 8 * * 0', $cmd$
select net.http_post(
  url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-gate',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] from cron.job where jobname='refresh-issuer-status-monthly' limit 1)),
  body:='{"trigger":"sun-0800","final":true}'::jsonb,
  timeout_milliseconds:=175000);
$cmd$);

-- Backstop del lunes: final=true → email de confirmación si hubo reparaciones.
SELECT cron.schedule('sweep-gate-mon-0530','30 5 * * 1', $cmd$
select net.http_post(
  url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-gate',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] from cron.job where jobname='refresh-issuer-status-monthly' limit 1)),
  body:='{"trigger":"mon-0530","final":true}'::jsonb,
  timeout_milliseconds:=175000);
$cmd$);
