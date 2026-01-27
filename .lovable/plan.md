
# Plan: Guardrails de Competencia Inteligente para Boletines

## Diagnóstico del Error

### ¿Qué pasó exactamente?

El boletín de Telefónica incluyó competidores irrelevantes (probablemente bancos, energéticas o empresas de sectores sin relación) debido a una **lógica de selección de competidores defectuosa** en `handleBulletinRequest`:

```typescript
// LÍNEAS 1828-1833 - LA LÓGICA ROTA
const competitors = companiesCache?.filter(c => 
  c.ticker !== matchedCompany.ticker && (
    (matchedCompany.sector_category && c.sector_category === matchedCompany.sector_category) ||
    (matchedCompany.ibex_family_code && c.ibex_family_code === matchedCompany.ibex_family_code)
  )
).slice(0, competitorLimit) || [];
```

### Los 3 problemas críticos:

1. **Uso de OR en lugar de priorización**: Para Telefónica (IBEX-35 + Telecom), el filtro devuelve TODAS las empresas que coincidan en sector O en ibex_family_code, mezclando 35+ empresas de sectores completamente diferentes.

2. **Sector demasiado amplio sin sub-categorización**: "Telecomunicaciones y Tecnología" agrupa 23 empresas muy dispares:
   - Telefónica (operadora telecom)
   - Amadeus (tecnología de viajes)
   - LLYC (comunicación/PR)
   - Google, Amazon, Meta (big tech internacional)
   - Indra (defensa/consultoría IT)

3. **Sin validación de relevancia competitiva real**: No existe ningún guardrail que valide si las empresas seleccionadas son competidores directos.

---

## Arquitectura de la Solución

### 1. Nueva Tabla de Competidores Verificados

Crear una tabla `competitor_relationships` con competidores VALIDADOS manualmente para empresas clave:

```sql
CREATE TABLE competitor_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ticker TEXT NOT NULL,         -- Empresa principal
  competitor_ticker TEXT NOT NULL,      -- Competidor directo
  relationship_type TEXT DEFAULT 'direct', -- 'direct', 'indirect', 'aspiring'
  confidence_score DECIMAL DEFAULT 1.0, -- 0.0-1.0
  validated_by TEXT,                    -- 'manual', 'ai_suggested'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_ticker, competitor_ticker)
);

-- Competidores validados para Telefónica
INSERT INTO competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by) VALUES
('TEF', 'VOD', 'direct', 1.0, 'manual'),   -- Vodafone
('TEF', 'ORA', 'direct', 1.0, 'manual'),   -- Orange
('TEF', 'CLNX', 'indirect', 0.8, 'manual'), -- Cellnex (infraestructura)
```

### 2. Sistema de Priorización Inteligente de Competidores

Nueva función `getRelevantCompetitors()` con lógica de 4 niveles:

```typescript
async function getRelevantCompetitors(
  company: Company,
  allCompanies: Company[],
  supabaseClient: any,
  limit: number = 5
): Promise<Company[]> {
  
  // NIVEL 1: Competidores VERIFICADOS (tabla competitor_relationships)
  const { data: verifiedCompetitors } = await supabaseClient
    .from('competitor_relationships')
    .select('competitor_ticker, confidence_score')
    .eq('source_ticker', company.ticker)
    .order('confidence_score', { ascending: false });
  
  if (verifiedCompetitors?.length >= limit) {
    return matchByTickers(verifiedCompetitors, allCompanies);
  }
  
  // NIVEL 2: Mismo sector + misma familia IBEX (AND, no OR)
  const sameSectorAndFamily = allCompanies.filter(c => 
    c.ticker !== company.ticker &&
    c.sector_category === company.sector_category &&
    c.ibex_family_code === company.ibex_family_code
  );
  
  // NIVEL 3: Mismo sector (cualquier familia IBEX)
  const sameSectorOnly = allCompanies.filter(c => 
    c.ticker !== company.ticker &&
    c.sector_category === company.sector_category &&
    !sameSectorAndFamily.includes(c)
  );
  
  // NIVEL 4: Misma familia IBEX + sector relacionado
  // (usar solo si faltan competidores)
  
  // Combinar y priorizar
  return [
    ...verifiedCompetitors || [],
    ...sameSectorAndFamily,
    ...sameSectorOnly
  ].slice(0, limit);
}
```

### 3. Validación con IA como Guardrail Final

Antes de generar el boletín, validar con GPT-4o-mini que los competidores son relevantes:

```typescript
async function validateCompetitorRelevance(
  mainCompany: string,
  sector: string,
  candidates: string[]
): Promise<{ valid: string[]; rejected: string[]; reason: string }> {
  
  const prompt = `Eres un experto en análisis competitivo.
  
Empresa principal: ${mainCompany}
Sector declarado: ${sector}
Candidatos a competidores: ${candidates.join(', ')}

Para cada candidato, responde si es un competidor DIRECTO o RELEVANTE para ${mainCompany}.
Un competidor relevante compite por los MISMOS clientes, en el MISMO mercado.

Responde en JSON:
{
  "valid": ["empresa1", "empresa2"],
  "rejected": ["empresa3"],
  "reason": "empresa3 opera en un sector diferente (viajes vs telecomunicaciones)"
}`;

  // Llamar a GPT-4o-mini y parsear respuesta
}
```

### 4. Clasificación Semántica de Subsectores

Añadir campo `subsector` a la tabla `repindex_root_issuers` para granularidad:

| issuer_name | sector_category | subsector |
|-------------|-----------------|-----------|
| Telefónica | Telecomunicaciones y Tecnología | Operadores Telecom |
| Cellnex | Telecomunicaciones y Tecnología | Infraestructura Telecom |
| Amadeus | Telecomunicaciones y Tecnología | Tech Viajes |
| Indra | Telecomunicaciones y Tecnología | Consultoría IT/Defensa |
| Google | Telecomunicaciones y Tecnología | Big Tech |

---

## Flujo de Datos Actualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SOLICITUD DE BOLETÍN                        │
│                    "Genera boletín de Telefónica"              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. IDENTIFICAR EMPRESA PRINCIPAL                              │
│     Telefónica (TEF) → Sector: Telecom, IBEX: IBEX-35          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. OBTENER COMPETIDORES (PRIORIZADO)                          │
│                                                                 │
│     NIVEL 1: ¿Hay competidores VERIFICADOS en BD?              │
│              → Vodafone, Orange ✓                               │
│                                                                 │
│     NIVEL 2: Mismo sector + Misma familia IBEX                 │
│              → Cellnex (Telecom + IBEX-35) ✓                   │
│                                                                 │
│     NIVEL 3: Mismo sector (otra familia)                       │
│              → Parlem (Telecom + BME-Growth) ✓                 │
│                                                                 │
│     NIVEL 4: IA valida que NO entren:                          │
│              ❌ Amadeus (viajes)                                │
│              ❌ LLYC (comunicación)                             │
│              ❌ Indra (defensa/IT)                              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. VALIDACIÓN FINAL CON IA                                    │
│     "¿Son Cellnex, Vodafone, Orange competidores de TEF?"      │
│     → Respuesta: SÍ, todos operan en telecomunicaciones        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERAR BOLETÍN CON COMPETIDORES VALIDADOS                 │
│     → Solo empresas de telecom en sección competencia          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/chat-intelligence/index.ts` | Reemplazar lógica de competidores (líneas 1828-1833) con `getRelevantCompetitors()` + validación IA |
| Nueva migración SQL | Crear tabla `competitor_relationships` + añadir campo `subsector` |
| `repindex_root_issuers` | Poblar subsectores para las 174 empresas (puede hacerse gradualmente) |

---

## Implementación Inmediata (Sin Nueva Tabla)

Mientras se crea la tabla de competidores verificados, aplicar estos fixes urgentes:

**Fix 1: Cambiar OR por AND + Priorización**

```typescript
// ANTES (ROTO)
const competitors = companiesCache?.filter(c => 
  c.ticker !== matchedCompany.ticker && (
    c.sector_category === matchedCompany.sector_category ||
    c.ibex_family_code === matchedCompany.ibex_family_code
  )
).slice(0, competitorLimit);

// DESPUÉS (PRIORIZADO)
const sameSectorAndFamily = companiesCache?.filter(c => 
  c.ticker !== matchedCompany.ticker &&
  c.sector_category === matchedCompany.sector_category &&
  c.ibex_family_code === matchedCompany.ibex_family_code
);

const sameSectorOnly = companiesCache?.filter(c => 
  c.ticker !== matchedCompany.ticker &&
  c.sector_category === matchedCompany.sector_category &&
  !sameSectorAndFamily.includes(c)
);

const competitors = [
  ...sameSectorAndFamily,
  ...sameSectorOnly
].slice(0, competitorLimit);
```

**Fix 2: Lista Negra de Falsos Positivos**

```typescript
const KNOWN_NON_COMPETITORS: Record<string, string[]> = {
  'TEF': ['AMS', 'IDR', 'GOOGLE-PRIV', 'AMAZON-PRIV', 'META-PRIV', 'LLYC'],
  // Telefónica NO compite con Amadeus, Indra, Google, Amazon, Meta, LLYC
};

if (KNOWN_NON_COMPETITORS[matchedCompany.ticker]) {
  competitors = competitors.filter(c => 
    !KNOWN_NON_COMPETITORS[matchedCompany.ticker].includes(c.ticker)
  );
}
```

**Fix 3: Validación Quick con IA (Guardrail Final)**

Antes de usar los competidores, hacer una validación rápida:

```typescript
// Solo si hay más de 3 competidores, validar con IA
if (competitors.length > 3) {
  const validated = await validateCompetitorRelevance(
    matchedCompany.issuer_name,
    matchedCompany.sector_category,
    competitors.map(c => c.issuer_name)
  );
  competitors = competitors.filter(c => validated.valid.includes(c.issuer_name));
}
```

---

## Resultado Esperado

| Antes (Error) | Después (Correcto) |
|---------------|-------------------|
| Competidores de Telefónica: Amadeus, BBVA, Iberdrola | Competidores de Telefónica: Cellnex, Vodafone*, Orange* |
| Mezcla de sectores sin sentido | Solo empresas de telecomunicaciones |
| Cliente ve error garrafal y pierde confianza | Cliente ve análisis coherente y profesional |
| Sin validación de relevancia | Triple validación: BD + Lógica + IA |

*Nota: Vodafone y Orange requerirían estar en la base de datos o en la tabla de competidores verificados

---

## Plan de Rollout

### Fase 1 (Inmediata - Este Sprint)
- Fix del OR → AND + Priorización
- Lista negra de falsos positivos conocidos
- Log de competidores seleccionados para debugging

### Fase 2 (Siguiente Sprint)
- Crear tabla `competitor_relationships`
- Poblar competidores verificados para IBEX-35 (35 empresas)
- Validación con IA como guardrail

### Fase 3 (Futuro)
- Añadir campo `subsector` a 174 empresas
- UI de admin para gestionar competidores
- Auto-sugerencia de competidores con validación humana
