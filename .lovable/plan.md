
# Plan: Anexo de Referencias Bibliográficas (Solo Fuentes Verificables)

## Problema Crítico Identificado

Después de analizar las respuestas brutas de las 6 IAs, he identificado que:

| Modelo | Tipo de Fuentes | Verificabilidad |
|--------|-----------------|-----------------|
| ChatGPT (con web search) | URLs reales con `?utm_source=openai` | VERIFICADAS - Ej: cincodias.elpais.com ✓ |
| Perplexity | Referencias numeradas `[n]` con URLs | VERIFICADAS |
| Gemini | Menciones narrativas sin URLs | NO VERIFICABLE |
| DeepSeek | Campo `sources_used` pero formato variable | PARCIALMENTE VERIFICABLE |
| Grok | URLs con formato fabricado | POTENCIALES ALUCINACIONES |
| Qwen | URLs con formato fabricado + citas inventadas | POTENCIALES ALUCINACIONES |

**Conclusión**: Solo podemos garantizar la veracidad de las fuentes de **ChatGPT** y **Perplexity**.

---

## Solución Propuesta: Extracción Conservadora

### Principio Fundamental
**Solo incluir en la bibliografía fuentes que provienen de modelos con búsqueda web verificable (ChatGPT, Perplexity)**. Nunca fabricar ni incluir URLs de modelos que potencialmente alucinan.

### Qué se Extraerá

**De ChatGPT:**
```text
Formato detectado: ([dominio.com](URL_completa?utm_source=openai))
Ejemplo: ([cincodias.elpais.com](https://cincodias.elpais.com/...?utm_source=openai))
```

**De Perplexity:**
```text
Formato detectado: "[n]" con sección de fuentes en JSON
Ejemplo: "Grifols demanda por 'declaraciones falsas'.[2]" → Wikipedia[2]
```

### Qué NO se Extraerá
- URLs de Grok (formato `expansion.com/empresas/noticias/...` - fabricadas)
- URLs de Qwen (formato similar - fabricadas)
- URLs de DeepSeek (variable, no verificable)
- Menciones narrativas de Gemini ("según Expansión" sin URL)
- Cualquier cita textual de un CEO u otra persona (no verificable sin URL)

---

## Implementación Técnica

### 1. Extractor de Fuentes Verificables

Crear `src/lib/verifiedSourceExtractor.ts`:

```typescript
interface VerifiedSource {
  url: string;
  domain: string;
  sourceModel: 'ChatGPT' | 'Perplexity';
  contextSnippet?: string;  // Solo si viene de la respuesta real
  citationNumber?: number;  // Para referencias [n] de Perplexity
}

/**
 * Extrae SOLO URLs verificables de ChatGPT (con utm_source=openai)
 * y referencias de Perplexity (formato [n])
 */
export function extractVerifiedSources(
  chatGptRaw: string | null,
  perplexityRaw: string | null
): VerifiedSource[]
```

**Regex para ChatGPT:**
```typescript
// Busca el patrón ([dominio](URL?utm_source=openai))
const chatGptUrlPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+utm_source=openai[^\)]*)\)/g;
```

**Parser para Perplexity:**
```typescript
// Parsea el JSON y extrae las fuentes del campo específico
// Perplexity devuelve respuestas estructuradas con campo "fuente"
```

### 2. Integración en el Edge Function

Modificar `chat-intelligence/index.ts` para:

1. Cuando se recuperan datos de `rix_runs`/`rix_runs_v2`, extraer fuentes verificables
2. Retornar en el metadata SSE:

```typescript
{
  type: 'metadata',
  metadata: {
    // ... campos existentes
    verifiedSources?: VerifiedSource[]  // Solo ChatGPT + Perplexity
  }
}
```

### 3. Almacenamiento en Mensaje

En `ChatContext.tsx`, guardar las fuentes verificables:

```typescript
interface Message {
  metadata?: {
    // ... campos existentes
    verifiedSources?: VerifiedSource[];
  };
}
```

### 4. Generación del Anexo Bibliográfico

En `downloadAsHtml()`, generar la sección solo si hay fuentes verificadas:

```html
<section class="bibliography-verified">
  <h2>Anexo: Referencias Citadas por las IAs</h2>
  
  <p class="bibliography-disclaimer">
    Las siguientes referencias han sido citadas por modelos de IA con 
    capacidad de búsqueda web verificable (ChatGPT con Web Search, Perplexity).
    RepIndex ha verificado la existencia de estas URLs al momento de la consulta,
    pero no garantiza su permanencia futura ni el contenido de terceros.
  </p>
  
  <h3>Fuentes Citadas</h3>
  <ol class="verified-sources">
    <li>
      <span class="source-domain">cincodias.elpais.com</span>
      <a href="https://..." target="_blank" rel="noopener">
        Fallece el consejero de Línea Directa John de Zulueta Greenebaum
      </a>
      <span class="source-model">(ChatGPT)</span>
    </li>
    ...
  </ol>
  
  <div class="methodology-note">
    <strong>Nota metodológica:</strong> Esta lista incluye únicamente 
    fuentes con URLs verificables provenientes de modelos con búsqueda 
    web activa. Las afirmaciones de otros modelos (Gemini, DeepSeek, 
    Grok, Qwen) no se incluyen por no poder verificar su procedencia.
  </div>
</section>
```

---

## Lo que NO Haremos (Evitar Alucinaciones)

1. **NO extraer URLs de Grok/Qwen/Gemini** - Formato fabricado
2. **NO citar frases textuales de CEOs** - No verificables sin URL original
3. **NO incluir "según El País" sin URL** - Podría ser alucinación
4. **NO clasificar por Tier SIM** - Solo listar lo que existe
5. **NO generar descripciones de las URLs** - Solo mostrar dominio + título si está disponible

---

## Flujo de Datos

```text
rix_runs / rix_runs_v2
├── 20_res_gpt_bruto ──────────► Regex extrae URLs con utm_source=openai
├── 21_res_perplex_bruto ──────► Parser extrae referencias [n]
├── 22_res_gemini_bruto ───────► IGNORADO (sin URLs verificables)
├── 23_res_deepseek_bruto ─────► IGNORADO (formato variable)
├── respuesta_bruto_grok ──────► IGNORADO (URLs fabricadas)
└── respuesta_bruto_qwen ──────► IGNORADO (URLs fabricadas)
         │
         ▼
┌─────────────────────────────────┐
│   verifiedSources[]             │
│   Solo ChatGPT + Perplexity     │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Informe HTML Exportado        │
│   "Anexo: Referencias Citadas"  │
│   + Disclaimer de verificación  │
└─────────────────────────────────┘
```

---

## Archivos a Crear/Modificar

| Archivo | Cambio |
|---------|--------|
| **NUEVO** `src/lib/verifiedSourceExtractor.ts` | Funciones de extracción de URLs verificables |
| `supabase/functions/chat-intelligence/index.ts` | Extraer fuentes al consultar rix_runs y retornar en metadata |
| `src/contexts/ChatContext.tsx` | Almacenar `verifiedSources` en mensaje y generar anexo en `downloadAsHtml` |

---

## Ejemplo de Output Final

```
═══════════════════════════════════════════════════
     ANEXO: REFERENCIAS CITADAS POR LAS IAS
═══════════════════════════════════════════════════

Las siguientes referencias han sido citadas por modelos 
de IA con capacidad de búsqueda web verificable.

FUENTES VERIFICADAS:

1. cincodias.elpais.com
   "Fallece el consejero de Línea Directa John de 
   Zulueta Greenebaum"
   Citado por: ChatGPT
   
2. forbes.es
   "Línea Directa duplica su beneficio en el primer 
   trimestre hasta los 20,8 millones de euros"
   Citado por: ChatGPT

3. Wikipedia (Grifols)
   Controversia con Gotham City Research (2024)
   Citado por: Perplexity [2]

─────────────────────────────────────────────────
NOTA METODOLÓGICA: Esta lista incluye únicamente 
fuentes con URLs verificables provenientes de 
modelos con búsqueda web activa (ChatGPT, Perplexity).
Las afirmaciones de otros modelos no se incluyen
por no poder verificar su procedencia documental.
═══════════════════════════════════════════════════
```

---

## Resultado Esperado

1. Los informes incluirán un anexo de referencias SOLO con fuentes verificables
2. Cero riesgo de incluir URLs fabricadas o citas inventadas
3. Disclaimer claro sobre qué modelos aportan fuentes y cuáles no
4. Consistencia bibliográfica profesional sin comprometer la veracidad
5. Transparencia total sobre las limitaciones del sistema
