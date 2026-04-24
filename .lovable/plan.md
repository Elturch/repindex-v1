# Plan consolidado — Optimización de egress `chat-intelligence-v2`

> Confirmaciones: D1 vista normal · D2 REFRESH dentro del orquestador si futurible · D3 RPC `get_batch_numbers(200)` · D4 dos flags · D5 `normalizeUrlsFromView` SSOT · D6 paridad 50/50 bloqueante · A–E y §1–§5 verificados. Restricciones: NO se tocan prompts, `maxTokens=4000`, modelo `gpt-4o-mini`, orquestador, skills ni `scope_tickers`.

## Objetivo

Bajar de ~750 GB/mes a < 150 GB/mes sin pérdida semántica. Métrica de éxito: hashes idénticos en `regression.ts` para 10 queries canónicas durante 7 días consecutivos en T4.

---

## CONDICIÓN BLOQUEANTE T1 — SQL final que se mostrará en chat antes de ejecutar

Antes de cualquier `CREATE VIEW` en Supabase, se publicará en el chat el siguiente bloque ÍNTEGRO (sin `...`, sin `--`, copy-paste ejecutable). Cualquier desvío → STOP y aviso.

```sql
-- BLOQUE T1 (mostrar en chat antes de ejecutar)
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
    m[1] AS title,
    regexp_replace(m[2], '[.,;:!?]+$', '') AS url
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
    NULL::text AS title,
    regexp_replace(m[1], '[.,;:!?]+$', '') AS url
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

REVOKE ALL ON public.rix_runs_v2_cited_urls FROM PUBLIC;
REVOKE ALL ON public.rix_runs_v2_cited_urls FROM anon, authenticated;
GRANT SELECT ON public.rix_runs_v2_cited_urls TO service_role;
```

Paridad NOISE_DOMAINS:

| `citedSources.ts` (actual) | SQL T1 |
|---|---|
| `schema.org` | `schema.org` |
| `w3.org` | `w3.org` |
| `example.com` | `example.com` |
| `localhost` | `localhost` |

Idénticas, sin diferencias. Cualquier ampliación futura debe hacerse en el mismo PR para TS y SQL.

Índices a crear con T1 (verificar duplicados con `pg_indexes` antes; omitir los ya existentes):

```sql
CREATE INDEX IF NOT EXISTS rix_runs_v2_ticker_period_idx
  ON public.rix_runs_v2 ("05_ticker", "06_period_from");
CREATE INDEX IF NOT EXISTS rix_runs_v2_period_from_idx
  ON public.rix_runs_v2 ("06_period_from");
CREATE INDEX IF NOT EXISTS rix_runs_v2_batch_date_idx
  ON public.rix_runs_v2 (batch_execution_date);
```

---

## Paso T0 — Instrumentación (deploy con flags=false)

- Logging `bytes_fetched_supabase` por skill en `builder.ts`.
- Definir `Deno.env` `CHAT_V2_LAZY_BRUTO` y `CHAT_V2_CITED_URLS_VIEW`, leídos como `false`.
- Crear `datapack/citedSourcesView.ts` con `normalizeUrlsFromView(rows)`.
- Exportar de `citedSources.ts`: `cleanUrl`, `extractDomain`, `extractDateFromUrl`, `NOISE_DOMAINS` para SSOT compartido.
- Suite `tests/regression.ts` con 10 queries canónicas (Iberdrola Q1, Telefónica último mes, ACS vs FCC, 4 utilities, IBEX-35 Q1, grupos hospitalarios, energía vs banca, Santander divergencia, top 10 farmas, ChatGPT vs Perplexity Inditex). Captura SHA-256 de `pre_rendered_tables`, `userMessage`, `metadata`, `cited_sources_count`, `cited_domains_count`.

Criterio de paso: egress idéntico ±5 % vs baseline 7 d, hashes idénticos al baseline para las 10 queries, 0 errores nuevos en `function_edge_logs` durante 24 h.

## Paso T1 — `CREATE VIEW` + paridad 50/50 bloqueante

- Mostrar en chat el SQL del bloque T1 (arriba) + índices.
- Tras aprobación explícita: ejecutar migración Supabase con ese SQL exacto.
- Test paridad 50 filas estratificadas (hospitalario, energía, banca, IBEX-otros, refuerzos antiguos, runs con bare URLs sin md, runs con md sin bare): `extractCitedSources([row])` vs `normalizeUrlsFromView(viewRowsForId)` con `JSON.stringify` idéntico.
- `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM rix_runs_v2_cited_urls WHERE ticker='IBE' AND period_from BETWEEN '2026-01-01' AND '2026-03-31'` objetivo `< 30 ms` p95.
- Aborto: cualquier `diff ≠ ∅` o p95 > 30 ms → STOP, no se activa ningún flag, en 5 d sin solución `DROP VIEW`.

## Paso T2 — `CHAT_V2_LAZY_BRUTO=true`

- `builder.ts`: definir `LIGHT_SELECT` sin las 7 `*_bruto`. Nueva función `fetchRawTextsForCitations(supabase, rows)` que solo se invoca desde `companyAnalysis` y `sectorRanking`. Contenido del DataPack final: idéntico al actual (verificado por hashes).
- `comparison.ts` y `modelDivergence.ts`: quitar `*_bruto` de su `SELECT` local. No consumen citaciones; cero llamada a Fase B.
- Activar flag. Ventana 24 h. Egress esperado ~18 GB/d (de 25). 
- Aborto si: hash regression ≠, egress sube, p95 latencia > baseline + 25 %, error rate > +0.5 pp.

## Paso T3 — `CHAT_V2_CITED_URLS_VIEW=true`

- Precondición bloqueante: T1 paridad verde + T2 estable 48 h.
- `companyAnalysis` y `sectorRanking`: `fetchRawTextsForCitations` deja de leer `*_bruto` y pasa a `SELECT * FROM rix_runs_v2_cited_urls WHERE ticker IN (...) AND period_from IN (...)` → `normalizeUrlsFromView()`.
- `buildPerCompanySourceList` (sectorRanking): refactor a derivado de `CitedSourcesReport` (mapa auxiliar `url → tickers` poblado en una pasada). Output textual idéntico.
- Caché `WeakMap<rowsArray, CitedSourcesReport>` request-scoped.
- Activar flag. Ventana 48 h. Egress esperado ~3.3 GB/d.
- Aborto si: `cited_sources_count` ó `cited_domains_count` divergen, hash ≠, latencia view > 50 ms p95.

## Paso T4 — RPC `get_batch_numbers` + cierre

- Crear RPC `get_batch_numbers(p_limit int DEFAULT 200)` `STABLE SECURITY INVOKER` que UNIONa `rix_runs` + `rix_runs_v2`, devuelve `(batch_date date, source text)` ordenado DESC LIMIT 200. SQL exacto se mostrará en chat antes de ejecutar (misma regla bloqueante que T1).
- `useUnifiedRixRuns:641`: sustituir el doble `select('batch_execution_date')` sin `limit()` por `supabase.rpc('get_batch_numbers', { p_limit: 200 })`.
- Ahorro ~150 GB/mes adicionales.
- Cierre del proyecto cuando: egress proyectado < 150 GB/mes, 7 d sin regresiones en `regression.ts`, 0 incidencias user-reported.

---

## Tipo `CitedUrlRow` (nuevo, en `datapack/citedSourcesView.ts`)

```ts
export interface CitedUrlRow {
  id: string;
  ticker: string;
  row_model: string | null;
  period_from: string;
  period_to: string | null;
  batch_execution_date: string;
  col_label:
    | "ChatGPT" | "Perplexity" | "Gemini"
    | "DeepSeek" | "Claude" | "Grok" | "Qwen";
  url: string;
  domain: string;
  title: string | null;
}
```

`normalizeUrlsFromView(rows)` importa `cleanUrl`, `extractDomain`, `extractDateFromUrl`, `NOISE_DOMAINS` desde `citedSources.ts` (SSOT) y aplica el mismo dedupe `Map<url, {title, models:Set, detectedDate}>`, mismo orden, mismo agrupado por dominio que `extractCitedSources`. Garantía de paridad byte-a-byte verificada en T1.

---

## Rollback (orden estricto)

1. Apagar el flag más reciente (instantáneo, sin redeploy).
2. Si persiste, apagar también el otro flag.
3. **Solo** si los flags llevan ≥ 7 d off y descartados como causa, considerar `DROP VIEW public.rix_runs_v2_cited_urls`.

Hacerlo al revés provocaría 500s mientras el código intenta leer una vista inexistente.

---

## Lo que NO se toca (garantía contractual)

- Prompts: `base.ts`, `antiHallucination.ts`, `periodMode.ts`, `snapshotMode.ts`, `coverageRules.ts`, `rankingMode.ts`, `comparisonMode.ts`, `divergenceMode.ts`.
- `streamOpenAI.ts`: modelo `gpt-4o-mini`, `maxTokens=4000`, temperature actual.
- `orchestrator.ts`: routing, `scope_tickers`, semantic groups, ibex hint.
- Filtrado por subsegmento ya implementado.
- Estructura de 8/9 secciones del informe ni el marcador `<!--CITED_SOURCES_HERE-->`.
- `extractCitedSources` permanece como SSOT de la canonicalización; `normalizeUrlsFromView` la **importa**, no la duplica.

---

## Ahorro proyectado

| Fase | Ahorro acumulado | Flags |
|---|---|---|
| T0 | 0 GB | ambos `false` |
| T1 (vista creada, no usada) | 0 GB | ambos `false` |
| T2 (`LAZY_BRUTO=true`) | ~200 GB/mes | LAZY=true |
| T3 (`CITED_URLS_VIEW=true`) | ~650 GB/mes | ambos true |
| T4 (RPC frontend) | ~800 GB/mes total → consumo final ~100 GB/mes | ambos true |

Cifras [SUPUESTO] derivadas del informe de reconocimiento (9.3 MB × 80 524 invocaciones/mes). Validables con la instrumentación T0.

---

## Deuda futura (fuera del scope actual)

- Migrar `rix_runs` legacy fuera del RPC y del frontend cuando producto confirme archivado.
- Limpiar código muerto: stubs `synthesize`/`generalQuestion` del orchestrator, `buildUserMessage` legacy en `sectorRanking`/`modelDivergence`, `navigator.sendBeacon` 401 en `useActivityLogger`, hook `useRixRuns` legacy, posibles `stubSkill`/`buildMockDatapack` (verificar existencia).
- Considerar materializar la vista solo si latencia > 50 ms p95 al crecer la tabla (REFRESH dentro de `rix-batch-orchestrator`, no `pg_cron`).
- Considerar archivar `*_bruto` a tabla histórica tras 3 meses estables.
