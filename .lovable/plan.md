

# Repoblacion Vector Store + Guardrail IBEX 35 Semanal

## Parte 1: Repoblar el Vector Store con datos IBEX corregidos

### Problema
Los documentos existentes en el Vector Store contienen `ibex_family_code` incorrecto en sus metadatos para Acciona Energia y Catalana Occidente (y potencialmente en el texto embebido). Dado que el Vector Store es incremental (nunca borra), los documentos antiguos con datos erroneos siguen ahi.

### Solucion
No es necesario regenerar embeddings. Los metadatos del Vector Store (`metadata.ibex_family_code`) se usan para filtrado, no para contenido semantico. Se corregiran directamente via SQL:

```sql
-- Corregir metadatos en documentos del Vector Store
UPDATE documents 
SET metadata = jsonb_set(metadata, '{ibex_family_code}', '"IBEX-35"')
WHERE metadata->>'ticker' IN ('ANE', 'ANE.MC')
  AND metadata->>'ibex_family_code' != 'IBEX-35';

UPDATE documents 
SET metadata = jsonb_set(metadata, '{ibex_family_code}', '"IBEX-MC"')
WHERE metadata->>'ticker' IN ('CAT', 'GCO.MC')
  AND metadata->>'ibex_family_code' != 'IBEX-MC';
```

Esto corrige los metadatos sin necesidad de re-generar embeddings (que es costoso y lento). El campo `ibex_family_code` en el contenido de texto no afecta a la busqueda semantica de forma significativa.

---

## Parte 2: Nuevo Guardrail - Verificacion IBEX 35 Semanal

### Arquitectura

Se creara una nueva Edge Function `verify-ibex-composition` que:

1. Consulta la API de EODHD para obtener la composicion actual del IBEX 35: `https://eodhd.com/api/fundamentals/IBEX.INDX?api_token=KEY&fmt=json`
2. Compara con los registros `ibex_family_code = 'IBEX-35'` en `repindex_root_issuers`
3. Si hay discrepancias (entradas/salidas):
   - Actualiza `repindex_root_issuers` automaticamente
   - Sincroniza `rix_trends` con los nuevos valores
   - Actualiza metadatos del Vector Store
   - Registra el cambio en `pipeline_health_checks` como alerta

### Programacion

CRON: Viernes a las 18:30 UTC (20:30 CET, tras cierre de la Bolsa de Madrid a 17:30 CET con margen de 1 hora para liquidacion)

### Flujo del Guardrail

```
EODHD Fundamentals API (IBEX.INDX)
        |
        v
  Obtener lista oficial de componentes
        |
        v
  Comparar con repindex_root_issuers
  (WHERE ibex_family_code = 'IBEX-35')
        |
    Discrepancias?
   /           \
  No            Si
  |              |
  Log OK     Actualizar:
             1. repindex_root_issuers
             2. rix_trends (historico)
             3. documents (vector store metadata)
             4. pipeline_health_checks (alerta)
```

### Edge Function: `verify-ibex-composition`

La funcion:
- Usa `EODHD_API_KEY` (ya configurada en secrets)
- Llama a `https://eodhd.com/api/fundamentals/IBEX.INDX?api_token=KEY&fmt=json`
- La respuesta contiene un objeto `Components` con los tickers del indice
- Mapea los tickers EODHD (formato `XXX`) al formato interno (`XXX.MC`)
- Compara con la tabla `repindex_root_issuers`
- Detecta:
  - **Entradas**: empresas en EODHD que no estan como IBEX-35 en la DB
  - **Salidas**: empresas como IBEX-35 en la DB que no aparecen en EODHD
- Para cada cambio detectado:
  - Actualiza `ibex_family_code` y `ibex_family_category` en `repindex_root_issuers`
  - Actualiza registros historicos en `rix_trends`
  - Actualiza metadatos en `documents` (Vector Store)
- Registra todo en `pipeline_health_checks` con `check_type: 'ibex_composition'`

### CRON Job

Se programara via SQL (no migracion) un pg_cron job:

```sql
SELECT cron.schedule(
  'verify-ibex-composition-weekly',
  '30 18 * * 5',  -- Viernes 18:30 UTC
  $$
  SELECT net.http_post(
    url:='https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/verify-ibex-composition',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  ) as request_id;
  $$
);
```

### Configuracion

Se anadira al `supabase/config.toml`:

```toml
[functions.verify-ibex-composition]
verify_jwt = false
```

---

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `supabase/functions/verify-ibex-composition/index.ts` | **Crear** - Nueva Edge Function |
| `supabase/config.toml` | **Modificar** - Anadir config de la nueva funcion |

Ademas, se ejecutaran:
- 1 migracion SQL para corregir metadatos del Vector Store (Parte 1)
- 1 sentencia SQL (no migracion) para crear el CRON job semanal

## Resultado Esperado

- Vector Store corregido con datos IBEX consistentes (~200 documentos actualizados)
- Guardrail automatico semanal que detecta cambios en la composicion del IBEX 35
- Alertas visibles en `pipeline_health_checks` cuando hay movimientos
- Cero intervencion manual para futuros cambios de indice
