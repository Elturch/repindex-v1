-- Drop obsolete 1-arg signatures superseded by the date-window variants.
drop function if exists public.rix_comparison_datapack(text[]);
drop function if exists public.rix_profile_datapack(text);

CREATE OR REPLACE FUNCTION public.rix_comparison_datapack(p_tickers text[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  win as (
    select coalesce(p_to, (select max(batch_execution_date)::date from rix_runs_v2)) to_d, p_from from_d
  ),
  ref as (
    select max(batch_execution_date)::date d from rix_runs_v2
    where batch_execution_date::date <= (select to_d from win)
  ),
  prevw as (
    select max(batch_execution_date)::date d from rix_runs_v2
    where batch_execution_date::date < (select d from ref)
  ),
  wkcnt as (
    select count(distinct batch_execution_date::date) n from rix_runs_v2
    where (select from_d from win) is not null
      and batch_execution_date::date between (select from_d from win) and (select to_d from win)
  ),
  cfg as (
    select
      ((select from_d from win) is not null and (select n from wkcnt) > 1) is_period,
      case when ((select from_d from win) is not null and (select n from wkcnt) > 1)
           then (select from_d from win) else (select d from ref) end agg_from,
      case when ((select from_d from win) is not null and (select n from wkcnt) > 1)
           then (select to_d from win) else (select d from ref) end agg_to,
      coalesce((select from_d from win), ((select d from ref) - interval '12 weeks')::date) evo_from,
      (select to_d from win) evo_to,
      (select d from ref) ref_week,
      (select d from prevw) prev_week
  ),
  base as (
    select r."05_ticker" tk, r."03_target_name" nm, r."02_model_name" model,
           r.batch_execution_date::date w, r."09_rix_score" rix, r."14_num_citas" num_citas,
           r."23_nvm_score" nvm, r."26_drm_score" drm, r."29_sim_score" sim, r."32_rmm_score" rmm,
           r."35_cem_score" cem, r."38_gam_score" gam, r."41_dcm_score" dcm, r."44_cxm_score" cxm
    from rix_runs_v2 r
    where r."05_ticker" = any(p_tickers)
      and r.batch_execution_date::date between (select evo_from from cfg) and (select agg_to from cfg)
  ),
  wk as (
    select tk, w, avg(rix) arix from base
    where w between (select agg_from from cfg) and (select agg_to from cfg)
    group by tk, w
  ),
  fl as (
    select tk, (array_agg(arix order by w asc))[1] first_v, (array_agg(arix order by w desc))[1] last_v
    from wk group by tk
  ),
  base_raw as (
    select r."05_ticker" tk, r."02_model_name" model,
      coalesce(r."20_res_gpt_bruto", r."21_res_perplex_bruto", r."22_res_gemini_bruto",
               r."23_res_deepseek_bruto", r."respuesta_bruto_grok", r."respuesta_bruto_qwen",
               r."respuesta_bruto_claude", '') raw
    from rix_runs_v2 r
    where r."05_ticker" = any(p_tickers) and r.batch_execution_date::date = (select ref_week from cfg)
  ),
  cite_raw as (
    select tk, model, regexp_replace((regexp_matches(raw, 'https?://[^\s)\]<>"]+', 'g'))[1], '[.,;:!?]+$', '') url
    from base_raw
  ),
  cite_agg as (
    select tk, url, count(distinct model)::int models_count, array_agg(distinct model order by model) models
    from cite_raw where url is not null and length(url) > 12 group by tk, url
  )
  select json_build_object(
    'mode', case when (select is_period from cfg) then 'period' else 'snapshot' end,
    'period_from', (select agg_from from cfg),
    'period_to', (select agg_to from cfg),
    'weeks_count', (select count(distinct w) from base where w between (select agg_from from cfg) and (select agg_to from cfg)),
    'latest_week', (select ref_week from cfg),
    'prev_week', (select prev_week from cfg),
    'entities', (select coalesce(json_agg(json_build_object('ticker', tk, 'name', nm) order by nm), '[]')
                 from (select tk, max(nm) nm from base group by tk) e),
    'snapshot', (
      select coalesce(json_agg(row_to_json(s) order by s.rixc desc nulls last), '[]') from (
        select b.tk, max(b.nm) name,
          round(avg(b.rix) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int rixc,
          case when (select is_period from cfg) then round(f.first_v)::int
               else round(avg(b.rix) filter (where b.w = (select prev_week from cfg)))::int end rixc_prev,
          round(f.first_v)::int rixc_first, round(f.last_v)::int rixc_last,
          min(b.rix) filter (where b.w = (select ref_week from cfg)) rix_min,
          max(b.rix) filter (where b.w = (select ref_week from cfg)) rix_max,
          sum(b.num_citas) filter (where b.w = (select ref_week from cfg))::int num_citas,
          round(avg(b.nvm) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int nvm,
          round(avg(b.drm) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int drm,
          round(avg(b.sim) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int sim,
          round(avg(b.rmm) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int rmm,
          round(avg(b.cem) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int cem,
          round(avg(b.gam) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int gam,
          round(avg(b.dcm) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int dcm,
          round(avg(b.cxm) filter (where b.w between (select agg_from from cfg) and (select agg_to from cfg)))::int cxm
        from base b left join fl f on f.tk = b.tk
        group by b.tk, f.first_v, f.last_v
      ) s
    ),
    'permodel', (
      select coalesce(json_agg(row_to_json(pm) order by pm.tk, pm.model), '[]') from (
        select tk, model, avg(rix) rix from base
        where w between (select agg_from from cfg) and (select agg_to from cfg)
        group by tk, model
      ) pm
    ),
    'evolution', (
      select coalesce(json_agg(row_to_json(ev) order by ev.week, ev.tk), '[]') from (
        select tk, w as week, round(avg(rix))::int rixc from base
        where w between (select evo_from from cfg) and (select evo_to from cfg)
        group by tk, w
      ) ev
    ),
    'citations', (
      select coalesce(json_agg(row_to_json(c) order by c.tk), '[]') from (
        select g.tk, count(*)::int total_sources,
          (select coalesce(json_agg(row_to_json(x)), '[]') from (
            select a.url, substring(a.url from '://([^/]+)') domain, a.models_count, a.models
            from cite_agg a where a.tk = g.tk order by a.models_count desc, a.url
          ) x) items
        from cite_agg g group by g.tk
      ) c
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.rix_profile_datapack(p_ticker text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  win as (select coalesce(p_to, (select max(batch_execution_date)::date from rix_runs_v2)) to_d, p_from from_d),
  ref as (select max(batch_execution_date)::date d from rix_runs_v2 where batch_execution_date::date <= (select to_d from win)),
  prevw as (select max(batch_execution_date)::date d from rix_runs_v2 where batch_execution_date::date < (select d from ref)),
  wkcnt as (select count(distinct batch_execution_date::date) n from rix_runs_v2 where (select from_d from win) is not null and batch_execution_date::date between (select from_d from win) and (select to_d from win)),
  cfg as (
    select ((select from_d from win) is not null and (select n from wkcnt) > 1) is_period,
      case when ((select from_d from win) is not null and (select n from wkcnt) > 1) then (select from_d from win) else (select d from ref) end agg_from,
      case when ((select from_d from win) is not null and (select n from wkcnt) > 1) then (select to_d from win) else (select d from ref) end agg_to,
      coalesce((select from_d from win), ((select d from ref) - interval '12 weeks')::date) evo_from,
      (select to_d from win) evo_to, (select d from ref) ref_week, (select d from prevw) prev_week
  ),
  meta as (select ticker, issuer_name, sector_category, subsector, ibex_family_category from repindex_root_issuers where ticker = p_ticker limit 1),
  ent as (
    select r.batch_execution_date::date w, r."02_model_name" model, r."09_rix_score" rix, r."14_num_citas" num_citas,
           r."23_nvm_score" nvm, r."26_drm_score" drm, r."29_sim_score" sim, r."32_rmm_score" rmm,
           r."35_cem_score" cem, r."38_gam_score" gam, r."41_dcm_score" dcm, r."44_cxm_score" cxm,
           coalesce(r."20_res_gpt_bruto", r."21_res_perplex_bruto", r."22_res_gemini_bruto", r."23_res_deepseek_bruto", r."respuesta_bruto_grok", r."respuesta_bruto_qwen", r."respuesta_bruto_claude", '') raw
    from rix_runs_v2 r where r."05_ticker" = p_ticker
  ),
  wk as (select w, avg(rix) arix from ent where w between (select agg_from from cfg) and (select agg_to from cfg) group by w),
  fl as (select (array_agg(arix order by w asc))[1] first_v, (array_agg(arix order by w desc))[1] last_v from wk),
  sector_rows as (
    select r."05_ticker" tk, r."09_rix_score" rix, r."23_nvm_score" nvm, r."26_drm_score" drm, r."29_sim_score" sim, r."32_rmm_score" rmm, r."35_cem_score" cem, r."38_gam_score" gam, r."41_dcm_score" dcm, r."44_cxm_score" cxm
    from rix_runs_v2 r join repindex_root_issuers i on i.ticker = r."05_ticker"
    where i.sector_category = (select sector_category from meta) and r.batch_execution_date::date = (select ref_week from cfg)
  ),
  sector_ent_rixc as (select tk, avg(rix) arixc from sector_rows group by tk),
  cite_raw as (select regexp_replace((regexp_matches(raw, 'https?://[^\s)\]<>"]+', 'g'))[1], '[.,;:!?]+$', '') url, model from ent where w = (select ref_week from cfg)),
  cite_agg as (select url, count(distinct model)::int models_count, array_agg(distinct model order by model) models from cite_raw where url is not null and length(url) > 12 group by url)
  select json_build_object(
    'mode', case when (select is_period from cfg) then 'period' else 'snapshot' end,
    'period_from', (select agg_from from cfg), 'period_to', (select agg_to from cfg),
    'weeks_count', (select count(distinct w) from ent where w between (select agg_from from cfg) and (select agg_to from cfg)),
    'latest_week', (select ref_week from cfg), 'prev_week', (select prev_week from cfg),
    'entity', (select row_to_json(m) from (select ticker, issuer_name as name, sector_category as sector, subsector, ibex_family_category from meta) m),
    'snapshot', (select row_to_json(s) from (
      select round(avg(rix) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int rixc,
             case when (select is_period from cfg) then round((select first_v from fl))::int else round(avg(rix) filter (where w=(select prev_week from cfg)))::int end rixc_prev,
             round((select first_v from fl))::int rixc_first, round((select last_v from fl))::int rixc_last,
             min(rix) filter (where w=(select ref_week from cfg)) rix_min, max(rix) filter (where w=(select ref_week from cfg)) rix_max,
             sum(num_citas) filter (where w=(select ref_week from cfg))::int num_citas,
             round(avg(nvm) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int nvm,
             round(avg(drm) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int drm,
             round(avg(sim) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int sim,
             round(avg(rmm) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int rmm,
             round(avg(cem) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int cem,
             round(avg(gam) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int gam,
             round(avg(dcm) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int dcm,
             round(avg(cxm) filter (where w between (select agg_from from cfg) and (select agg_to from cfg)))::int cxm
      from ent) s),
    'sector', (select row_to_json(sec) from (
      select (select sector_category from meta) as name, (select count(*) from sector_ent_rixc)::int as size,
             (select 1 + count(*) from sector_ent_rixc where arixc > coalesce((select arixc from sector_ent_rixc where tk = p_ticker), -1))::int as rank,
             round(avg(rix))::int avg_rixc, round(avg(nvm))::int avg_nvm, round(avg(drm))::int avg_drm, round(avg(sim))::int avg_sim,
             round(avg(rmm))::int avg_rmm, round(avg(cem))::int avg_cem, round(avg(gam))::int avg_gam, round(avg(dcm))::int avg_dcm, round(avg(cxm))::int avg_cxm
      from sector_rows) sec),
    'permodel', (select coalesce(json_agg(row_to_json(pm) order by pm.model), '[]') from (
      select model, avg(rix) rix from ent where w between (select agg_from from cfg) and (select agg_to from cfg) group by model) pm),
    'evolution', (select coalesce(json_agg(row_to_json(ev) order by ev.week), '[]') from (
      select w as week, round(avg(rix))::int rixc from ent where w between (select evo_from from cfg) and (select evo_to from cfg) group by w) ev),
    'citations', (select json_build_object('total_sources', (select count(*) from cite_agg),
      'items', (select coalesce(json_agg(row_to_json(x)), '[]') from (select url, substring(url from '://([^/]+)') domain, models_count, models from cite_agg order by models_count desc, url) x)))
  );
$function$;

CREATE OR REPLACE FUNCTION public.rix_citations_batch(p_tickers text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with latest as (select max(batch_execution_date)::date d from rix_runs_v2),
  ent as (
    select r."05_ticker" tk, r."02_model_name" model,
           coalesce(r."20_res_gpt_bruto", r."21_res_perplex_bruto", r."22_res_gemini_bruto",
                    r."23_res_deepseek_bruto", r."respuesta_bruto_grok", r."respuesta_bruto_qwen",
                    r."respuesta_bruto_claude", '') raw
    from rix_runs_v2 r
    where r."05_ticker" = any(p_tickers) and r.batch_execution_date::date = (select d from latest)
  ),
  cite_raw as (
    select tk, model,
           regexp_replace((regexp_matches(raw, 'https?://[^\s)\]<>"]+', 'g'))[1], '[.,;:!?]+$', '') url
    from ent
  ),
  cite_dom as (
    select lower(substring(url from '://(?:www\.)?([^/]+)')) domain, tk, model, url
    from cite_raw
    where url is not null and length(url) > 12
      and lower(substring(url from '://([^/]+)')) not like '%vertexaisearch%'
      and lower(substring(url from '://([^/]+)')) not like '%googleusercontent%'
  ),
  dom_agg as (
    select domain,
           count(distinct model)::int models_count,
           array_agg(distinct model order by model) models,
           count(distinct tk)::int companies_count,
           count(*)::int urls_count,
           (array_agg(url order by url))[1] sample_url
    from cite_dom
    where domain is not null and length(domain) > 3
    group by domain
  )
  select json_build_object(
    'total_domains', (select count(*) from dom_agg),
    'items', (select coalesce(json_agg(row_to_json(x)), '[]') from (
        select domain, models_count, models, companies_count, urls_count, sample_url
        from dom_agg
        order by models_count desc, companies_count desc, urls_count desc, domain
    ) x)
  );
$function$;

grant execute on function public.rix_comparison_datapack(text[], date, date) to anon, authenticated, service_role;
grant execute on function public.rix_profile_datapack(text, date, date) to anon, authenticated, service_role;
grant execute on function public.rix_citations_batch(text[]) to anon, authenticated, service_role;
