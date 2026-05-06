# Forzar competidores verificados en Perfil (anti-fallback sectorial)

## Problema

En el ejemplo de MASORANGE, el bloque "Contexto Competitivo" del intent **perfil** muestra empresas como Proeduca, Izertis, Squirrel, Netex, Gigas — que **no son competidores reales** de una telco. Esto ocurre porque `buildCompetitiveContext` (en `chat-intelligence-v2/datapack/competitiveContext.ts`) consulta directamente:

```text
repindex_root_issuers WHERE sector_category = entity.sector_category LIMIT 60
```

es decir, **siempre** cae al sector entero, ignorando la columna `verified_competitors`. Esto viola dos reglas Core de memoria:
- *Competitors*: usar **solo** `verified_competitors`, nunca fallback sectorial.
- *competidores-verificados-estrictos-no-sector-fallback*.

## Objetivo

Para el intent `company_analysis` (Perfil), el peer set debe construirse **estrictamente** desde `verified_competitors` de la entidad analizada. Si la empresa no tiene competidores verificados (o son <2), la sección se omite con un mensaje explícito en lugar de inventar peers sectoriales.

## Cambios

### 1. `supabase/functions/chat-intelligence-v2/types.ts`
Añadir campo opcional a `ResolvedEntity`:
```ts
verified_competitors?: string[] | null;
```

### 2. Resolver de entidades
Localizar dónde se hidrata `ResolvedEntity` desde `repindex_root_issuers` (mismo sitio donde hoy se lee `sector_category`) y añadir `verified_competitors` al `select(...)`. Propagar al objeto resuelto, normalizando jsonb → `string[]`.

### 3. `supabase/functions/chat-intelligence-v2/datapack/competitiveContext.ts`
Reescribir el paso (1) "Tickers del mismo sector":

- **Nueva fuente única**: `entity.verified_competitors`. Filtrar nulos/vacíos y deduplicar; **incluir siempre** el propio `entity.ticker` para que aparezca en la tabla.
- **Sin fallback sectorial**. Eliminar la query a `repindex_root_issuers WHERE sector_category = ...`.
- Si `verified_competitors.length === 0` o tras filtrar `validPeers < 2`, devolver un `CompetitiveContext` con flag `reason: "no_verified_competitors"` y tabla vacía.
- Conservar intacto el resto: query a `rix_runs_v2 IN (tickers)`, agregación anti-mediana, ordenación por consenso.

### 4. `renderCompetitiveContextTable`
Cuando `ctx.table.length === 0` y `reason === "no_verified_competitors"`, devolver un bloque explícito:

```text
**Contexto competitivo sectorial — no disponible**

No constan competidores verificados para {company_name} en la base de datos
RepIndex. Conforme a la regla de competidores estrictos, no se realiza
comparación con peers sectoriales no verificados.
```

En cualquier otro caso (peers <2 por falta de scores), mantener el comportamiento actual de omitir silenciosamente.

### 5. `sectorRanking.ts` — sin cambios
El bloque `buildCompetitiveContextBlock` de `sectorRanking` ya opera sobre el ranking precomputado y no toca `verified_competitors`; queda fuera de alcance porque el problema es exclusivo del Perfil de una sola empresa.

### 6. Memoria
Actualizar `mem://features/chat/competidores-verificados-estrictos-no-sector-fallback` con una nota: "Aplicado también a `competitiveContext.ts` del intent company_analysis. Sin fallback sectorial; mensaje explícito si no hay verified_competitors."

## Validación

1. **MASORANGE** (sin verified_competitors poblados, según el síntoma): el bloque "Contexto Competitivo" aparece como "no disponible" en lugar de listar 25 empresas del subsector media.
2. **SAN** (con `verified_competitors = [BBVA, CABK, SAB, BKT, UNI]`): el bloque muestra Santander + esos 5 tickers exclusivamente, ordenados por consenso.
3. **Empresa con verified_competitors pero sin scores en el periodo**: sección omitida sin error.
4. Otros intents (sector_ranking, comparison, evolution) no se ven afectados.

## Detalles técnicos

- Tipo Postgres de `verified_competitors`: `jsonb` con array de strings (confirmado en `expand_entity_graph`).
- No requiere migración de BD.
- No requiere nuevos secretos.
- Deploy: solo `chat-intelligence-v2`.
