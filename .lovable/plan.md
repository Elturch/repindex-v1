

## Plan: Vector Store en Boletines + Competidores Verificados Robustos

### Contexto del Problema

Actualmente existen DOS brechas críticas que causan inconsistencias en los informes ejecutivos:

1. **El Vector Store está subutilizado**: 11,862 documentos indexados con explicaciones cualitativas de las IAs, PERO los boletines ejecutivos NO los consultan - solo usan datos estructurados de `rix_runs`/`rix_runs_v2`

2. **Sistema de competidores incompleto**:
   - Solo 22 de 174 empresas (12.6%) tienen competidores verificados en la base de datos
   - Solo 24 de 174 empresas tienen `subsector` definido
   - 150 empresas caen a fallbacks genéricos por sector, causando comparaciones irrelevantes

**Datos actuales:**
| Sector | Total | Con Subsector | Sin Subsector |
|--------|-------|---------------|---------------|
| Otros Sectores | 40 | 0 | 40 |
| Construcción e Infraestructuras | 25 | 3 | 22 |
| Telecomunicaciones y Tecnología | 23 | 8 | 15 |
| Salud y Farmacéutico | 16 | 0 | 16 |
| Energía y Gas | 15 | 5 | 10 |
| Banca y Servicios Financieros | 11 | 7 | 4 |

---

### Solución Propuesta: 2 Fases

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA MEJORADA                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   BOLETÍN EJECUTIVO                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│   │ Datos RIX    │ +  │ Vector Store │ +  │ Competidores │             │
│   │ Estructurado │    │ Cualitativo  │    │ Verificados  │             │
│   └──────────────┘    └──────────────┘    └──────────────┘             │
│          │                    │                    │                    │
│          v                    v                    v                    │
│   ┌──────────────────────────────────────────────────────────┐         │
│   │           CONTEXTO ENRIQUECIDO PARA LLM                  │         │
│   │  - Scores + Métricas (estructurado)                      │         │
│   │  - Explicaciones narrativas de IAs (vector)              │         │
│   │  - Comparativas justificadas (competidores verificados)  │         │
│   └──────────────────────────────────────────────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 1: Integrar Vector Store en Boletines

**Objetivo**: Enriquecer los boletines ejecutivos con contenido cualitativo del Vector Store

**Cambios en `supabase/functions/chat-intelligence/index.ts`:**

1. **Agregar búsqueda vectorial en `handleBulletinRequest`** (después de obtener datos de rix_runs):

```typescript
// Generar embedding del nombre de empresa para búsqueda vectorial
const bulletinEmbedding = await generateEmbedding(matchedCompany.issuer_name);

// Buscar documentos relevantes en Vector Store
const { data: vectorDocs } = await supabaseClient.rpc('match_documents', {
  query_embedding: bulletinEmbedding,
  match_count: 30, // Top 30 documentos más relevantes
  filter: { ticker: matchedCompany.ticker } // Filtrar por ticker si está en metadata
});

// Agregar contexto cualitativo al bulletinContext
if (vectorDocs?.length > 0) {
  bulletinContext += `\n📚 ANÁLISIS CUALITATIVOS DE IAs (Vector Store):\n`;
  vectorDocs.slice(0, 15).forEach((doc, i) => {
    bulletinContext += `\n[Fuente ${i + 1}]: ${doc.content?.substring(0, 800)}\n`;
  });
}
```

2. **Incluir noticias corporativas si están disponibles**:

```typescript
// Buscar noticias corporativas recientes
const { data: corporateNews } = await supabaseClient
  .from('corporate_news')
  .select('headline, lead_paragraph, published_date')
  .eq('ticker', matchedCompany.ticker)
  .order('published_date', { ascending: false })
  .limit(5);

if (corporateNews?.length > 0) {
  bulletinContext += `\n📰 NOTICIAS CORPORATIVAS RECIENTES:\n`;
  corporateNews.forEach((news, i) => {
    bulletinContext += `${i + 1}. [${news.published_date}] ${news.headline}\n   ${news.lead_paragraph}\n`;
  });
}
```

---

### FASE 2: Robustez del Sistema de Competidores

**Objetivo**: Garantizar que cada empresa tenga competidores justificados, explicitando la metodología usada

**Cambios en `getRelevantCompetitors()` de `chat-intelligence/index.ts`:**

1. **Agregar log de justificación para el LLM**:

```typescript
interface CompetitorResult {
  competitors: CompanyData[];
  justification: string; // Nueva: explicación para el informe
}

// Modificar retorno para incluir justificación:
return {
  competitors: collected,
  justification: `Competidores seleccionados mediante: ${tierUsed}. ` +
    `${verifiedCount > 0 ? `${verifiedCount} verificados en base de datos.` : ''} ` +
    `${subsectorCount > 0 ? `${subsectorCount} del mismo subsector (${company.subsector}).` : ''}`
};
```

2. **Incluir la justificación en el bulletinContext**:

```typescript
bulletinContext += `\n🏢 COMPETIDORES (${competitors.length}) - METODOLOGÍA:\n`;
bulletinContext += `${competitorResult.justification}\n\n`;
competitors.forEach((c, idx) => {
  bulletinContext += `${idx + 1}. ${c.issuer_name} (${c.ticker})\n`;
  bulletinContext += `   Sector: ${c.sector_category} | Subsector: ${c.subsector || 'N/D'}\n`;
});
```

3. **Agregar TIER 0: Competidores bidireccionales verificados**:

```typescript
// TIER 0: También verificar relaciones inversas
const { data: reverseRelationships } = await supabaseClient
  .from('competitor_relationships')
  .select('source_ticker, relationship_type, confidence_score')
  .eq('competitor_ticker', company.ticker)
  .order('confidence_score', { ascending: false });
```

4. **Fallback explícito para empresas sin competidores**:

```typescript
if (collected.length === 0) {
  console.warn(`${logPrefix} NO COMPETITORS FOUND for ${company.ticker} - using top 3 from IBEX35`);
  
  const ibex35Fallback = allCompanies
    .filter(c => c.ibex_family_code === 'IBEX35' && c.ticker !== company.ticker)
    .slice(0, 3);
  
  collected.push(...ibex35Fallback);
  tierUsed = 'FALLBACK-IBEX35';
}
```

---

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Integrar Vector Store en `handleBulletinRequest`, mejorar `getRelevantCompetitors` con justificaciones |

---

### Beneficios Esperados

1. **Boletines más ricos**: Acceso a explicaciones narrativas de las IAs, no solo scores numéricos
2. **Comparativas justificadas**: Cada boletín explica POR QUÉ se eligieron esos competidores
3. **Transparencia metodológica**: El usuario entiende si los competidores son verificados, por subsector, o fallback
4. **Consistencia**: Eliminación de comparaciones irrelevantes gracias a justificación explícita

---

### Consideraciones Técnicas

1. **Performance**: La búsqueda vectorial añade ~500ms al proceso, pero es aceptable para boletines
2. **Tokens**: El contexto adicional del Vector Store podría añadir 2,000-5,000 tokens, ajustar `match_count` según `depthLevel`
3. **Calidad**: Filtrar documentos del Vector Store por similitud mínima (threshold 0.7) para evitar ruido

