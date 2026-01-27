
# Plan: Ficha Técnica en Letra Pequeña (Estilo Contrato Legal)

## Concepto

La ficha técnica metodológica se añadirá **al final de todos los informes exportados**, después del footer corporativo, utilizando un estilo visual similar a las cláusulas legales de contratos:

- **Letra más pequeña** (9-10px vs 14-15px del contenido principal)
- **Color atenuado** (gris #6b7280 vs negro #1f2937)
- **Línea divisoria clara** que separa contenido principal de anexos técnicos
- **Encabezado "ANEXO TÉCNICO-METODOLÓGICO"** para distinguirlo visualmente

---

## Estructura Visual Propuesta

```text
═══════════════════════════════════════════════════════════════════
                    CONTENIDO PRINCIPAL DEL INFORME
                    (Tamaño normal: 14-15px, color negro)
═══════════════════════════════════════════════════════════════════
                          
                           [Footer RepIndex]
                           🌐 repindex.ai
                           © 2025 Disclaimer...

═══════════════════════════════════════════════════════════════════
                    ANEXO TÉCNICO-METODOLÓGICO
                    (Tamaño reducido: 9px, color gris)
═══════════════════════════════════════════════════════════════════

DEFINICIÓN DEL ÍNDICE
El RIX (Reputation Index) mide la percepción algorítmica de la 
reputación corporativa...

UNIVERSO DE ANÁLISIS
• 174 empresas (100% mercado cotizado español)...

[... resto de la ficha técnica en formato compacto ...]
```

---

## Archivos a Modificar/Crear

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/lib/technicalSheetHtml.ts` | **Crear** | Contenido HTML de la ficha técnica en formato compacto |
| `src/contexts/ChatContext.tsx` | **Modificar** | Insertar ficha técnica después del footer en `downloadAsHtml` |
| `src/components/ui/markdown-message.tsx` | **Modificar** | Insertar ficha técnica en `generateExportHtml` |
| `src/components/chat/CompanyBulletinViewer.tsx` | **Modificar** | Insertar ficha técnica en `generatePrintHtml` |

---

## Detalles Técnicos

### 1. Nuevo archivo: `src/lib/technicalSheetHtml.ts`

Contendrá dos exportaciones:

**A) CSS específico para la ficha técnica:**
```css
.technical-sheet {
  margin-top: 60px;
  padding-top: 24px;
  border-top: 2px solid #e5e7eb;
  font-size: 9px;
  color: #6b7280;
  line-height: 1.4;
}

.technical-sheet-header {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #d1d5db;
}

.technical-sheet h4 {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #4b5563;
  margin-top: 16px;
  margin-bottom: 6px;
}

.technical-sheet table {
  width: 100%;
  font-size: 8px;
  border-collapse: collapse;
  margin: 8px 0;
}

.technical-sheet th, 
.technical-sheet td {
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  text-align: left;
}

.technical-sheet .disclaimer-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  margin-top: 16px;
}

.technical-sheet .two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media print {
  .technical-sheet {
    page-break-before: always;
    font-size: 7pt;
  }
}
```

**B) Función que genera el HTML de la ficha:**
```typescript
export function generateTechnicalSheetHtml(options?: {
  companyName?: string;
  periodFrom?: string;
  periodTo?: string;
  rixScore?: number;
  flags?: string[];
  modelsUsed?: string[];
}): string
```

### 2. Contenido de la Ficha Técnica (Formato Compacto)

La ficha contendrá las siguientes secciones en formato ultra-condensado:

**Sección 1: Encabezado**
```
══════════════════════════════════════════════════════════════════
                 ANEXO TÉCNICO-METODOLÓGICO
              RepIndex® AI Corporate Reputation Authority
══════════════════════════════════════════════════════════════════
```

**Sección 2: Definición (3 líneas)**
```
DEFINICIÓN: El RIX mide la PERCEPCIÓN ALGORÍTMICA de la reputación 
corporativa: cómo los principales sistemas de IA describen y evalúan 
a una empresa cuando son consultados por usuarios.
```

**Sección 3: Tabla de Modelos (formato ultra-compacto)**
```
┌────────────────┬──────────────┬───────────────────────────────┐
│ Modelo         │ Proveedor    │ Método de Grounding           │
├────────────────┼──────────────┼───────────────────────────────┤
│ GPT-4.1        │ OpenAI       │ Web Search Preview            │
│ Gemini 2.5     │ Google       │ Google Search Grounding       │
│ Perplexity     │ Perplexity   │ Búsqueda nativa + citaciones  │
│ DeepSeek       │ DeepSeek     │ Tavily RAG                    │
│ Grok-3         │ xAI          │ Live Search + X               │
│ Qwen Max       │ Alibaba      │ DashScope Web Search          │
└────────────────┴──────────────┴───────────────────────────────┘
100% de los modelos acceden a Internet en tiempo real.
```

**Sección 4: Métricas (tabla compacta)**
```
SISTEMA DE MÉTRICAS (8 dimensiones)
┌─────┬──────┬───────────────────────────────────────────────────┐
│ NVM │ 15%  │ Net Vision: sentimiento neto ponderado            │
│ DRM │ 15%  │ Data Reliability: calidad de evidencia            │
│ SIM │ 12%  │ Source Integrity: jerarquía de fuentes (T1-T4)    │
│ RMM │ 12%  │ Recency: frescura de la información               │
│ CEM │ 12%  │ Controversy Exposure: riesgos reputacionales      │
│ GAM │ 12%  │ Governance Alignment: señales de gobernanza       │
│ DCM │ 12%  │ Data Consistency: coherencia entre modelos        │
│ CXM │ 10%  │ Context Integration: cotización/ratings ESG       │
└─────┴──────┴───────────────────────────────────────────────────┘
RIX = Σ(métrica × peso) / Σ(pesos)
```

**Sección 5: Control de Calidad (2 líneas)**
```
FLAGS AUTOMÁTICOS: pocas_fechas | sin_fuentes | datos_antiguos | 
respuesta_corta | alto_riesgo | drm_bajo | sim_bajo
Penalizaciones: DRM<40 o SIM<40 → RIX máx=64 | datos_antiguos → RMM máx=69
```

**Sección 6: Divergencia Inter-modelo (2 líneas)**
```
CONTROL DE SESGO: La divergencia (σ) entre 6 modelos independientes es 
una medida de incertidumbre. σ<5=consenso robusto | σ>15=alta incertidumbre
```

**Sección 7: Limitaciones y Disclaimer (caja gris)**
```
┌─────────────────────────────────────────────────────────────────┐
│ LIMITACIONES: (1) El RIX mide percepción algorítmica, no       │
│ reputación real. (2) Las IAs pueden heredar sesgos. (3) No     │
│ sustituye estudios de stakeholders. (4) No debe usarse como    │
│ única fuente para M&A, inversión regulada o ESG certificado.   │
│                                                                 │
│ DISCLAIMER LEGAL: Este informe refleja la percepción de        │
│ sistemas de IA y no constituye asesoramiento financiero,       │
│ legal o de inversión.                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Sección 8: Usos Válidos/No Válidos (tabla 2 columnas)**
```
┌───────────────────────────────┬───────────────────────────────┐
│ ✅ USOS VÁLIDOS               │ ❌ USOS NO RECOMENDADOS       │
├───────────────────────────────┼───────────────────────────────┤
│ Monitoreo narrativa IA        │ Decisiones de M&A             │
│ War room reputacional         │ Inversión regulada            │
│ Benchmark sectorial           │ Due diligence legal           │
│ Detección temprana de crisis  │ ESG certificado               │
│ Comunicación estratégica      │ Rating crediticio             │
└───────────────────────────────┴───────────────────────────────┘
```

---

## Integración en Exportaciones

### A) En ChatContext.tsx (líneas ~884-895)

Después del cierre del `</footer>`:

```typescript
import { technicalSheetStyles, generateTechnicalSheetHtml } from '@/lib/technicalSheetHtml';

// En los estilos CSS, añadir:
${technicalSheetStyles}

// Después del </footer>:
${generateTechnicalSheetHtml()}
```

### B) En markdown-message.tsx (líneas ~871-880)

Mismo patrón: insertar la ficha técnica después del footer.

### C) En CompanyBulletinViewer.tsx

Añadir la ficha al final de los boletines de empresa.

---

## Parámetros Dinámicos Opcionales

La función `generateTechnicalSheetHtml` aceptará parámetros opcionales para personalizar:

```typescript
generateTechnicalSheetHtml({
  companyName: "Telefónica",      // Si es un informe de empresa específica
  periodFrom: "2025-01-20",       // Período analizado
  periodTo: "2025-01-27",
  rixScore: 72.5,                 // Score obtenido
  flags: ["pocas_fechas"],        // Flags detectados
  modelsUsed: ["GPT-4.1", "Gemini", "Perplexity"]  // Modelos que respondieron
})
```

Si no se pasan parámetros, la ficha es genérica (para conversaciones sin empresa específica).

---

## Resultado Visual Final

El usuario verá:

1. **Contenido principal** → Tamaño normal, color negro, formato ejecutivo
2. **Footer RepIndex** → Logo, URL, disclaimer básico
3. **Línea divisoria** → Separador visual claro
4. **ANEXO TÉCNICO-METODOLÓGICO** → Letra pequeña (9px), gris, estilo contrato

Esto permite que:
- Los ejecutivos lean el contenido principal sin distracciones
- Los auditores/IA críticas tengan acceso a toda la validación científica
- El documento sea autocontenido y defendible ante cualquier revisión

---

## Orden de Implementación

1. **`src/lib/technicalSheetHtml.ts`** - Crear archivo con estilos y generador (15 min)
2. **`src/contexts/ChatContext.tsx`** - Integrar en exportación de conversación completa (5 min)
3. **`src/components/ui/markdown-message.tsx`** - Integrar en exportación de mensaje individual (5 min)
4. **`src/components/chat/CompanyBulletinViewer.tsx`** - Integrar en boletines de empresa (5 min)

Total estimado: ~30 minutos
