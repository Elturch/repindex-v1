-- 20260807_sweep_absent_repair.sql
-- BLINDAJE anti-ausencias del barrido semanal RepIndex.
-- Cubre el hueco del enforcer existente (enforce_sweep_completeness), que solo repara
-- CELDAS incompletas (score null en filas que EXISTEN) y NO detecta emisores activos
-- totalmente AUSENTES (0 filas esa semana) -- causa raiz del incidente 2026-08-02
-- (IBE, ADX, ART2, GAM, NET quedaron fuera sin aviso).
--
-- Contenido:
--   1) RPC public.rix_absent_issuers(p_week date default null)
--   2) 2 crons pg_cron que disparan la edge function sweep-absent-repair
--      Domingo 22:30 UTC y Lunes 05:30 UTC (tras el barrido de 21:00 y los enforcers).
--      OJO: en este proyecto SUPABASE_ANON_KEY == publishable key moderna
--      (sb_publishable_...). La edge function (verify_jwt=false) exige bearer entrante
--      == SUPABASE_SERVICE_ROLE_KEY o == SUPABASE_ANON_KEY, por lo que el cron debe
--      enviar la publishable key. Se extrae del job 'refresh-issuer-status-monthly'
--      (regexp, sin hardcodear secretos).
--
-- NOTA: la edge function sweep-absent-repair y el retoque de sweep-completeness-report
-- (linea "emisores ausentes reparados") son CODIGO (supabase/functions/**), tambien
-- versionados en el repo; no requieren DDL aqui.

CREATE OR REPLACE FUNCTION public.rix_absent_issuers(p_week date DEFAULT NULL::date)
 RETURNS TABLE(ticker text, issuer_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with wk as (
    select coalesce(p_week, (select max(batch_execution_date)::date from rix_runs_v2)) as w
  )
  select i.ticker, i.issuer_name
  from repindex_root_issuers i
  where coalesce(i.status, 'active') = 'active'
    and i.ticker is not null
    and not exists (
      select 1 from rix_runs_v2 r
      where r."05_ticker" = i.ticker
        and r.batch_execution_date::date = (select w from wk)
    )
  order by i.ticker;
$function$;

DO $do$
DECLARE
  v_auth text;
  v_url  text := 'https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-absent-repair';
  v_cmd_sun text;
  v_cmd_mon text;
BEGIN
  SELECT (regexp_match(command, 'Bearer ([A-Za-z0-9._-]+)'))[1]
    INTO v_auth
  FROM cron.job
  WHERE jobname = 'refresh-issuer-status-monthly'
  LIMIT 1;

  IF v_auth IS NULL OR v_auth NOT LIKE 'sb_publishable_%' THEN
    RAISE EXCEPTION 'sweep-absent-repair crons: no pude extraer la publishable key de cron.job (refresh-issuer-status-monthly)';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('sweep-absent-repair-sun-2230', 'sweep-absent-repair-mon-0530');

  v_cmd_sun := format(
    $j$select net.http_post(url:=%L, headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body:='{"trigger":"cron-sun-2230"}'::jsonb, timeout_milliseconds:=175000);$j$,
    v_url, v_auth);
  v_cmd_mon := format(
    $j$select net.http_post(url:=%L, headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body:='{"trigger":"cron-mon-0530"}'::jsonb, timeout_milliseconds:=175000);$j$,
    v_url, v_auth);

  PERFORM cron.schedule('sweep-absent-repair-sun-2230', '30 22 * * 0', v_cmd_sun);
  PERFORM cron.schedule('sweep-absent-repair-mon-0530', '30 5 * * 1', v_cmd_mon);
END
$do$;
