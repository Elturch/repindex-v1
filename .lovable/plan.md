
# Plan: Integrar Justificación Metodológica "Radar Reputacional" en Informes

## Objetivo

Transformar los informes del Agente Rix para que incluyan **justificación metodológica integrada** que defienda el valor de RepIndex como "radar reputacional de la era algorítmica". Cada informe debe poder resistir el escrutinio de críticos humanos e IAs destiladas.

## Filosofía del Cambio

El manifiesto "RepIndex: el radar reputacional en la era algorítmica" define una propuesta de valor única:

- **No mide reputación tradicional** → Mide **probabilidad de que una narrativa gane tracción algorítmica**
- **Detección temprana** → Identifica grietas narrativas **antes** de que sean titulares
- **La IA como primer filtro cognitivo** → Quien no mide su relato en IAs, deja su reputación al azar

Esta filosofía debe **permear cada informe** de forma elegante, sin ser intrusiva.

---

## Arquitectura de Implementación

### 1. Nuevo Sistema Prompt de Defensa Metodológica

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Añadir al system prompt una sección que instruya al modelo a incluir **mini-secciones metodológicas** dentro del informe:

```
Al final de cada sección principal de datos, incluye un breve párrafo en
formato de "NOTA METODOLÓGICA" (en letra más pequeña o blockquote) que
justifique:
1. Qué mide exactamente esta métrica
2. Por qué es relevante en la era algorítmica
3. Qué nivel de consenso hay entre los 6 modelos (divergencia)
4. Qué significa esta señal para la anticipación reputacional
```

### 2. Footer Metodológico Automático en Respuestas

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

Al final de cada respuesta generada, añadir automáticamente un bloque estructurado:

```markdown
---

> **📊 Ficha de Validación Metodológica**
>
> **Sistema:** RepIndex Radar Reputacional v2.0
> **Modelos consultados:** ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen (100% con búsqueda web real)
> **Ventana temporal:** [fecha_desde] - [fecha_hasta]
> **Observaciones analizadas:** [X] registros de [Y] modelos
> **Nivel de consenso:** [bajo/medio/alto] (divergencia: ±[N] puntos)
> **Advertencia:** El RIX mide percepción algorítmica, no reputación tradicional.
> Este informe detecta señales narrativas emergentes, no verdades absolutas.
>
> *RepIndex no pregunta qué opinan las personas; pregunta qué dirían las IAs
> si alguien consultara ahora mismo sobre esta empresa.*
```

### 3. Nuevo Componente UI: `MethodologyFooter`

**Archivo:** `src/components/chat/MethodologyFooter.tsx`

Componente que renderiza el footer metodológico con estilos de "letra pequeña legal":

```tsx
interface MethodologyFooterProps {
  modelsUsed: string[];
  periodFrom: string;
  periodTo: string;
  observationsCount: number;
  divergenceLevel: 'low' | 'medium' | 'high';
  divergencePoints: number;
}

export function MethodologyFooter({...}: MethodologyFooterProps) {
  return (
    <div className="mt-6 pt-4 border-t border-border/30 text-[10px] text-muted-foreground/70 space-y-2">
      <p className="font-semibold uppercase tracking-wider text-[9px]">
        📊 Ficha de Validación Metodológica
      </p>
      {/* ... campos estructurados ... */}
      <p className="italic text-[9px] leading-snug">
        RepIndex mide la probabilidad de que una narrativa gane tracción en el ecosistema
        informativo algorítmico. No sustituye estudios tradicionales; los complementa con
        una capa que nadie más está midiendo.
      </p>
    </div>
  );
}
```

### 4. Integración en ChatMessages

**Archivo:** `src/components/chat/ChatMessages.tsx`

Añadir el `MethodologyFooter` después de cada mensaje del asistente que contenga datos RIX:

```tsx
{message.role === 'assistant' && message.metadata?.hasRixData && (
  <MethodologyFooter
    modelsUsed={message.metadata.modelsUsed}
    periodFrom={message.metadata.periodFrom}
    periodTo={message.metadata.periodTo}
    observationsCount={message.metadata.observationsCount}
    divergenceLevel={message.metadata.divergenceLevel}
    divergencePoints={message.metadata.divergencePoints}
  />
)}
```

### 5. Ampliar Metadata en el Stream SSE

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

El evento `done` del streaming debe incluir metadata metodológica:

```typescript
controller.enqueue(encoder.encode(`data: ${JSON.stringify({
  type: 'done',
  suggestedQuestions,
  drumrollQuestion,
  metadata: {
    type: category,
    hasRixData: allRixData?.length > 0,
    modelsUsed: [...new Set(allRixData?.map(r => r['02_model_name']) || [])],
    periodFrom: allRixData?.[allRixData.length - 1]?.['06_period_from'],
    periodTo: allRixData?.[0]?.['07_period_to'],
    observationsCount: allRixData?.length || 0,
    divergenceLevel: insights?.divergenceLevel || 'unknown',
    divergencePoints: insights?.trendDelta || 0,
  }
})}\n\n`));
```

### 6. Actualizar Exportación HTML

**Archivo:** `src/lib/technicalSheetHtml.ts`

Añadir nueva sección "Filosofía del Radar Reputacional" al anexo técnico:

```html
<h4>Filosofía del Radar Reputacional</h4>
<p>
  RepIndex no mide la reputación tradicional. Mide la <strong>probabilidad de que
  una narrativa gane tracción en el ecosistema informativo algorítmico</strong>.
</p>
<p>
  En 2026, las IAs son el primer filtro cognitivo. El primer punto de contacto
  reputacional. El lugar donde se decide qué es relevante, creíble o dudoso.
  La reputación ya no se pierde en una portada: se pierde cuando un modelo
  deja de confiar en tu narrativa.
</p>
<p>
  RepIndex detecta anomalías semánticas cuando aún no hay titulares, trending topics
  ni caídas bursátiles. Solo una grieta en el relato algorítmico.
</p>
```

---

## Flujo de Datos Actualizado

```
                              ┌─────────────────────────────────────┐
                              │   EDGE FUNCTION chat-intelligence  │
                              └─────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. GENERAR RESPUESTA CON INSTRUCCIONES METODOLÓGICAS                      │
│     - System prompt incluye directivas de "notas metodológicas inline"     │
│     - Cada sección de datos lleva su mini-justificación                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. AÑADIR FOOTER METODOLÓGICO AL CONTENIDO                                │
│     - Bloque markdown estructurado con datos de validación                 │
│     - Insertado automáticamente antes del "done" event                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. STREAMING CON METADATA ENRIQUECIDA                                     │
│     - type: 'done' incluye modelsUsed, divergenceLevel, observationsCount  │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. FRONTEND: ChatMessages.tsx                                             │
│     - Renderiza MarkdownMessage con contenido                              │
│     - Renderiza MethodologyFooter con metadata                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. EXPORTACIÓN HTML                                                       │
│     - Incluye todo el contenido + Anexo Técnico Ampliado                   │
│     - Sección "Filosofía del Radar Reputacional" añadida                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/chat-intelligence/index.ts` | System prompt con directivas metodológicas, metadata enriquecida, footer automático |
| `src/components/chat/MethodologyFooter.tsx` | **NUEVO**: Componente de footer metodológico |
| `src/components/chat/ChatMessages.tsx` | Integrar MethodologyFooter para mensajes con datos RIX |
| `src/contexts/ChatContext.tsx` | Extender interface Message con campos de metadata metodológica |
| `src/lib/technicalSheetHtml.ts` | Añadir sección "Filosofía del Radar Reputacional" |

---

## Ejemplo de Resultado Final

Cuando un usuario pida "Análisis de Telefónica", el informe incluirá:

1. **Contenido del informe** con notas metodológicas inline:
   > El RIX de Telefónica es 72/100.
   >
   > *Nota metodológica: Este score representa el consenso de 6 modelos de IA con búsqueda web real. La divergencia inter-modelo de ±8 puntos indica un nivel medio de incertidumbre epistémica, sugiriendo que la narrativa está consolidándose pero aún presenta variabilidad.*

2. **Footer de validación** al final del mensaje:
   > 📊 **Ficha de Validación Metodológica**
   > - Modelos: ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen
   > - Período: 2026-W04
   > - Observaciones: 24 registros
   > - Consenso: Medio (±8 pts)
   > - *RepIndex mide probabilidad de tracción narrativa algorítmica, no reputación tradicional.*

3. **En exportación HTML**: Anexo técnico completo con la filosofía del "radar reputacional"

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| Informes sin contexto metodológico | Cada afirmación respaldada por método |
| Críticos pueden cuestionar validez | Defensa metodológica integrada |
| Otras IAs pueden dudar del sistema | Transparencia que genera confianza |
| Datos sin explicar su significado | Cada métrica explicada en contexto |
| Anexo técnico solo en exportación | Metodología visible en chat + exportación |

El resultado es un sistema que se **autolegitima** ante cualquier auditor, crítico o IA que analice los informes de RepIndex.
