
# Plan: Unificación del Glosario de Métricas RIX

## Diagnóstico del Problema

Se ha detectado una **incoherencia ontológica crítica** entre dos sistemas de definición de métricas que coexisten en el codebase:

### Ontología A: "Técnica" (Fuente de Verdad)
Usada en: `rix-analyze-v2`, `glossary-dialog.tsx`, `RixRunDetail.tsx`, `technicalSheetHtml.ts`

| Sigla | Nombre Técnico Inglés | Descripción Técnica |
|-------|----------------------|---------------------|
| NVM | Narrative Value Metric | Calidad de la narrativa (tono + controversia + alucinación) |
| DRM | Data Reliability Metric | Fortaleza de evidencia documental |
| SIM | Source Integrity Metric | Jerarquía de fuentes T1-T4 |
| RMM | Reputational Momentum Metric | Frescura temporal de menciones |
| CEM | Controversy Exposure Metric | Exposición a controversias (inverso) |
| GAM | Governance Autonomy Metric | Percepción de independencia de gobierno |
| DCM | Data Consistency Metric | Coherencia de información entre modelos |
| CXM | Corporate Execution Metric | Ejecución corporativa + cotización |

### Ontología B: "Marketing" (Incorrecta)
Usada en: `Methodology.tsx`, `chat-intelligence (prompts)`, `graphContextBuilder.ts`

| Sigla | Nombre "Inventado" | Significado Falso |
|-------|-------------------|-------------------|
| NVM | Narrativa y Visibilidad Mediática | Cobertura mediática |
| DRM | Desempeño y Resultados Empresariales | Rendimiento financiero |
| SIM | Sostenibilidad e Impacto Ambiental | ESG/Huella carbono |
| RMM | Reputación de Marca y Marketing | Branding/Diferenciación |
| CEM | Comportamiento Ético y Gobierno | Ética empresarial |
| GAM | Gestión y Atracción del Talento | RRHH/Employer branding |
| DCM | Digital y Capacidad de Innovación | I+D/Transformación digital |
| CXM | Experiencia del Cliente | Satisfacción cliente |

**Impacto**: Un cliente que lea que "SIM mide sostenibilidad" optimizará sus comunicaciones ESG, pero la métrica real evalúa si Reuters o Bloomberg mencionan a la empresa. Esto destruye la credibilidad del sistema.

---

## Solución: Sistema de Glosario Canónico Centralizado

### Fase 1: Crear Fuente Única de Verdad

**Nuevo archivo**: `src/lib/rixMetricsGlossary.ts`

Este archivo será el **único lugar** donde se definen las métricas. Contiene:

1. **Definición técnica** (nombre inglés, fórmula, qué mide realmente)
2. **Definición ejecutiva** (interpretación de negocio coherente con la técnica)
3. **Mapeo explícito** técnico → ejecutivo con justificación

```typescript
// Estructura del glosario canónico
export interface MetricDefinition {
  acronym: string;
  technicalName: string;           // Ej: "Narrative Value Metric"
  technicalDescription: string;    // Fórmula/metodología real
  executiveName: string;           // Ej: "Calidad de la Narrativa"
  executiveDescription: string;    // Interpretación de negocio
  mappingJustification: string;    // Por qué el nombre ejecutivo es correcto
  icon: string;                    // Icono para UI
  weight: number;                  // Peso en el RIX (ej: 0.15)
}

export const RIX_METRICS_GLOSSARY: MetricDefinition[] = [
  {
    acronym: "NVM",
    technicalName: "Narrative Value Metric",
    technicalDescription: "NVM = clip(50*(s̄+1) - 20*c̄ - 30*h̄). Donde s̄ = sentimiento medio, c̄ = controversia, h̄ = alucinación.",
    executiveName: "Calidad de la Narrativa",
    executiveDescription: "Evalúa la coherencia y calidad del discurso público según las IAs. Un NVM alto indica narrativa clara, baja controversia y afirmaciones verificables.",
    mappingJustification: "El nombre ejecutivo refleja que esta métrica mide 'cómo de bien cuenta su historia la empresa', no visibilidad mediática.",
    icon: "MessageSquare",
    weight: 0.15,
  },
  // ... resto de métricas
];
```

### Fase 2: Actualizar Todos los Consumidores

**Archivos a modificar** (importarán desde el glosario canónico):

| Archivo | Cambio Requerido |
|---------|------------------|
| `src/components/ui/glossary-dialog.tsx` | Importar de `rixMetricsGlossary.ts` |
| `src/pages/Methodology.tsx` | Importar de `rixMetricsGlossary.ts` (corregir ontología B) |
| `src/lib/graphContextBuilder.ts` | Importar de `rixMetricsGlossary.ts` |
| `src/pages/RixRunDetail.tsx` | Importar de `rixMetricsGlossary.ts` |
| `src/pages/Dashboard.tsx` | Importar de `rixMetricsGlossary.ts` |
| `supabase/functions/chat-intelligence/index.ts` | Sincronizar prompts con glosario |
| `supabase/functions/rix-regression-analysis/index.ts` | Importar constantes del glosario |
| `src/lib/technicalSheetHtml.ts` | Corregir NVM ("Net Vision" → "Narrative Value") |
| `public/llms.txt` | Actualizar descripciones para agentes externos |

### Fase 3: Añadir Tabla de Mapeo en Informes

**Nuevo componente**: `src/components/ui/MetricMappingTable.tsx`

Tabla que aparece automáticamente en informes exhaustivos:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CORRESPONDENCIA DE MÉTRICAS RIX                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Sigla │ Nombre Técnico          │ Interpretación Ejecutiva                 │
├───────┼─────────────────────────┼──────────────────────────────────────────┤
│ NVM   │ Narrative Value Metric  │ Calidad de la Narrativa                  │
│ DRM   │ Data Reliability Metric │ Fortaleza de Evidencia                   │
│ SIM   │ Source Integrity Metric │ Autoridad de Fuentes                     │
│ RMM   │ Reputational Momentum   │ Actualidad y Empuje                      │
│ CEM   │ Controversy Exposure    │ Gestión de Controversias (inverso)       │
│ GAM   │ Governance Autonomy     │ Percepción de Gobierno Independiente     │
│ DCM   │ Data Consistency Metric │ Coherencia Informativa                   │
│ CXM   │ Corporate Execution     │ Ejecución Corporativa                    │
└───────┴─────────────────────────┴──────────────────────────────────────────┘
```

### Fase 4: Inyectar en chat-intelligence

**Modificar prompts** en `chat-intelligence/index.ts`:

1. Incluir el glosario canónico en el system prompt
2. Obligar al LLM a usar SOLO los nombres del glosario
3. Para informes `exhaustive`, incluir la tabla de mapeo automáticamente

```typescript
const METRICS_GLOSSARY_PROMPT = `
## GLOSARIO OBLIGATORIO DE MÉTRICAS RIX

IMPORTANTE: Usa EXACTAMENTE estos nombres. No inventes interpretaciones.

| Sigla | Nombre Técnico | Qué Mide Realmente |
|-------|----------------|-------------------|
| NVM | Narrative Value Metric | Calidad de narrativa: tono + coherencia |
| DRM | Data Reliability Metric | Evidencia documental verificable |
| SIM | Source Integrity Metric | Calidad de fuentes (T1=CNMV/Reuters) |
| RMM | Reputational Momentum | Frescura de menciones (% en ventana) |
| CEM | Controversy Exposure | Exposición a controversias (inverso) |
| GAM | Governance Autonomy | Percepción de independencia gobierno |
| DCM | Data Consistency | Coherencia entre modelos de IA |
| CXM | Corporate Execution | Ejecución + cotización bursátil |

⚠️ SIM NO mide sostenibilidad/ESG. Mide jerarquía de fuentes.
⚠️ DRM NO mide desempeño financiero. Mide calidad de evidencia.
⚠️ DCM NO mide innovación digital. Mide coherencia de datos.
`;
```

### Fase 5: Validación Automática

**Nuevo test** (opcional): `src/lib/__tests__/metricsGlossary.test.ts`

Test que verifica que todos los archivos usan definiciones del glosario canónico.

---

## Tabla de Definiciones Correctas (Nueva Ontología Unificada)

| Sigla | Nombre Técnico (EN) | Nombre Ejecutivo (ES) | Qué Mide Realmente |
|-------|---------------------|----------------------|-------------------|
| **NVM** | Narrative Value Metric | Calidad de la Narrativa | Coherencia del discurso: tono medio, nivel de controversia, afirmaciones sin soporte |
| **DRM** | Data Reliability Metric | Fortaleza de Evidencia | Calidad de documentación: fuentes primarias, corroboración, trazabilidad |
| **SIM** | Source Integrity Metric | Autoridad de Fuentes | Jerarquía de fuentes citadas: T1 (reguladores/financieros) → T4 (opinión/redes) |
| **RMM** | Reputational Momentum Metric | Actualidad y Empuje | Frescura temporal: % de hechos dentro de la ventana semanal analizada |
| **CEM** | Controversy Exposure Metric | Gestión de Controversias | Exposición a riesgos: judiciales, políticos, laborales (puntuación inversa) |
| **GAM** | Governance Autonomy Metric | Percepción de Gobierno | Independencia percibida: policies declaradas, conflictos de interés |
| **DCM** | Data Consistency Metric | Coherencia Informativa | Consistencia entre modelos: nombres, fechas, roles, cifras |
| **CXM** | Corporate Execution Metric | Ejecución Corporativa | Impacto en mercado: cotización bursátil, ratings ESG verificables |

---

## Archivos a Crear/Modificar

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `src/lib/rixMetricsGlossary.ts` | CREAR | Alta |
| `src/components/ui/glossary-dialog.tsx` | Refactorizar para usar glosario | Alta |
| `src/pages/Methodology.tsx` | Corregir ontología incorrecta | Alta |
| `src/lib/graphContextBuilder.ts` | Sincronizar con glosario | Alta |
| `src/lib/technicalSheetHtml.ts` | Corregir "Net Vision" → "Narrative Value" | Alta |
| `supabase/functions/chat-intelligence/index.ts` | Inyectar glosario en prompts | Alta |
| `src/pages/RixRunDetail.tsx` | Importar de glosario | Media |
| `supabase/functions/rix-regression-analysis/index.ts` | Sincronizar | Media |
| `public/llms.txt` | Actualizar para agentes externos | Media |
| `.lovable/plan.md` | Documentar decisión arquitectónica | Baja |

---

## Beneficios

1. **Fuente única de verdad**: Una sola definición por métrica
2. **Coherencia técnico-ejecutiva**: Mapeo explícito y justificado
3. **Autolegitimación**: Los informes incluyen tabla de correspondencia
4. **Mantenibilidad**: Cambiar una definición actualiza todo el sistema
5. **Credibilidad**: El cliente entiende exactamente qué optimizar
