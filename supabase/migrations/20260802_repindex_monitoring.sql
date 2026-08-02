-- 20260802_repindex_monitoring.sql
-- Versionado (copia de seguridad en el repo) del stack de MONITORIZACION del barrido RepIndex.
-- Estos objetos YA existen y funcionan en Supabase (proyecto jzkjykmrwisijiqlwuua); este fichero
-- es solo la copia fiel para el repo. Todo es idempotente y seguro de re-aplicar.
-- Contiene: (1) tabla model_health_checks + indice + RLS, (2) las 3 funciones de completitud
-- con sus grants, y (3) los 8 cron jobs (reutilizando el bearer de un cron existente, sin hardcodear el secreto).

-- ============================================================
-- 1) Tabla de salud de modelos + indice + RLS
-- ============================================================
create table if not exists public.model_health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  provider text,
  display_name text,
  model_string text,
  endpoint text,
  status text,
  http_status int,
  latency_ms int,
  error_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_health_checked_at
  on public.model_health_checks (checked_at desc);

alter table public.model_health_checks enable row level security;

-- ============================================================
-- 2) Funciones de completitud del barrido (create or replace, verbatim desde la BD)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rix_incomplete_cells(p_week date)
 RETURNS TABLE(id uuid, ticker text, model_name text, has_bruto boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r."05_ticker", r."02_model_name",
    (coalesce(length(case r."02_model_name"
       when 'ChatGPT'        then r."20_res_gpt_bruto"
       when 'Perplexity'     then r."21_res_perplex_bruto"
       when 'Google Gemini'  then r."22_res_gemini_bruto"
       when 'Deepseek'       then r."23_res_deepseek_bruto"
       when 'Grok'           then r."respuesta_bruto_grok"
       when 'Qwen'           then r."respuesta_bruto_qwen"
     end),0) >= 100) as has_bruto
  from rix_runs_v2 r
  where r.batch_execution_date::date = p_week and r."09_rix_score" is null;
$function$;

CREATE OR REPLACE FUNCTION public.rix_model_completeness(p_week date)
 RETURNS TABLE(model_name text, total bigint, scored bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select "02_model_name", count(*)::bigint, count(*) filter (where "09_rix_score" is not null)::bigint
  from rix_runs_v2 where batch_execution_date::date = p_week group by 1 order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_sweep_completeness(p_week date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_auth text; v_week date; c record; n_search int:=0; n_analyze int:=0;
begin
  select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] into v_auth
  from cron.job where jobname='seed-sweep-queue-sunday' limit 1;
  v_week := coalesce(p_week, (select max(batch_execution_date)::date from rix_runs_v2));

  for c in select * from public.rix_incomplete_cells(v_week) loop
    if not c.has_bruto then
      perform net.http_post(
        url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-search-v2',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_auth),
        body:=jsonb_build_object('ticker',c.ticker,'single_model',c.model_name,'repair_mode',true),
        timeout_milliseconds:=175000);
      n_search := n_search + 1;
    else
      perform net.http_post(
        url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-analyze-v2',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_auth),
        body:=jsonb_build_object('record_id',c.id),
        timeout_milliseconds:=175000);
      n_analyze := n_analyze + 1;
    end if;
  end loop;
  return json_build_object('week', v_week, 'fired_search', n_search, 'fired_analyze', n_analyze);
end;
$function$;

-- Grants de las funciones
grant execute on function public.rix_incomplete_cells(date) to service_role, anon, authenticated;
grant execute on function public.rix_model_completeness(date) to service_role, anon, authenticated;
grant execute on function public.enforce_sweep_completeness(date) to service_role;

-- ============================================================
-- 3) Cron jobs (8). Reutiliza el bearer de un cron existente (seed-sweep-queue-sunday)
--    para NO hardcodear el secreto. Idempotente: desprograma y reprograma.
-- ============================================================
do $$
declare v_auth text; v_http text; jn text;
begin
  select (regexp_match(command,'Bearer ([A-Za-z0-9._-]+)'))[1] into v_auth from cron.job where jobname='seed-sweep-queue-sunday' limit 1;
  -- desprograma si existen y reprograma (idempotente)
  foreach jn in array array['rix-consenso-weekly','model-health-daily','model-health-presweep-sat','sweep-enforce-sun-03','sweep-enforce-sun-06','sweep-enforce-sun-09','sweep-enforce-mon-04','sweep-report-mon-06'] loop
    if exists (select 1 from cron.job where jobname=jn) then perform cron.unschedule(jn); end if;
  end loop;
  perform cron.schedule('rix-consenso-weekly','0 21 * * 0', format($f$select net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rix-consenso', headers:=jsonb_build_object('Content-Type','application/json','Authorization',%L), body:='{"all": true}'::jsonb, timeout_milliseconds:=60000);$f$,'Bearer '||v_auth));
  perform cron.schedule('model-health-daily','0 8 * * *', format($f$select net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/model-health-canary', headers:=jsonb_build_object('Content-Type','application/json','Authorization',%L), body:='{}'::jsonb, timeout_milliseconds:=60000);$f$,'Bearer '||v_auth));
  perform cron.schedule('model-health-presweep-sat','0 22 * * 6', format($f$select net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/model-health-canary', headers:=jsonb_build_object('Content-Type','application/json','Authorization',%L), body:='{}'::jsonb, timeout_milliseconds:=60000);$f$,'Bearer '||v_auth));
  perform cron.schedule('sweep-enforce-sun-03','0 3 * * 0','select public.enforce_sweep_completeness();');
  perform cron.schedule('sweep-enforce-sun-06','0 6 * * 0','select public.enforce_sweep_completeness();');
  perform cron.schedule('sweep-enforce-sun-09','0 9 * * 0','select public.enforce_sweep_completeness();');
  perform cron.schedule('sweep-enforce-mon-04','0 4 * * 1','select public.enforce_sweep_completeness();');
  perform cron.schedule('sweep-report-mon-06','0 6 * * 1', format($f$select net.http_post(url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/sweep-completeness-report', headers:=jsonb_build_object('Content-Type','application/json','Authorization',%L), body:='{}'::jsonb, timeout_milliseconds:=60000);$f$,'Bearer '||v_auth));
end $$;
