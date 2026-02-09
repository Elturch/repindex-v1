

# Actualizar Boletín Ejecutivo: 6 IAs + Bibliografía Verificada

## Diagnóstico del Problema

El boletín ejecutivo generado desde el botón del Agente Rix tiene dos deficiencias críticas:

| Problema | Estado Actual | Estado Esperado |
|----------|--------------|-----------------|
| Modelos de IA mencionados | Solo 4 (ChatGPT, Perplexity, Gemini, DeepSeek) | 6 modelos (+ Grok, + Qwen) |
| Bibliografía verificada | No se incluye (0 fuentes extraídas) | Anexo con fuentes de ChatGPT y Perplexity |

## Causa Raíz Técnica

### 1. Query de Datos Incompleta

La consulta que obtiene los datos RIX para el boletín **no incluye** los campos de respuesta bruta necesarios para extraer las fuentes verificadas:

**Campos faltantes en la query** (líneas 2607-2636 de `chat-intelligence/index.ts`):
- `20_res_gpt_bruto` (respuesta bruta de ChatGPT con URLs utm_source=openai)
- `21_res_perplex_bruto` (respuesta bruta de Perplexity con citaciones)

Sin estos campos, `extractSourcesFromRixData(rixData)` siempre devuelve un array vacío.

### 2. Prompt del Sistema Desactualizado

El `BULLETIN_SYSTEM_PROMPT` (líneas 1544-1812) solo referencia 4 IAs:
- Sección 3: "EL JUICIO DE LAS 4 INTELIGENCIAS"
- Tabla de evolución: solo columnas ChatGPT, Perplexity, Gemini, DeepSeek
- Sin menciones a Grok ni Qwen

### 3. Visor del Boletín sin Fuentes

El componente `CompanyBulletinViewer` no recibe ni renderiza las fuentes verificadas, mientras que el `MarkdownMessage` sí lo hace para respuestas normales.

---

## Plan de Implementación

### Paso 1: Añadir Campos de Fuentes a la Query del Boletín

Modificar la consulta de datos RIX en `fetchUnifiedRixData` para incluir las respuestas brutas:

```typescript
// Añadir a la lista de columns:
"20_res_gpt_bruto",
"21_res_perplex_bruto",
```

Esto permitirá que `extractSourcesFromRixData()` extraiga las URLs verificadas de ChatGPT (utm_source=openai) y las citaciones de Perplexity.

### Paso 2: Actualizar el Prompt del Boletín a 6 IAs

Modificar `BULLETIN_SYSTEM_PROMPT` para reflejar los 6 modelos:

1. **Sección 3**: Cambiar "EL JUICIO DE LAS 4 INTELIGENCIAS" → "EL JUICIO DE LAS 6 INTELIGENCIAS"
2. **Añadir secciones para Grok y Qwen**:
   - `#### Grok evalúa: RIX [XX] — "[Frase]"`
   - `#### Qwen considera: RIX [XX] — "[Frase]"`
3. **Actualizar tablas de evolución**: Añadir columnas Grok y Qwen
4. **Actualizar glosario de modelos** en la sección de metodología

### Paso 3: Pasar Fuentes al Visor del Boletín

Modificar `CompanyBulletinViewer` para:
1. Recibir props adicionales: `verifiedSources`, `periodFrom`, `periodTo`
2. Incluir la bibliografía verificada en el HTML de exportación usando `generateBibliographyHtml()`
3. Renderizar las fuentes al final del boletín en pantalla

### Paso 4: Actualizar ChatMessages para Pasar Metadata

Modificar el componente `ChatMessages` para pasar las fuentes verificadas al `CompanyBulletinViewer`:

```tsx
<CompanyBulletinViewer 
  content={message.content}
  companyName={message.metadata?.companyName}
  verifiedSources={message.metadata?.verifiedSources}
  periodFrom={message.metadata?.methodology?.periodFrom}
  periodTo={message.metadata?.methodology?.periodTo}
/>
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir campos de fuentes a query (líneas 2607-2636) y actualizar prompt (líneas 1544-1812) |
| `src/components/chat/CompanyBulletinViewer.tsx` | Añadir props de fuentes, incluir bibliografía en HTML de exportación |
| `src/components/chat/ChatMessages.tsx` | Pasar metadata de fuentes al visor |

---

## Resultado Esperado

Tras la implementación:

| Aspecto | Antes | Después |
|---------|-------|---------|
| Modelos en boletín | 4 | 6 (+ Grok, Qwen) |
| Fuentes extraídas | 0 | 10-50 (según empresa) |
| Bibliografía en PDF | No | Sí (Anexo: Referencias Citadas) |
| Coherencia con chat | Parcial | Total |

El boletín ejecutivo mostrará los 6 modelos de IA y el PDF/HTML de descarga incluirá automáticamente el "Anexo: Referencias Citadas por las IAs" con las fuentes verificadas clasificadas temporalmente.

