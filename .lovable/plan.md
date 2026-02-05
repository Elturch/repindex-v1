
# Plan: Mejora del Agente Diseñador de Presentaciones PPTX

## Resumen Ejecutivo

El sistema actual de generación de PPTX tiene tres problemas principales:
1. **Parser JSON** - Falla al extraer el JSON del bloque markdown, cayendo a un fallback con solo 3 slides genéricas
2. **Nombre de empresa ausente** - El Hero slide no muestra prominentemente la empresa analizada
3. **Prompt de diseño insuficiente** - No hay instrucciones para construir una narrativa comercial coherente basada en las respuestas valoradas

## Cambios Técnicos

### 1. Corregir el Parser JSON en `design-pptx-slides`

**Archivo:** `supabase/functions/design-pptx-slides/index.ts`

Problema: El regex actual puede fallar con ciertos formatos de bloques de código.

```typescript
// ANTES (problemático):
const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();

// DESPUÉS (robusto):
// Múltiples estrategias de extracción
let jsonStr = rawContent.trim();

// Estrategia 1: Buscar bloque markdown JSON
const codeBlockMatch = rawContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
if (codeBlockMatch) {
  jsonStr = codeBlockMatch[1].trim();
}
// Estrategia 2: Buscar directamente el array JSON
else if (rawContent.includes('[')) {
  const start = rawContent.indexOf('[');
  const end = rawContent.lastIndexOf(']');
  if (start !== -1 && end > start) {
    jsonStr = rawContent.substring(start, end + 1);
  }
}
```

---

### 2. Inyectar `company_name` en el Hero Slide

**Archivo:** `supabase/functions/design-pptx-slides/index.ts`

Después de parsear las slides, añadir post-procesado para asegurar que el Hero tenga el nombre de la empresa:

```typescript
// Post-procesar: Asegurar que el Hero slide tenga company_name
slides = slides.map((slide: any) => {
  if (slide.slideType === 'hero') {
    return { ...slide, company_name: company_name };
  }
  return slide;
});
```

---

### 3. Mejorar el System Prompt del Diseñador

**Archivo:** `supabase/functions/design-pptx-slides/index.ts`

Añadir sección de instrucciones para construir narrativa comercial:

```text
## FILOSOFÍA DE DISEÑO NARRATIVO

Tu objetivo NO es resumir contenido. Tu objetivo es CONSTRUIR UN ARGUMENTO DE VENTA 
visual que convenza al destinatario de que NECESITA RepIndex.

### FLUJO NARRATIVO OBLIGATORIO:

1. **APERTURA (hero)**: Frase gancho que cree TENSIÓN. El nombre de la empresa 
   debe aparecer en headline o subheadline. Ejemplo: "IBERDROLA: La brecha entre 
   tu realidad y tu percepción algorítmica"

2. **EL PROBLEMA (metrics o split)**: Datos concretos que demuestren que hay 
   un problema que el cliente NO PUEDE VER sin RepIndex

3. **LA EVIDENCIA (content o comparison)**: Extractos textuales de lo que las 
   IAs dicen sobre la empresa - citas específicas del contenido valorado

4. **LA OPORTUNIDAD (three_columns o split)**: Qué puede ganar si actúa ahora

5. **LAS PREGUNTAS IMPOSIBLES (questions)**: Preguntas que solo RepIndex puede 
   responder - demuestran el valor único de la herramienta

6. **CIERRE (cta)**: Llamada a acción clara con urgencia

### REGLAS DE EXTRACCIÓN DEL CONTENIDO VALORADO:

- Lee CADA respuesta valorada buscando: cifras, comparativas, citas textuales, 
  tendencias, alertas, oportunidades
- Si hay una comparativa con competidores → usa slide "comparison"
- Si hay métricas numéricas específicas → usa slide "metrics"  
- Si hay citas de lo que dicen las IAs → usa slide "quote"
- Si hay preguntas para Rix → usa slide "questions"
```

---

### 4. Añadir Logging Mejorado para Debug

**Archivo:** `supabase/functions/design-pptx-slides/index.ts`

Añadir más información de debug para futuras incidencias:

```typescript
console.log(`[design-pptx-slides] Slide types generated:`, 
  slides.map((s: any) => s.slideType).join(', '));
console.log(`[design-pptx-slides] Hero has company_name:`, 
  slides[0]?.company_name || 'NOT SET');
```

---

## Resumen de Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/design-pptx-slides/index.ts` | Parser JSON robusto, inyección company_name, prompt mejorado, logging |

## Validación

Después de implementar:
1. Generar una presentación para cualquier empresa con al menos 2 respuestas valoradas con 4-5 estrellas
2. Verificar que:
   - Se generan 6-10 slides (no 3 genéricas)
   - El Hero slide muestra el nombre de la empresa prominentemente
   - La narrativa sigue el flujo: problema → evidencia → oportunidad → CTA
