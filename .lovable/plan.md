

# RIXc Lite — Mediana + Sigma + IC simple (fase silenciosa)

## Objetivo

Calcular y almacenar el RIXc (RIX Compuesto) como la **mediana robusta** de los 6 modelos, junto con sigma inter-modelo e IC (Indicador de Confiabilidad), sin modificar el pipeline de automatizacion. Solo visible en Admin.

## Cambios

### 1. Nueva tabla: `rix_composite_scores`

```sql
CREATE TABLE public.rix_composite_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  company_name text NOT NULL,
  week_start date NOT NULL,
  rixc_score numeric NOT NULL,
  sigma_intermodelo numeric NOT NULL,
  ic_score numeric NOT NULL,
  consensus_level text NOT NULL,
  models_count integer NOT NULL,
  individual_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticker, week_start)
);
```

- RLS: lectura publica (admin preview), escritura via service_role
- Indice en `(week_start DESC, ticker)`

### 2. Accion en `admin-api` Edge Function

Anadir dos acciones al proxy admin existente:

- **`compute_rixc`**: Calcula el RIXc para una semana dada (o la mas reciente):
  1. Consulta `rix_runs_v2` agrupando por ticker para la semana objetivo
  2. Para cada empresa con 3+ modelos, calcula:
     - `rixc_score = mediana(RIX_1..RIX_n)`
     - `sigma = desviacion estandar de los scores`
     - `ic = max(0, 100 - (sigma * 100 / 12.5))` (12.5 = sigma max historico observado)
     - `consensus_level` segun umbrales: sigma < 3 "Hecho Consolidado", < 5 "Senal Fuerte", < 8 "Divergencia Moderada", < 12 "Narrativa Fragmentada", >= 12 "Dato Inestable"
  3. Upsert en `rix_composite_scores`
  4. Devuelve resumen con totales por nivel de consenso

- **`list_rixc_scores`**: SELECT de la tabla con filtros opcionales (semana, consenso)

### 3. Nuevo componente: `RixcMonitorPanel.tsx`

Panel de Admin con:

- **Boton "Calcular RIXc"** que dispara `compute_rixc` via admin-api
- **Tabla de resultados**: Ticker, Empresa, RIXc, sigma, IC, Consenso (badge coloreado), Modelos
- **Filtros**: por nivel de consenso, busqueda por empresa
- **Resumen en tarjetas**: total empresas calculadas, IC medio, distribucion de consenso
- **Selector de semana** para ver historicos

### 4. Actualizaciones menores

- **`Admin.tsx`**: Anadir tab "RIXc" con icono `Combine` o `Calculator`
- **`rixMetricsGlossary.ts`**: Anadir constante `RIXC_DEFINITION` con nombre, formula, umbrales de consenso (marcado como "en validacion")
- **`Methodology.tsx`**: Anadir seccion breve sobre RIXc al final, con badge "En validacion"
- **`supabase/config.toml`**: No necesita cambios (usa admin-api existente)

## Archivos

| Archivo | Accion |
|---|---|
| Migracion SQL | CREAR -- tabla `rix_composite_scores` + RLS + indice |
| `supabase/functions/admin-api/index.ts` | EDITAR -- anadir `compute_rixc` y `list_rixc_scores` |
| `src/components/admin/RixcMonitorPanel.tsx` | CREAR -- panel de monitoreo |
| `src/pages/Admin.tsx` | EDITAR -- anadir tab "RIXc" |
| `src/lib/rixMetricsGlossary.ts` | EDITAR -- anadir `RIXC_DEFINITION` |
| `src/pages/Methodology.tsx` | EDITAR -- seccion RIXc en validacion |

## Detalles tecnicos

### Formula del calculo

```text
Para cada empresa E en la semana W:
  scores[] = [RIX de cada modelo con datos para E en W]
  if len(scores) < 3: skip (insuficiente cobertura)
  
  RIXc = median(scores)
  sigma = stdev(scores)
  IC = max(0, 100 - (sigma * 100 / 12.5))
  
  consensus = 
    sigma < 3   -> "Hecho Consolidado"
    sigma < 5   -> "Senal Fuerte"  
    sigma < 8   -> "Divergencia Moderada"
    sigma < 12  -> "Narrativa Fragmentada"
    else        -> "Dato Inestable"
```

### Diferencia con el plan completo de 4 fases

Este plan lite omite intencionalmente:
- Normalizacion z-score (fase 1) -- se implementara cuando haya 8+ semanas de datos V2
- Pesos de evidencia DRM x SIM (fase 2) -- requiere validacion empirica
- Pesos de actualidad RMM (fase 3) -- idem
- Encadenamiento automatico en el pipeline -- se dispara manualmente desde Admin

Esto permite recoger datos reales y comparar RIXc-lite vs RIX-promedio antes de comprometerse con la formula completa.

