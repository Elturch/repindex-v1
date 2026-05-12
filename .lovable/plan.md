
# Plan — Cruce probabilístico SDD del agente RIX (Stress Test)

Objetivo: detectar regresiones del agente `chat-intelligence-v2` en escenarios donde sabemos que falla (Hoteles, SOCIMIs, Promotoras), validando además los 6 modelos individuales y el modo multi-modelo. SDD = especificación primero, ejecución automática después, validación con asserts deterministas (cero "a ojo").

## 1. Spec maestra (SDD)

Archivo nuevo `specs/STRESS-MATRIX.md` (legible) + gemelo `specs/STRESS-MATRIX.json` (consumible por el runner).

Cada celda de la matriz:
- `case_id` estable (ej. `HOT-MEL-MULTI-4w`, `SOCIMI-TOP5-GEMINI-4w`)
- `query` literal en español
- `expected_skill` (sectorRanking | companyAnalysis | comparison | modelDivergence | periodEvolution)
- `scope` (subsector / ibex_family / ticker)
- `model_filter` (`null` = multi-modelo, o uno de: gemini, deepseek, grok, qwen, perplexity, chatgpt)
- `weeks` (1, 2, 4, 8)
- `asserts[]` (lista de checks por id)

### Familias

A) **Subsectores ≤5 empresas** (críticos): Hoteles (1), Aerolíneas (1), Aeropuertos (1), Cosmética (1), Hemoderivados (1), Utilities Eléctricas (3), Big Tech (3), Aseguradoras (3), Farmacéuticas (4), Maquinaria (4), Banca Comercial (6→top-5), Promotoras (7→top-5), Hospitales (7→top-5), SOCIMIs (9→top-5), Renovables (10→top-5), Constructoras (9→top-5).

B) **Sanity IBEX**: IBEX-35 top-5, IBEX-MC top-5, IBEX-SC top-5.

C) **Foco fallo conocido**: Hoteles (MEL solo), SOCIMIs, Promotoras × cada uno de los 6 modelos individuales + multi-modelo.

Total ≈ 120 celdas.

### Asserts deterministas

1. **Scope integrity** (B1): toda URL del Anexo §6 pertenece a tickers del ranking.
2. **Single-model coherence** (B2): si `model_filter ≠ null` → 0 ocurrencias de `entre modelos|consenso multi|los demás modelos|mediana|RIX medio`. Título §5 = `Fuentes citadas por <Modelo>`.
3. **Anti-fabricación dura** (B3): 0 ocurrencias de `Q[1-4]-20\d\d|FY-20\d\d|AGM|target [N0-9]|\+\d+,\d+ pts|horizonte de \d+|data[- ]?room|white[- ]?paper|roadshow|protocolo|webinar|briefing|nota de prensa`.
4. **Subsector small-N**: si N≤3 prohibido decir "top-5"; debe declarar `top-N (N=<n>)` y no rellenar con peers de otro subsector.
5. **Hoteles edge**: si subsector real tiene 1 emisor (MEL), respuesta declara "subsector con 1 único emisor cotizado" y no inventa competidores.
6. **Anti-mediana**: 0 `mediana`.
7. **Period coherence**: fechas dentro de `[snapshot-7·weeks, snapshot]`; nada antes de 2026-01-01.
8. **Models coverage** (multi-modelo): los 6 modelos citados ≥1 vez o ausencia justificada explícita.
9. **Ranking enrichment**: 8 sub-métricas (NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM) presentes en tabla por ticker.
10. **Bibliografía mínima**: §6 ≥1 URL por ticker rankeado; 0 URLs de tickers fuera del ranking.

## 2. Infraestructura BD

Migración con dos tablas (RLS admin-only via `is_admin(auth.uid())`):

```text
audit_runs
  id uuid pk, started_at, finished_at, spec_version text,
  family text, total_cases int, passed int, failed int, errored int,
  triggered_by uuid, notes text

audit_results
  id uuid pk, run_id fk, case_id text, family text,
  query text, model_filter text, weeks int, scope text,
  expected_skill text, actual_skill text,
  latency_ms int, status text ('pass'|'fail'|'error'),
  asserts_passed jsonb, asserts_failed jsonb,
  response_markdown text, response_meta jsonb,
  created_at timestamptz default now()
```

## 3. Edge functions

A) **`stress-matrix-runner`** (nueva)
   - POST `{ family?: 'small'|'sanity'|'hotels-reits'|'all', limit?: int }`
   - Carga `STRESS-MATRIX.json`, crea `audit_runs`, inserta `audit_results` pending.
   - Itera con concurrencia 3, invoca `chat-intelligence-v2` por celda, captura markdown + meta + latencia.
   - Aplica módulo `asserts.ts` (puro Deno, determinista) y actualiza fila.
   - Background con `EdgeRuntime.waitUntil` para evitar timeout HTTP.
   - Valida JWT admin antes de arrancar.

B) **`stress-matrix-report`** (nueva, GET)
   - Resumen del último run: pass-rate global, por familia, por modelo, por subsector. Top fallos con asserts concretos.

## 4. UI admin

Nueva pestaña `/admin` → `Stress Tests`:
- Botón "Lanzar matriz" con selector de familia.
- Tabla histórica `audit_runs` (fecha, total, pass/fail, duración).
- Drill-down por run: tabla filtrable de `audit_results` por status/familia/modelo. Modal con asserts fallados + markdown completo.
- Heatmap: filas=subsectores, columnas=7 (6 modelos + multi), color=pass-rate.

No tocamos UI pública.

## 5. Validación inicial

1. Ejecutar `family=hotels-reits` (≈21 celdas) → reproducir bug Hoteles/SOCIMI.
2. Ejecutar `family=small` (≈100 celdas) → snapshot baseline.
3. Inspeccionar heatmap → backlog priorizado de fixes del agente.

## 6. Detalles técnicos

- Asserts puros Deno, sin LLM-as-judge en v1 (determinismo > recall).
- Runner usa `SUPABASE_SERVICE_ROLE_KEY` internamente; caller debe ser admin (JWT).
- Coste estimado: 120 celdas × 1 invocación, ≈5–10 min con concurrencia 3.
- No tocamos lógica del agente: solo medimos.

## 7. Out of scope

- Auto-fix del agente.
- LLM-as-judge.
- Cron automático (manual desde UI v1).
- Tendencias gráficas inter-runs (sólo tabla simple v1).

## 8. Entregables

1. `specs/STRESS-MATRIX.md` + `.json`
2. Migración: `audit_runs`, `audit_results` + RLS admin-only
3. Edge functions `stress-matrix-runner` + `stress-matrix-report` + `asserts.ts`
4. Pestaña `/admin` → Stress Tests (lanzamiento, historial, heatmap, drill-down)
5. Run inicial `hotels-reits` documentando los fallos reproducidos
