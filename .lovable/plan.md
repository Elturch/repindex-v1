

# Plan: Restaurar arquitectura SQL-to-Narrative en el Agente Rix

## El problema real (por que hemos fallado 4 veces)

Hemos estado parcheando el sintoma (paginacion, contexto, prompts) sin atacar la causa raiz: **la arquitectura actual es fundamentalmente incorrecta**.

### Arquitectura actual (rota)

```text
Pregunta del usuario
    |
    v
Cargar 1.074 filas de rix_runs_v2 en bruto
    |
    v
Inyectar TODO como texto Markdown en el contexto del LLM (~200K tokens)
    |
    v
Pedirle al LLM que busque, filtre, ordene y narre dentro de 1.074 filas
    |
    v
El LLM se confunde, omite empresas, inventa scores, mezcla tickers
```

### Arquitectura correcta (la que funcionaba)

```text
Pregunta del usuario
    |
    v
Paso 1: Un LLM traduce la pregunta a una consulta SQL precisa
    |
    v
Paso 2: Se ejecuta la SQL contra la base de datos (resultado exacto, 35 filas para IBEX-35)
    |
    v
Paso 3: Un modelo razonador recibe SOLO el resultado SQL (35 filas, no 1.074)
         y genera un informe ejecutivo narrativo
    |
    v
Respuesta precisa, sin omisiones, sin scores inventados
```

La diferencia es critica: en vez de pedirle al LLM que navegue 1.074 filas de datos tabulares (tarea en la que los LLMs fallan sistematicamente), le damos un resultado SQL limpio y preciso de 35 filas y le pedimos que lo convierta en prosa.

## Bug adicional descubierto: Datos duplicados

Acciona Energia tiene registros con DOS tickers diferentes en `rix_runs_v2` para la misma semana:

- `ANE` con ChatGPT = 69
- `ANE.MC` con ChatGPT = 46

Son 12 filas (6+6) para la misma empresa. El ticker canonico en `repindex_root_issuers` es `ANE.MC`. El ticker `ANE` es un residuo de evaluaciones antiguas que NO deberia existir en la semana actual. De aqui venia el "69" que no cuadraba con el 46 real.

## Solucion: Pipeline SQL-to-Narrative en 3 fases

### Fase 1 -- Generacion de SQL

Un primer LLM (rapido y barato, como gemini-2.5-flash) recibe:
- La pregunta del usuario
- El esquema de las tablas relevantes (`rix_runs_v2`, `repindex_root_issuers`)
- Instrucciones para generar SQL preciso

Ejemplo: "Dame el ranking IBEX-35 de ChatGPT esta semana" se traduce a:

```text
SELECT r."03_target_name", r."05_ticker", r."09_rix_score",
       r."23_nvm_score", r."26_drm_score", r."29_sim_score", r."32_rmm_score",
       r."35_cem_score", r."38_gam_score", r."41_dcm_score", r."44_cxm_score"
FROM rix_runs_v2 r
JOIN repindex_root_issuers i ON (i.ticker = r."05_ticker" OR i.ticker = r."05_ticker" || '.MC')
WHERE r."02_model_name" = 'ChatGPT'
  AND r."06_period_from" = '2026-02-01'
  AND i.ibex_family_code = 'IBEX-35'
  AND r."09_rix_score" IS NOT NULL
ORDER BY r."09_rix_score" DESC
```

Resultado: exactamente 35 filas con datos verificados.

### Fase 2 -- Ejecucion SQL segura

Se ejecuta la consulta generada contra Supabase usando `supabase.rpc()` o una funcion SQL dedicada con parametros validados. El resultado son datos exactos de la base de datos, sin truncamiento, sin paginacion, sin deduplicacion.

**Seguridad**: Solo se permiten consultas SELECT de solo lectura contra las tablas de datos RIX. Se valida la consulta antes de ejecutarla.

### Fase 3 -- Narrativa con modelo razonador

El modelo razonador (o3 o gemini-2.5-pro) recibe:
- La pregunta original del usuario
- El resultado SQL (35 filas, no 1.074)
- El system prompt de Agente Rix (tono, estructura, metricas)
- Contexto cualitativo del Vector Store (como ahora)

Con solo 35 filas en lugar de 1.074, el modelo no puede confundir Acciona con Acciona Energia, no puede omitir Banco Santander, y no puede inventar un score de 69 porque los unicos datos que tiene son los de la consulta SQL.

### Cambio adicional: Limpieza de datos duplicados ANE/ANE.MC

Se necesita actualizar los registros de `rix_runs_v2` donde `05_ticker = 'ANE'` para la semana actual, o bien alinearlos con el ticker canonico `ANE.MC`, o bien eliminar los duplicados. Esto se puede hacer con una consulta de actualizacion.

## Detalle tecnico de implementacion

### Archivo: `supabase/functions/chat-intelligence/index.ts`

**Cambios principales:**

1. **Nuevo bloque: Generacion SQL** (reemplaza el bloque de carga directa por periodo, lineas 3888-3970)
   - Crear un prompt de esquema con las columnas de `rix_runs_v2` y `repindex_root_issuers`
   - Llamar a gemini-2.5-flash para generar la consulta SQL
   - Validar que la SQL es SELECT-only y no contiene operaciones destructivas

2. **Nuevo bloque: Ejecucion SQL** (reemplaza la construccion de ranking en JS, lineas 4303-4510)
   - Ejecutar la SQL generada usando `supabase.rpc('execute_readonly_query', { query })` o similar
   - Formatear el resultado como tabla Markdown compacta

3. **Modificar contexto del LLM** (lineas 5000-5023)
   - En vez de inyectar 1.074 filas de ranking, inyectar solo el resultado SQL (35-179 filas segun la pregunta)
   - Mantener: Vector Store, grafo de conocimiento, memento corporativo, noticias
   - Eliminar: los rankings masivos de 179 empresas x 6 modelos

4. **Mantener las capacidades existentes** que no dependen de datos tabulares masivos:
   - Busqueda vectorial (Vector Store)
   - Grafo de conocimiento
   - Memento corporativo
   - Noticias corporativas
   - Regresion estadistica

### Funcion SQL segura necesaria

Se necesita crear una funcion PostgreSQL `execute_readonly_query` que:
- Solo acepte SELECT
- Tenga timeout de 5 segundos
- Opere con permisos de solo lectura
- Devuelva resultados en formato JSON

```text
CREATE OR REPLACE FUNCTION execute_readonly_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validar que es SELECT
  IF NOT (lower(trim(query)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries allowed';
  END IF;
  
  -- Ejecutar con timeout
  SET LOCAL statement_timeout = '5s';
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
```

### Seguridad de la funcion SQL

La funcion `execute_readonly_query` se invoca SOLO desde el edge function con service_role_key (no desde el cliente). Adicionalmente:
- Se valida que empiece por SELECT
- Se aplica un timeout de 5 segundos
- Se limita a las tablas de datos RIX (validacion adicional en el prompt de generacion SQL)

## Limpieza de datos: Ticker ANE duplicado

Se ejecutara una actualizacion para normalizar los tickers duplicados:

```text
-- Opcion: Eliminar los registros con ticker ANE (sin .MC) que son duplicados
-- La fuente canonica es ANE.MC segun repindex_root_issuers
DELETE FROM rix_runs_v2 
WHERE "05_ticker" = 'ANE' 
  AND "06_period_from" = '2026-02-01';
```

O alternativamente, si los datos de ANE son los correctos y ANE.MC los duplicados, se invierte la limpieza. Esto requiere verificar cual de los dos conjuntos de evaluaciones es el correcto consultando al equipo.

## Resultado esperado

| Metrica | Arquitectura actual (rota) | Nueva arquitectura SQL |
|---------|---------------------------|----------------------|
| Datos que recibe el LLM | 1.074 filas brutas | 35 filas exactas (para IBEX-35) |
| Acciona Energia score | "69" (ticker duplicado) | 46 (ticker canonico ANE.MC) |
| Banco Santander | Omitido / "No dispongo" | RIX 66 (ChatGPT) |
| Endesa | Omitido / "No dispongo" | RIX 67 (ChatGPT) |
| Precision de scores | ~70% (LLM confunde filas) | 100% (datos de la DB directos) |
| Tokens de contexto | ~150K (tablas masivas) | ~20K (resultado SQL + Vector Store) |
| Coste por consulta | Alto (contexto enorme) | Menor (contexto reducido) |

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Reemplazar carga masiva por pipeline SQL-to-Narrative en 3 fases |
| Nueva migracion SQL | Crear funcion `execute_readonly_query` |
| Script de limpieza | Eliminar duplicados ANE/ANE.MC en rix_runs_v2 |

## Riesgos y mitigacion

- **Riesgo**: El LLM genera SQL incorrecta. **Mitigacion**: El prompt de esquema incluye ejemplos de consultas correctas para los tipos de pregunta mas comunes (ranking por indice, comparativa, tendencia). Si la SQL falla, se usa un fallback con consultas predefinidas.
- **Riesgo**: Preguntas abiertas que no se mapean bien a SQL (ej: "que opina ChatGPT de Telefonica"). **Mitigacion**: Para estas preguntas, se mantiene la busqueda vectorial como fuente principal, sin necesidad de SQL.
- **Riesgo**: `execute_readonly_query` podria ser un vector de inyeccion SQL. **Mitigacion**: Solo se invoca desde el edge function con service_role, nunca desde el cliente. El prompt de generacion SQL restringe las tablas y el tipo de consulta.

