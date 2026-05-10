## Plan: Estudio de Consenso recurrente desde /admin

Añadir un botón en el panel /admin que reproduzca el estudio empírico ya ejecutado (Fase 1) sobre `rix_runs_v2` para monitorizar, semana a semana, si la hipótesis "consenso de crisis" emerge a medida que se acumulan datos y se popula `weekly_theme_tags`.

### 1. Edge function `consensus-health-study` (nueva)

Reproduce 1:1 la lógica del script Python original, en TypeScript/Deno:

- Lee de `rix_runs_v2`: `ticker, week_of, model, rix_score` desde `2026-01-01` hasta hoy.
- Por (ticker, week_of) calcula: `mean`, `min`, `max`, `range = max-min`, `std`, `n_models`.
- Filtra muestras con `n_models >= 4` (idéntico al estudio original).
- Métricas globales:
  - n muestras, n tickers, n semanas, semanas cubiertas
  - Distribución por estado: `crisis` (range≤10 ∧ mean<50), `healthy` (range≤10 ∧ mean≥70), `dispersed` (range>20), `neutral` (resto) — porcentajes y conteos
  - Mediana de `range` por banda de polaridad: `<50`, `50-65`, `≥65`
  - Spearman ρ (mean vs range) + p-valor aproximado (z-test sobre Fisher)
  - Test Mann-Whitney U entre bandas `<50` y `≥65` sobre `range`
  - Top 10 casos paradigmáticos de "consenso de crisis"
- Si `weekly_theme_tags` tiene filas en el rango: añade segmento adicional `range` segmentado por tag dominante (negativa/neutra/positiva) y repite el test. Si está vacía, lo indica explícitamente.
- Guarda el resultado en una tabla nueva `consensus_health_studies` (snapshot histórico) y devuelve el JSON al cliente.
- Protegida con `requireAdmin` + `logAdminAction` (patrón existente en `_shared/requireAdmin.ts`).

### 2. Tabla `consensus_health_studies` (migración)

```text
id uuid pk
created_at timestamptz default now()
created_by uuid (admin id)
period_start date
period_end date
n_samples int
n_tickers int
n_weeks int
state_distribution jsonb     -- {crisis: n/pct, healthy, dispersed, neutral}
range_by_polarity jsonb      -- {bearish, neutral, bullish: {median, n}}
spearman jsonb               -- {rho, p_value, n}
mann_whitney jsonb           -- {U, p_value}
theme_tags_available bool
range_by_theme jsonb null    -- solo si theme tags disponibles
top_crisis_cases jsonb       -- array de {ticker, week_of, mean, range}
hypothesis_verdict text      -- 'refuted' | 'inconclusive' | 'supported'
notes text null
```

RLS: solo lectura para `admin` vía `has_role(auth.uid(),'admin')`. Sin escritura desde cliente (la edge function usa service role).

### 3. UI en `src/pages/Admin.tsx`

Nueva tarjeta dentro de la sección de monitorización (junto a `QualityAuditPanel` / `PipelineAlertsPanel`). Componente nuevo `src/components/admin/ConsensusHealthPanel.tsx`:

- Botón **"Ejecutar estudio de consenso"** → invoca la edge function, muestra spinner.
- Al terminar: tarjeta con
  - Veredicto destacado (badge: refutada / inconclusa / soportada) + comparación frente al snapshot anterior (delta de mediana de range bearish vs bullish, delta de % crisis).
  - Tabla de distribución de estados.
  - Mediana de `range` por banda de polaridad (3 filas).
  - Spearman ρ y p-valor.
  - Mann-Whitney U y p-valor.
  - Aviso si `weekly_theme_tags` aún sin datos.
  - Top 10 casos crisis (ticker, semana, mean, range).
- Lista colapsable con los **últimos 10 snapshots históricos** (fecha, n muestras, % crisis, mediana range bearish, veredicto) para ver evolución temporal.
- Sin export PDF en esta iteración (los datos quedan en BD; suficiente para revisión interna).

### 4. Qué NO entra

- No tocamos producto público, ni metodología expuesta, ni el cálculo del RIX.
- No reactivamos las Fases 2/3 del plan anterior — siguen en HOLD hasta que un snapshot soporte la hipótesis.
- No automatizamos vía CRON en esta iteración (botón manual; si más adelante interesa, se añade un cron semanal trivial sobre la misma función).

### Detalles técnicos

- Spearman: ranking + Pearson sobre rangos; p-valor con aproximación normal (`z = ρ·√(n-1)`).
- Mann-Whitney: implementación O(n log n) con ranks y corrección por empates; p-valor normal con corrección de continuidad.
- Veredicto:
  - `supported` si `median_range(bearish) < median_range(bullish) - 2` y `p < 0.05`.
  - `refuted` si `median_range(bearish) >= median_range(bullish)` y `p < 0.05`.
  - `inconclusive` en el resto.
- La función almacena el snapshot SIEMPRE que se ejecuta para construir la serie temporal.
