
# Plan: Sistema de Competidores Verificados Guardados en Base de Datos

## Resumen Ejecutivo

Implementar una nueva columna `verified_competitors` en `repindex_root_issuers` que almacene los competidores directos de cada empresa. Cuando esta columna tenga datos, el sistema de guardrails usará EXCLUSIVAMENTE estos competidores. Cuando esté vacía, aplicará la lógica de fallback por categoría/subcategoría, pero declarando explícitamente que son "competidores por categoría, no verificados".

---

## Diagnóstico Actual

### Datos del Excel Subido
- **174 empresas** con columna "Competidores directos"
- Muchas tienen competidores definidos (ej: BBVA → "Banco Santander, CaixaBank, Banco Sabadell, Bankinter, Unicaja Banco")
- Algunas tienen casilla vacía (ej: AENA, AGIL, AIRBUS)

### Tabla `competitor_relationships` Existente
- Solo **32 relaciones** para **16 empresas** (cobertura < 10%)
- No está sincronizada con el listado del Excel

### Sistema de Guardrails Actual
- **TIER 0**: Relaciones bidireccionales en `competitor_relationships`
- **TIER 1**: Relaciones directas en `competitor_relationships`
- **TIER 2-6**: Fallbacks por subsector/sector/IBEX

---

## Cambios Propuestos

### 1. Migración de Base de Datos

Añadir columna `verified_competitors` a `repindex_root_issuers`:

```sql
ALTER TABLE repindex_root_issuers 
ADD COLUMN verified_competitors jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN repindex_root_issuers.verified_competitors IS 
'Lista de tickers de competidores directos verificados manualmente. Formato: ["BBVA", "CABK", "SAB"]. Si está vacío, se usan competidores por categoría.';
```

Esta columna almacenará un array JSON de tickers, por ejemplo:
```json
["BBVA", "CABK", "SAB", "BKT", "UNI"]
```

### 2. Poblar la Columna con Datos del Excel

Crear script/endpoint para procesar el Excel y convertir nombres a tickers:

| Empresa | Excel (nombres) | DB (tickers) |
|---------|-----------------|--------------|
| BBVA | "Banco Santander, CaixaBank, Banco Sabadell, Bankinter, Unicaja Banco" | `["SAN", "CABK", "SAB", "BKT", "UNI"]` |
| ACS | "Ferrovial, Acciona, Sacyr, FCC, OHLA" | `["FER", "ANA", "SCYR", "FCC-PRIV", "OHL"]` |
| AENA | (vacío) | `[]` |

El proceso:
1. Para cada nombre de competidor, buscar el ticker correspondiente en `repindex_root_issuers.issuer_name`
2. Si no se encuentra match exacto, buscar por similitud (Iberdrola, Naturgy Energy Group, etc.)
3. Guardar array de tickers en `verified_competitors`

### 3. Modificar Sistema de Guardrails (`chat-intelligence/index.ts`)

Cambiar la función `getRelevantCompetitors`:

```text
ANTES:
- TIER 0: competitor_relationships bidireccional
- TIER 1: competitor_relationships directo
- TIER 2-6: Fallbacks por categoría

DESPUÉS:
- TIER 0: verified_competitors (si existe y no está vacío) → EXCLUSIVO, no continúa
- TIER 1-fallback: Solo si verified_competitors está vacío
  → Usa lógica de categoría/subcategoría
  → Declara: "competidores añadidos por pertenecer a la misma categoría"
```

### 4. Actualizar Justificación de Metodología

Cuando se usen competidores verificados:
> "Competidores seleccionados mediante: relaciones directas verificadas manualmente."

Cuando se usen fallbacks por categoría:
> "⚠️ NOTA: Esta empresa no tiene competidores verificados definidos. Los competidores mostrados pertenecen a la misma categoría ([sector_category]) y se incluyen con fines de contexto sectorial, no como competencia directa confirmada."

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| Nueva migración SQL | Añadir columna `verified_competitors` |
| `supabase/functions/chat-intelligence/index.ts` | Modificar `getRelevantCompetitors` para priorizar `verified_competitors` |
| `supabase/functions/ingest-new-issuer/index.ts` | Añadir campo `verified_competitors` al insertar nuevos issuers |
| `src/components/admin/IssuerIngestPanel.tsx` | Mostrar campo para editar competidores en la UI de ingesta |

---

## Script de Importación del Excel

Se creará un script para procesar el Excel y poblar la base de datos:

```text
1. Leer columna "Competidores directos" de cada fila
2. Si está vacía → verified_competitors = []
3. Si tiene datos:
   a. Split por comas
   b. Para cada nombre, buscar ticker en repindex_root_issuers
   c. Si match → añadir ticker al array
   d. Si no match → log warning, saltar
4. UPDATE repindex_root_issuers SET verified_competitors = [array] WHERE ticker = [ticker]
```

---

## Lógica de Fallback Detallada

```text
function getRelevantCompetitors(company, allCompanies):
  
  // TIER 0 (NUEVO): Competidores verificados - SI EXISTEN, SON EXCLUSIVOS
  IF company.verified_competitors && company.verified_competitors.length > 0:
    competitors = buscar empresas por tickers en verified_competitors
    justification = "Competidores directos verificados manualmente"
    RETURN (competitors, justification, "TIER0-VERIFIED")
  
  // FALLBACK: Si verified_competitors está vacío
  // La lógica actual de TIER 1-6 se mantiene, pero con justificación diferente
  
  [... lógica existente de subsector/sector ...]
  
  // IMPORTANTE: Modificar justificación para declarar que son "por categoría"
  IF tierUsed in [TIER2, TIER3, TIER4, TIER5]:
    justification += "⚠️ Competidores incluidos por pertenecer a la misma categoría/subsector, no verificados como competencia directa."
```

---

## Impacto en Boletines y Agente Rix

### Boletines Ejecutivos
- Si hay `verified_competitors` → Usa solo esos, comparativas directas
- Si está vacío → Usa categoría, pero el boletín incluirá nota de transparencia

### Agente Rix (Chat)
- Misma lógica: prioriza verificados, fallback a categoría con disclosure
- Las respuestas incluirán la justificación de metodología

---

## Beneficios

1. **Control total**: Cada empresa tiene sus competidores exactos definidos manualmente
2. **Transparencia**: Cuando no hay verificados, se declara explícitamente
3. **Escalabilidad**: Nuevas empresas pueden añadirse con o sin competidores
4. **Retrocompatibilidad**: La lógica actual de categoría sigue funcionando como fallback

---

## Mapeo de Competidores del Excel

Empresas con competidores definidos (muestra):

| Ticker | Competidores (Nombres) | Competidores (Tickers) |
|--------|------------------------|------------------------|
| BBVA | Banco Santander, CaixaBank, Banco Sabadell, Bankinter, Unicaja Banco | SAN, CABK, SAB, BKT, UNI |
| TEF | Grupo MASORANGE | MASOR-PRIV |
| IBE | Endesa, Naturgy Energy Group, Repsol | ELE, NTGY, REP |
| ITX | Adolfo Domínguez, Puig Brands | ADZ, PUIG |
| GRF | PharmaMar, Laboratorios Farmacéuticos Rovi, Faes Farma, Almirall | PHM, ROVI, FAE, ALM |

Empresas sin competidores (usarán fallback por categoría):
- AENA, AGIL, AIRBUS, AMS, APPS, ART, ART2, AZK, BKY, CCEP, etc.

---

## Flujo de Actualización Futura

Para añadir/modificar competidores de una empresa:
1. Ir al panel de Admin → Issuers
2. Editar campo `verified_competitors` (array de tickers)
3. Guardar → El sistema usará inmediatamente los nuevos competidores

---

## Resultado Esperado

Después de la implementación:
- Las 174 empresas tendrán `verified_competitors` poblado según el Excel
- Los boletines y el Agente Rix usarán SOLO estos competidores cuando existan
- Cuando no existan, se declara transparentemente que son "por categoría"
- No hay riesgo de mezclar empresas de sectores incompatibles
