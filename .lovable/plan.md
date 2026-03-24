

## Auditoría completa del diccionario de términos económicos

### Arquitectura actual: 3 capas de detección

El sistema tiene **3 diccionarios** que operan en cascada, cada uno con sus propias lagunas:

```text
Capa 1: normalizeQuery()        → SECTOR_LEXICON + COMPANY_TICKER_MAP + INTENT_HINT_PATTERNS
Capa 2: semanticBridge()        → METRIC_THESAURUS + INTENT_THESAURUS + TEMPORAL_THESAURUS
Capa 3: interpretQueryEdge()    → Regex patterns (RANKING_PATTERNS_EDGE, etc.) + LLM fallback
```

### Problemas encontrados

**1. INTENT_HINT_PATTERNS (Capa 1) es demasiado pobre**

Solo tiene 8 patrones. Faltan muchos términos económicos que los usuarios usan naturalmente:

| Concepto ausente | Ejemplo de consulta que falla |
|---|---|
| "beneficio", "ingresos", "facturación" | "¿Cómo afecta la facturación a la reputación de Repsol?" |
| "dividendo", "rentabilidad" | "¿Qué empresa del IBEX tiene mejor dividendo?" |
| "deuda", "apalancamiento" | "¿Qué dicen las IAs de la deuda de Telefónica?" |
| "opa", "fusión", "adquisición" | "¿Cómo afecta la OPA a la reputación?" |
| "resultados", "earnings" | "Resultados trimestrales de BBVA" |
| "sostenibilidad", "ESG" | "¿Qué empresa lidera en ESG?" |
| "cotización", "bolsa", "acción" | "¿Cómo cotiza Iberdrola en reputación?" |
| "crisis", "escándalo" | Ya está en ALERT_PATTERNS pero no en INTENT_HINT |

**2. METRIC_THESAURUS (Capa 2) tiene términos correctos pero hay colisiones y ausencias**

- **Colisión "bolsa"/"ibex 35"**: El término "ibex 35" está en CXM (línea 1351), pero también se detecta como patrón IBEX en interpretQueryEdge. Si el usuario dice "ibex 35 y bolsa", el sistema puede rutear a ranking en vez de CXM.
- **Ausencias en CXM**: Faltan "PER", "múltiplo", "valoración", "precio objetivo" como términos sueltos (están como frases largas pero no como palabras individuales).
- **Ausencias en GAM**: Falta "compliance" como término individual, "CNMV" está duplicado entre SIM y CEM.
- **Ausencias en NVM**: Faltan "reputación" (como concepto genérico), "marca personal", "employer branding" (está en talent_reputation intent pero no en NVM metric).

**3. INTENT_THESAURUS (Capa 2) tiene intents que no se propagan correctamente**

Los intents `financial_results`, `equity_story`, `due_diligence`, `corporate_event`, `forensic_analysis`, `risk_signal`, `talent_reputation` (líneas 1484-1557) **se detectan en el thesaurus** pero:
- `interpretQueryEdge` (Capa 3) **no los reconoce** — solo conoce: ranking, evolution, divergence, alert, company_analysis, sector_comparison, general_question
- Resultado: el intent detectado en semanticBridge se inyecta en la `enriched_question` como tag `[financial_results]`, pero interpretQueryEdge lo ignora y cae a `general_question` con confianza 0.3
- El LLM fallback (gpt-4o-mini) tampoco los conoce — su prompt solo lista los intents básicos

**4. COMPANY_TICKER_MAP (Capa 1) tiene empresas importantes ausentes**

Faltan empresas relevantes del censo de 175:
- No está Técnicas Reunidas (TRE), Naturhouse (NTH), Applus+ se mapea a "AS" (debería ser "APPS.MC" o similar según BD), Prosegur Cash (no solo Prosegur), Grupo Ezentis ya en liquidación
- Empresas privadas como Pascual, Mahou, El Pozo, Mercadona ya está pero sin variantes como "Hacendado"

**5. SECTOR_LEXICON vs SECTOR_MAP del frontend están desalineados**

- Backend: tiene "Construcción" Y "Construcción e Infraestructuras" como sectores separados
- Frontend `skillInterpretQuery.ts`: mapea "construcción" → "Construcción e Infraestructuras"
- Backend: mapea "construcción" → "Construcción" (sin infraestructuras)
- Esto puede causar que el frontend detecte un sector que el backend no encuentra en BD

**6. Términos económicos en inglés que no se propagan**

El thesaurus tiene muchos términos EN/PT/CA pero los regex de interpretQueryEdge son casi exclusivamente en español. Si el LLM de `normalize-query` traduce la consulta o el usuario pregunta en inglés, los regex no capturan "how is", "what about", "best performing" etc.

### Plan de corrección

**Archivo principal**: `supabase/functions/chat-intelligence/index.ts`

**Fase 1 — Alinear intents no reconocidos**

En `interpretQueryEdge`, añadir mapeo de los intents avanzados del thesaurus a intents base:
- `financial_results` → `company_analysis` (+ añadir skill `skillGetCompanyScores`)
- `equity_story` → `company_analysis`
- `due_diligence` → `company_analysis`
- `corporate_event` → `company_analysis` (+ enfatizar CEM)
- `forensic_analysis` → `evolution`
- `risk_signal` → `alert`
- `talent_reputation` → `company_analysis` (+ enfatizar GAM)

Implementación: después de que `semanticBridge` detecte el intent, si `interpretQueryEdge` queda en `general_question` pero bridge tiene intent != null, usar el intent del bridge mapeado.

**Fase 2 — Ampliar INTENT_HINT_PATTERNS**

Añadir patrones para términos económicos frecuentes:
```ts
[/\b(beneficio|ingresos|facturaci[oó]n|ebitda|margen|rentabilidad|resultados)\b/i, "financiero"],
[/\b(dividendo|payout|recompra|buyback|retribuci[oó]n)\b/i, "financiero"],
[/\b(deuda|apalancamiento|leverage|rating|crediticio)\b/i, "financiero"],
[/\b(opa|fusi[oó]n|adquisici[oó]n|m&a|spin-?off|ipo|opv)\b/i, "corporativo"],
[/\b(cotizaci[oó]n|bolsa|acci[oó]n|burs[aá]til|precio)\b/i, "bursátil"],
[/\b(esg|sostenibilidad|gobernanza|gobierno corporativo)\b/i, "gobernanza"],
[/\b(crisis|esc[aá]ndalo|controversia|riesgo|problem)\b/i, "alerta"],
```

**Fase 3 — Propagar intent del Semantic Bridge cuando interpretQueryEdge falla**

En `buildDataPackFromSkills` (línea ~2002), después de `interpretQueryEdge`:
```ts
// Si interpretQueryEdge queda en general_question pero bridge detectó intent, usar bridge
if (interpret.intent === "general_question" && bridge.detected_intent) {
  const BRIDGE_TO_INTERPRET_MAP = {
    financial_results: "company_analysis",
    equity_story: "company_analysis",
    due_diligence: "company_analysis",
    corporate_event: "company_analysis",
    forensic_analysis: "evolution",
    risk_signal: "alert",
    talent_reputation: "company_analysis",
    // Los intents básicos ya matchean directamente
    company_analysis: "company_analysis",
    ranking: "ranking",
    evolution: "evolution",
    sector_comparison: "sector_comparison",
    divergence: "divergence",
    metric_deep_dive: "company_analysis",
  };
  const mapped = BRIDGE_TO_INTERPRET_MAP[bridge.detected_intent];
  if (mapped) {
    interpret.intent = mapped;
    interpret.confidence = 0.75;
    // Asignar skills apropiados
  }
}
```

**Fase 4 — Ampliar LLM fallback con intents avanzados**

Actualizar el system prompt del LLM fallback (línea 1916) para incluir `financial_results`, `corporate_event`, `due_diligence` como intents válidos, con instrucción de mapearlos a los skills correctos.

**Fase 5 — Alinear SECTOR_LEXICON con la BD real**

Verificar qué valores de `sector_category` existen realmente en `repindex_root_issuers` y alinear el lexicon. Eliminar la duplicación "Construcción" vs "Construcción e Infraestructuras".

### Archivo secundario (consistencia frontend)

`src/lib/skills/skillInterpretQuery.ts` — Añadir los mismos términos económicos a `RANKING_PATTERNS` y `CXM_PATTERNS` para que las sugerencias del frontend sean coherentes.

### Resultado esperado

- Consultas con terminología financiera ("beneficio", "deuda", "OPA", "dividendo", "cotización") se clasifican correctamente en vez de caer a `general_question`
- Los 7 intents avanzados del thesaurus se propagan al pipeline de skills en vez de perderse
- El LLM fallback cubre el gap restante para cualquier paráfrasis no cubierta

