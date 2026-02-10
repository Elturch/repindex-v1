

# Plan: Enriquecer el contexto del ranking con metricas completas y codigo IBEX

## Que esta pasando exactamente

El informe muestra solo 9 empresas del IBEX-35, dice "No dispongo de ese dato" para las 8 submetricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM), incluye Solaria como IBEX-35 incorrectamente, y muestra scores inventados (Aena RIX 61 cuando el real es 54).

Antes del cambio de Rix Press, esto no pasaba porque el sistema anterior (aunque con otros problemas) tenia un flujo diferente. Los cambios recientes corrigieron la contaminacion por sales_memento y la agrupacion por modelo, pero dejaron un hueco critico: **la tabla de ranking que ve el LLM solo tiene 4 columnas** (posicion, empresa, ticker, RIX global), sin submetricas ni codigo de familia IBEX.

### Causa raiz unica (lineas 4260-4267 y 4337-4345)

El mapeo de `rankedRecords` solo extrae 5 campos:

```text
company, ticker, model, rixScore, rmmScore
```

Y la tabla inyectada al LLM solo muestra 4:

```text
| # | Empresa | Ticker | RIX |
```

Faltan:
- Las 7 submetricas (NVM, DRM, SIM, CEM, GAM, DCM, CXM) — por eso dice "no dispongo de ese dato" 8 veces
- El `ibex_family_code` — por eso no puede filtrar las 35 empresas del IBEX y solo muestra 9
- Sin ibex_family_code, el LLM "adivina" que empresas son IBEX-35, incluyendo Solaria por error

Seccion 6.1 (linea 4152) SI incluye todas las metricas, pero solo se activa cuando se detecta una empresa especifica en la pregunta. Una pregunta generica como "ranking IBEX-35 ChatGPT" no detecta empresas, asi que la seccion 6.1 queda vacia y el LLM solo dispone del ranking empobrecido.

## Solucion en 2 pasos

### Paso 1: Corregir composicion IBEX-35 en base de datos

Segun MarketScreener (verificado hoy), la DB tiene 36 empresas como IBEX-35. Hay que ajustar a 35:

| Empresa | Estado actual | Estado real | Accion |
|---------|--------------|-------------|--------|
| CIE Automotive (CIE) | IBEX-35 | NO pertenece | Degradar a IBEX-MC |
| Melia Hotels (MEL) | IBEX-35 | NO pertenece | Degradar a IBEX-MC |
| Solaria (SLR) | IBEX-MC | SI pertenece | Promover a IBEX-35 |

Resultado: 36 - 2 + 1 = 35 empresas. Correcto.

Migracion SQL a ejecutar:

```sql
UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-MC', ibex_family_category = 'IBEX Medium Cap'
WHERE ticker IN ('CIE', 'MEL');

UPDATE repindex_root_issuers 
SET ibex_family_code = 'IBEX-35', ibex_family_category = 'IBEX 35'
WHERE ticker = 'SLR';

UPDATE rix_trends SET ibex_family_code = 'IBEX-MC' WHERE ticker IN ('CIE', 'MEL');
UPDATE rix_trends SET ibex_family_code = 'IBEX-35' WHERE ticker IN ('SLR', 'SOLR');
```

### Paso 2: Enriquecer el ranking con submetricas e ibex_family_code

En `supabase/functions/chat-intelligence/index.ts`:

**Cambio A — Mapeo de datos (linea 4260-4267):**

Anadir las 8 submetricas y cruzar con `companiesCache` para obtener ibex_family_code:

```text
.map(run => {
  const companyInfo = companiesCache?.find(
    c => c.ticker === run["05_ticker"]
  );
  return {
    company: run["03_target_name"],
    ticker: run["05_ticker"],
    model: run["02_model_name"],
    rixScore: run["51_rix_score_adjusted"] ?? run["09_rix_score"],
    nvm: run["23_nvm_score"],
    drm: run["26_drm_score"],
    sim: run["29_sim_score"],
    rmm: run["32_rmm_score"],
    cem: run["35_cem_score"],
    gam: run["38_gam_score"],
    dcm: run["41_dcm_score"],
    cxm: run["44_cxm_score"],
    ibexFamily: companyInfo?.ibex_family_code || 'Otro',
    periodFrom: run["06_period_from"],
    periodTo: run["07_period_to"]
  };
})
```

**Cambio B — Tabla del ranking por modelo (lineas 4337-4345):**

Ampliar la tabla con todas las columnas:

```text
| # | Empresa | Ticker | IBEX | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
```

Con esto el LLM podra:
- Filtrar correctamente por IBEX-35 (sin adivinar)
- Citar cada submetrica con su valor exacto
- Mostrar las 35 empresas completas

### Impacto en tamano del contexto

- Antes: 240 filas x ~40 chars = ~9.600 chars
- Despues: 240 filas x ~100 chars = ~24.000 chars (+14.400 chars)
- Incremento total: ~7% del contexto. Aceptable.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| Migracion SQL | Corregir composicion: CIE y MEL a IBEX-MC, SLR a IBEX-35 |
| `supabase/functions/chat-intelligence/index.ts` | Enriquecer rankedRecords con 8 submetricas + ibexFamily; ampliar tabla del ranking por modelo con 12 columnas |

## Resultado esperado

Cuando alguien pregunte "ranking IBEX-35 ChatGPT ultima semana":
- Antes: 9 empresas, sin metricas, Solaria incluida por error, Aena con score inventado
- Despues: 35 empresas correctamente identificadas como IBEX-35, con las 8 metricas exactas del dashboard, sin datos inventados
