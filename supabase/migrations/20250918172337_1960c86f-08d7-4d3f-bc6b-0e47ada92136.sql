-- Fix security issues from the evaluation schema

-- Drop and recreate views with proper security context
DROP VIEW IF EXISTS public.v_evaluation_composite;
DROP VIEW IF EXISTS public.v_weight_scheme_unpivot;

-- Recreate views with SECURITY INVOKER (default, safer option)
CREATE VIEW public.v_evaluation_composite 
WITH (security_invoker = true) AS
select
  e.id,
  e.created_at,
  e.target_name,
  e.target_type,
  e.ticker,
  e.period_from,
  e.period_to,
  e.tz,
  e.composite_chatgpt,
  e.composite_perplexity,
  e.composite_delta_abs,
  e.composite_delta_pct,
  e.composite_winner,
  e.composite_cosine_weighted,
  e.metrics_won_chatgpt,
  e.metrics_won_perplexity,
  e.metrics_won_ties,
  e.similarity_note
from public.evaluation e;

comment on view public.v_evaluation_composite is 'Resumen de cada evaluación con métricas compuestas y notas de similitud.';

-- Recreate unpivot view with SECURITY INVOKER
CREATE VIEW public.v_weight_scheme_unpivot 
WITH (security_invoker = true) AS
select evaluation_id, 'LNS' as metric, "LNS"::numeric as weight from public.meta_weight_scheme
union all select evaluation_id, 'ES', "ES"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'SAM', "SAM"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'RM', "RM"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'CLR', "CLR"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'GIP', "GIP"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'KGI', "KGI"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'MPI', "MPI"::numeric from public.meta_weight_scheme;

comment on view public.v_weight_scheme_unpivot is 'Peso por métrica expresado en filas (útil para sumar/join con by_metric).';

-- Fix the function with proper search_path
CREATE OR REPLACE FUNCTION public.f_meta_weight_scheme_check_total()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  if (new."LNS" + new."ES" + new."SAM" + new."RM" + new."CLR" + new."GIP" + new."KGI" + new."MPI") <> new.total then
    raise exception 'La suma de pesos (LNS..MPI) % no coincide con total %', 
      (new."LNS" + new."ES" + new."SAM" + new."RM" + new."CLR" + new."GIP" + new."KGI" + new."MPI"), new.total;
  end if;
  return new;
end $function$;