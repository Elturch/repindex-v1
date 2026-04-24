-- =====================================================================
-- T1 atómico: índices + vista + permisos
-- =====================================================================

-- (a) Índices de soporte sobre rix_runs_v2 (idempotentes)
CREATE INDEX IF NOT EXISTS rix_runs_v2_ticker_period_idx
  ON public.rix_runs_v2 ("05_ticker", "06_period_from");

CREATE INDEX IF NOT EXISTS rix_runs_v2_period_from_idx
  ON public.rix_runs_v2 ("06_period_from");

CREATE INDEX IF NOT EXISTS rix_runs_v2_batch_date_idx
  ON public.rix_runs_v2 (batch_execution_date);

-- (b) Vista pública.rix_runs_v2_cited_urls
CREATE OR REPLACE VIEW public.rix_runs_v2_cited_urls AS
WITH unpivot AS (
  SELECT
    r.id,
    r."05_ticker"           AS ticker,
    r."02_model_name"       AS row_model,
    r."06_period_from"      AS period_from,
    r."07_period_to"        AS period_to,
    r.batch_execution_date,
    v.col_label,
    v.col_text
  FROM public.rix_runs_v2 r
  CROSS JOIN LATERAL (VALUES
    ('ChatGPT'::text,    r."20_res_gpt_bruto"),
    ('Perplexity'::text, r."21_res_perplex_bruto"),
    ('Gemini'::text,     r."22_res_gemini_bruto"),
    ('DeepSeek'::text,   r."23_res_deepseek_bruto"),
    ('Claude'::text,     r.respuesta_bruto_claude),
    ('Grok'::text,       r.respuesta_bruto_grok),
    ('Qwen'::text,       r.respuesta_bruto_qwen)
  ) AS v(col_label, col_text)
  WHERE v.col_text IS NOT NULL AND length(v.col_text) > 0
),
md_links AS (
  SELECT
    u.id, u.ticker, u.row_model, u.period_from, u.period_to, u.batch_execution_date,
    u.col_label,
    'md'::text AS source_kind,
    m[1]                                          AS title,
    regexp_replace(m[2], '[.,;:!?]+$', '')        AS url
  FROM unpivot u,
       LATERAL regexp_matches(
         u.col_text,
         '\[([^]\n]{1,200})\]\((https?://[^[:space:])\]"<>]+)\)',
         'g'
       ) AS m
),
bare_urls AS (
  SELECT
    u.id, u.ticker, u.row_model, u.period_from, u.period_to, u.batch_execution_date,
    u.col_label,
    'bare'::text AS source_kind,
    NULL::text                                     AS title,
    regexp_replace(m[1], '[.,;:!?]+$', '')         AS url
  FROM unpivot u,
       LATERAL regexp_matches(
         u.col_text,
         'https?://[^[:space:])\]"<>]+',
         'g'
       ) AS m
),
all_urls AS (
  SELECT id, ticker, row_model, period_from, period_to, batch_execution_date,
         col_label, source_kind, title, url
  FROM md_links
  UNION ALL
  SELECT id, ticker, row_model, period_from, period_to, batch_execution_date,
         col_label, source_kind, title, url
  FROM bare_urls
),
with_domain AS (
  SELECT
    a.id, a.ticker, a.row_model, a.period_from, a.period_to, a.batch_execution_date,
    a.col_label, a.source_kind, a.title, a.url,
    lower(regexp_replace(
      COALESCE((regexp_match(a.url, '^https?://([^/?#]+)'))[1], ''),
      '^www\.', ''
    )) AS domain
  FROM all_urls a
  WHERE a.url IS NOT NULL AND length(a.url) > 0
),
filtered AS (
  SELECT *
  FROM with_domain w
  WHERE w.domain <> ''
    AND w.domain NOT IN (
      'schema.org',
      'w3.org',
      'example.com',
      'localhost'
    )
)
SELECT
  f.id,
  f.ticker,
  f.row_model,
  f.period_from,
  f.period_to,
  f.batch_execution_date,
  f.col_label,
  f.url,
  f.domain,
  MAX(CASE WHEN f.source_kind = 'md' THEN f.title END) AS title
FROM filtered f
GROUP BY
  f.id, f.ticker, f.row_model, f.period_from, f.period_to, f.batch_execution_date,
  f.col_label, f.url, f.domain
ORDER BY
  f.batch_execution_date DESC, f.id, f.col_label, f.url;

-- (c) Permisos: solo service_role
REVOKE ALL ON public.rix_runs_v2_cited_urls FROM PUBLIC;
REVOKE ALL ON public.rix_runs_v2_cited_urls FROM anon, authenticated;
GRANT  SELECT ON public.rix_runs_v2_cited_urls TO service_role;