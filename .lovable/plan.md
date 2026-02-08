

# Plan: Migración de Identidad Corporativa CEPSA → MOEVE

## Resumen del Cambio

CEPSA ha completado su transformación de marca a **MOEVE**, reflejando su evolución hacia energía sostenible y movilidad. Este cambio requiere actualizar múltiples sistemas para que la plataforma RepIndex refleje correctamente la nueva identidad.

## Estado Actual Detectado

| Aspecto | Estado Actual | Observación |
|---------|--------------|-------------|
| `repindex_root_issuers` | issuer_name: "Cepsa", include_terms: ["Cepsa"] | ❌ Nombre antiguo |
| `issuer_id` | CEPSA-PRIV | ⚠️ Mantener para compatibilidad histórica |
| `ticker` | CEP.MC (cotiza desde 2025) | ✅ Cambiar a MOE.MC |
| `website` | https://www.moeveglobal.com/es/ | ✅ Ya actualizado |
| `rix_runs` | 64 registros con target_name "Cepsa" | ⚠️ Datos históricos |
| `rix_runs_v2` | 36 registros con target_name "Cepsa" | ⚠️ Datos históricos |
| `corporate_snapshots` | Ya refleja "Moeve" en contenido | ✅ OK |
| `verified_competitors` | CEPSA-PRIV en Repsol, Repsol en CEPSA-PRIV | ✅ Mantener |
| `news_articles` | 3 artículos mencionan "Cepsa" | ⚠️ Contenido editorial histórico |
| `documents` (vector store) | ~260 documentos con "Cepsa" | ⚠️ Datos históricos |

---

## Estrategia de Migración

### Decisiones Clave

1. **Mantener `issuer_id` original** (`CEPSA-PRIV` → cambiar a `moeve`): El issuer_id es la clave primaria semántica. Cambiarla afectaría joins históricos. **DECISIÓN: Cambiar a `moeve` ya que el sistema debe reflejar la identidad actual.**

2. **Actualizar ticker**: De `CEP.MC` a `MOE.MC` (o el ticker real de Moeve en bolsa).

3. **Histórico de datos**: Los registros en `rix_runs` y `rix_runs_v2` mantendrán `target_name: "Cepsa"` para la era pre-rebrand, pero los nuevos análisis usarán "Moeve".

4. **Vector store**: Los documentos históricos se mantienen (son contexto válido sobre la transición), pero se regenerarán con el próximo ciclo.

---

## Cambios Requeridos

### 1. Actualizar `repindex_root_issuers` (Migración SQL)

```sql
UPDATE repindex_root_issuers
SET 
  issuer_id = 'moeve',
  issuer_name = 'Moeve',
  ticker = 'MOE.MC',
  include_terms = '["Moeve", "Moeve Global", "ex-Cepsa"]'::jsonb,
  exclude_terms = '[]'::jsonb,
  sample_query = 'Moeve energía movilidad sostenible transición',
  notes = COALESCE(notes, '') || E'\n[2026-02-08] Rebrand: Cepsa → Moeve. Nueva identidad reflejando transición energética.',
  website = 'https://www.moeveglobal.com/es/'
WHERE issuer_id = 'CEPSA-PRIV';
```

### 2. Actualizar `rix_runs` y `rix_runs_v2` (Datos Futuros)

Los nuevos análisis ya captarán "Moeve" porque:
- Los include_terms se actualizan a ["Moeve"]
- El sample_query guiará a las IAs a buscar "Moeve"

**Para datos históricos**: Opcionalmente crear un mapeo de alias para el dashboard:

```sql
-- Opcional: Actualizar target_name histórico para consistencia en dashboard
-- UPDATE rix_runs SET "03_target_name" = 'Moeve' WHERE "05_ticker" = 'MOE.MC';
-- UPDATE rix_runs_v2 SET "03_target_name" = 'Moeve' WHERE "05_ticker" = 'MOE.MC';
```

### 3. Actualizar `verified_competitors` (Scripts)

**Archivo: `supabase/functions/import-verified-competitors/index.ts`**

```typescript
// Línea 37: Cambiar clave de CEPSA-PRIV a moeve
'moeve': ['REP'],  // Antes: 'CEPSA-PRIV': ['REP']

// Línea 107: Actualizar referencia en Repsol
'REP': ['moeve', 'NTGY'],  // Antes: ['CEPSA-PRIV', 'NTGY']
```

**Archivo: `scripts/import-verified-competitors.sql`**

```sql
-- Línea 93-94: Actualizar comentario y ticker
-- moeve (antes Cepsa)
UPDATE repindex_root_issuers SET verified_competitors = '["REP"]' WHERE ticker = 'MOE.MC';

-- Línea 303-304: Actualizar Repsol
UPDATE repindex_root_issuers SET verified_competitors = '["moeve", "NTGY"]' WHERE ticker = 'REP';
```

### 4. Actualizar `corporate_scrape_progress`

```sql
UPDATE corporate_scrape_progress
SET ticker = 'MOE.MC'
WHERE ticker = 'CEPSA-PRIV';
```

### 5. Actualizar `corporate_snapshots`

```sql
UPDATE corporate_snapshots
SET ticker = 'MOE.MC'
WHERE ticker = 'CEPSA-PRIV';
```

### 6. Actualizar Referencias en Código (Edge Functions)

**Archivo: `supabase/functions/chat-intelligence/index.ts`** (línea ~1555)

El ejemplo en el prompt usa "Cepsa" ilustrativamente. Actualizar a:
```typescript
// Antes:
"Repsol cae 8 puntos en RIX mientras Cepsa escala posiciones"

// Después:
"Repsol cae 8 puntos en RIX mientras Moeve escala posiciones"
```

### 7. Actualizar `verified_competitors` en la tabla

```sql
-- Actualizar competidores de Repsol para referenciar nuevo ticker
UPDATE repindex_root_issuers
SET verified_competitors = jsonb_set(
  verified_competitors, 
  '{0}', 
  '"MOE.MC"'
)
WHERE ticker = 'REP' AND verified_competitors ? 'CEPSA-PRIV';
```

---

## Flujo Visual del Cambio

```text
ANTES (legacy):                          DESPUÉS (actualizado):
─────────────────────────────────────────────────────────────────
repindex_root_issuers:                   repindex_root_issuers:
├── issuer_id: CEPSA-PRIV         →      ├── issuer_id: moeve
├── issuer_name: Cepsa            →      ├── issuer_name: Moeve
├── ticker: CEP.MC                →      ├── ticker: MOE.MC
├── include_terms: ["Cepsa"]      →      ├── include_terms: ["Moeve", "Moeve Global"]
└── website: moeveglobal.com      →      └── website: moeveglobal.com ✓

verified_competitors:                    verified_competitors:
├── CEPSA-PRIV → [REP]            →      ├── moeve → [REP]
└── REP → [CEPSA-PRIV, NTGY]      →      └── REP → [moeve, NTGY]

rix_runs (histórico):                    rix_runs (futuro):
├── target_name: Cepsa                   ├── target_name: Moeve
└── ticker: CEPSA-PRIV                   └── ticker: MOE.MC
```

---

## Archivos a Modificar

| Archivo | Tipo | Cambio |
|---------|------|--------|
| **Migración SQL** | Crear | Actualizar `repindex_root_issuers` |
| **Migración SQL** | Crear | Actualizar `corporate_scrape_progress` |
| **Migración SQL** | Crear | Actualizar `corporate_snapshots` |
| **Migración SQL** | Crear | Actualizar referencias en `verified_competitors` de Repsol |
| `supabase/functions/import-verified-competitors/index.ts` | Modificar | Cambiar claves CEPSA-PRIV → moeve |
| `scripts/import-verified-competitors.sql` | Modificar | Cambiar ticker CEPSA-PRIV → MOE.MC |
| `supabase/functions/chat-intelligence/index.ts` | Modificar | Actualizar ejemplo en prompt |

---

## Consideraciones

1. **Ticker Real**: He asumido `MOE.MC` como nuevo ticker. Si el ticker oficial de Moeve en bolsa es diferente, ajustar antes de implementar.

2. **Datos Históricos**: Los registros de `rix_runs` con `target_name: "Cepsa"` son históricos válidos (era la identidad en ese momento). El dashboard debería mostrarlos correctamente porque el filtro es por ticker, no por nombre.

3. **Vector Store**: Los documentos existentes en `documents` que mencionan "Cepsa" son contexto válido para la IA (explican la transición). Se regenerarán naturalmente en el próximo ciclo de `populate-vector-store`.

4. **Artículos de Noticias**: Los 3 artículos que mencionan "Cepsa" son contenido editorial histórico y no deben modificarse (reflejan el momento en que fueron escritos).

---

## Resultado Esperado

Tras la implementación:

1. ✅ Dashboard mostrará "Moeve" como nombre de empresa
2. ✅ Nuevos análisis RIX usarán "Moeve" en los prompts
3. ✅ Scraping corporativo seguirá funcionando (website ya actualizado)
4. ✅ Competidores verificados referenciaran correctamente a Moeve
5. ✅ Histórico de datos mantiene consistencia (ticker como enlace)

