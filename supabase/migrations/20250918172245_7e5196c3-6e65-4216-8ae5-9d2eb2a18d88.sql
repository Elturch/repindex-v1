-- =========================================
-- PRELIMINARES
-- =========================================
-- En Supabase, la extensión pgcrypto suele estar disponible.
-- Si no lo estuviera, descomenta la siguiente línea:
-- create extension if not exists pgcrypto;

-- =========================================
-- TABLA RAÍZ (UNO A MUCHOS CON EL RESTO)
-- Contiene meta + campos de nivel raíz que no son arrays
-- =========================================
create table if not exists public.evaluation (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Guarda el JSON completo (trazabilidad / auditoría)
  raw jsonb,

  -- ---- meta ----
  ejemplo_simulado boolean not null,
  target_name text not null,
  target_type text not null,
  ticker text,
  period_from date,
  period_to date,
  tz text,

  -- ---- composite (objeto plano) ----
  composite_chatgpt integer,
  composite_perplexity integer,
  composite_delta_abs integer,
  composite_delta_pct numeric(10,2),
  composite_winner text,
  composite_cosine_weighted text,

  -- ---- summary.metrics_won (contadores agregados) ----
  metrics_won_chatgpt integer,
  metrics_won_perplexity integer,
  metrics_won_ties integer,

  -- ---- raíz: similarity_note ----
  similarity_note text
);

comment on table public.evaluation is 'Entidad principal que representa una evaluación completa. Incluye meta, composite, summary.metrics_won y similarity_note, además del raw JSON.';

-- Índices prácticos
create index if not exists evaluation_created_at_idx on public.evaluation (created_at desc);
create index if not exists evaluation_target_idx on public.evaluation (target_name, target_type);

-- =========================================
-- meta.weight_scheme (el JSON trae un objeto con claves fijas)
-- Se guarda en una fila por evaluación con columnas LNS, ES, ...
-- =========================================
create table if not exists public.meta_weight_scheme (
  evaluation_id uuid primary key references public.evaluation(id) on delete cascade,
  "LNS" integer not null,
  "ES" integer not null,
  "SAM" integer not null,
  "RM" integer not null,
  "CLR" integer not null,
  "GIP" integer not null,
  "KGI" integer not null,
  "MPI" integer not null,
  total integer not null,
  constraint meta_weight_scheme_total_ck check (total >= 0)
);

comment on table public.meta_weight_scheme is 'Esquema de pesos por métrica (una fila por evaluación). Columnas coinciden con el objeto "weight_scheme".';

-- =========================================
-- meta.source_models (array)
-- =========================================
create table if not exists public.source_models (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,
  model_key text not null,
  model_name text not null,
  run_key text not null
);

create index if not exists source_models_eval_idx on public.source_models (evaluation_id);
create index if not exists source_models_key_idx on public.source_models (model_key);

-- =========================================
-- by_metric (array de objetos con anidados score, contrib_points, contrib_share)
-- Aplanamos los objetos internos con prefijos de columna para mantener la nomenclatura.
-- =========================================
create table if not exists public.by_metric (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,

  -- nivel del item
  metric text not null,
  label text not null,
  weight integer not null,

  -- score.{...}
  score_chatgpt integer not null,
  score_perplexity integer not null,
  score_delta_abs integer not null,
  score_delta_pct numeric(10,2) not null,

  -- contrib_points.{...}
  contrib_points_chatgpt numeric(10,2) not null,
  contrib_points_perplexity numeric(10,2) not null,
  contrib_points_delta numeric(10,2) not null,

  -- contrib_share.{...}
  contrib_share_chatgpt numeric(12,6) not null,
  contrib_share_perplexity numeric(12,6) not null
);

create unique index if not exists by_metric_eval_metric_uq
  on public.by_metric (evaluation_id, metric);

-- =========================================
-- summary.top_drivers (array)
-- =========================================
create table if not exists public.top_drivers (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,
  metric text not null,
  label text not null,
  delta_contrib_abs numeric(10,2) not null,
  direction text not null  -- p.ej. 'Perplexity>ChatGPT'
);

create index if not exists top_drivers_eval_idx on public.top_drivers (evaluation_id);

-- =========================================
-- summary.contadores (objeto con dos sub-objetos: chatgpt y perplexity)
-- Lo modelamos como filas por modelo (model_key in {'chatgpt','perplexity'})
-- con flags como array de texto (text[])
-- =========================================
create table if not exists public.contadores (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,
  model_key text not null check (model_key in ('chatgpt','perplexity')),
  palabras integer not null,
  num_fechas integer not null,
  num_citas integer not null,
  temporal_alignment numeric(4,2) not null, -- p.ej. 0.80
  citation_density numeric(10,3) not null,  -- p.ej. 0.008
  flags text[] not null default '{}'
);

create unique index if not exists contadores_eval_model_uq
  on public.contadores (evaluation_id, model_key);

-- =========================================
-- executive_notes (array de cadenas)
-- =========================================
create table if not exists public.executive_notes (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,
  position integer not null,
  note text not null
);

create unique index if not exists executive_notes_eval_pos_uq
  on public.executive_notes (evaluation_id, position);

-- =========================================
-- recommendations_tactical (array de cadenas)
-- =========================================
create table if not exists public.recommendations_tactical (
  id bigserial primary key,
  evaluation_id uuid not null references public.evaluation(id) on delete cascade,
  position integer not null,
  recommendation text not null
);

create unique index if not exists recommendations_eval_pos_uq
  on public.recommendations_tactical (evaluation_id, position);

-- =========================================
-- VISTAS ÚTILES (opcionales)
-- 1) Vista del compuesto con desglose y ganador
-- 2) Vista de pesos como tabla pivote (unpivot de meta_weight_scheme)
-- =========================================

-- 1) Vista compuesta
create or replace view public.v_evaluation_composite as
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

-- 2) Vista unpivot de weight_scheme para facilitar análisis por métrica
create or replace view public.v_weight_scheme_unpivot as
select evaluation_id, 'LNS' as metric, "LNS"::numeric as weight from public.meta_weight_scheme
union all select evaluation_id, 'ES', "ES"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'SAM', "SAM"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'RM', "RM"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'CLR', "CLR"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'GIP', "GIP"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'KGI', "KGI"::numeric from public.meta_weight_scheme
union all select evaluation_id, 'MPI', "MPI"::numeric from public.meta_weight_scheme;

comment on view public.v_weight_scheme_unpivot is 'Peso por métrica expresado en filas (útil para sumar/join con by_metric).';

-- =========================================
-- TRIGGER (opcional) para validar que la suma de pesos coincide con "total"
-- Nota: se puede desactivar si prefieres flexibilidad.
-- =========================================
create or replace function public.f_meta_weight_scheme_check_total()
returns trigger language plpgsql as $$
begin
  if (new."LNS" + new."ES" + new."SAM" + new."RM" + new."CLR" + new."GIP" + new."KGI" + new."MPI") <> new.total then
    raise exception 'La suma de pesos (LNS..MPI) % no coincide con total %', 
      (new."LNS" + new."ES" + new."SAM" + new."RM" + new."CLR" + new."GIP" + new."KGI" + new."MPI"), new.total;
  end if;
  return new;
end $$;

drop trigger if exists trg_meta_weight_scheme_check_total on public.meta_weight_scheme;
create trigger trg_meta_weight_scheme_check_total
before insert or update on public.meta_weight_scheme
for each row execute function public.f_meta_weight_scheme_check_total();

-- Enable RLS on all tables
ALTER TABLE public.evaluation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_weight_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.by_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations_tactical ENABLE ROW LEVEL SECURITY;

-- Create public access policies for all tables
CREATE POLICY "Acceso público de lectura" ON public.evaluation FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.evaluation FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.evaluation FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.evaluation FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.meta_weight_scheme FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.meta_weight_scheme FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.meta_weight_scheme FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.meta_weight_scheme FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.source_models FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.source_models FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.source_models FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.source_models FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.by_metric FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.by_metric FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.by_metric FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.by_metric FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.top_drivers FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.top_drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.top_drivers FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.top_drivers FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.contadores FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.contadores FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.contadores FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.contadores FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.executive_notes FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.executive_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.executive_notes FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.executive_notes FOR DELETE USING (true);

CREATE POLICY "Acceso público de lectura" ON public.recommendations_tactical FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.recommendations_tactical FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.recommendations_tactical FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.recommendations_tactical FOR DELETE USING (true);