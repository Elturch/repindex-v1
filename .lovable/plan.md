
# Plan: Corregir Visibilidad de Grok y Qwen en Chat Intelligence

## 📋 Resumen del Problema

El Vector Store **sí** contiene los datos de las 6 IAs correctamente indexados. Sin embargo, la función `chat-intelligence` tiene **3 puntos ciegos** que impiden que Grok y Qwen aparezcan en las respuestas:

| Ubicación | Problema | Impacto |
|-----------|----------|---------|
| Líneas 2353-2360 | Lista de campos para búsqueda de keywords solo incluye 4 modelos | Los textos de Grok/Qwen nunca se incluyen en extractos de palabras clave |
| Líneas 2407, 2414 | `records.slice(0, 4)` corta los registros a 4 | Aunque el mapa de campos incluye Grok/Qwen, nunca se procesan |
| Líneas 2798-2802 | Ejemplo de tabla en system prompt solo muestra 4 modelos | La IA genera tablas incompletas por imitación del ejemplo |

---

## 🔧 Cambios Requeridos

### Cambio 1: Añadir Grok y Qwen a la lista de campos para búsqueda

**Archivo:** `supabase/functions/chat-intelligence/index.ts`
**Líneas:** 2353-2360

```typescript
// ANTES (solo 4 modelos):
const fields = [
  { name: 'ChatGPT', value: r["20_res_gpt_bruto"] },
  { name: 'Perplexity', value: r["21_res_perplex_bruto"] },
  { name: 'Gemini', value: r["22_res_gemini_bruto"] },
  { name: 'DeepSeek', value: r["23_res_deepseek_bruto"] },
  { name: 'Explicación', value: r["22_explicacion"] },
  { name: 'Resumen', value: r["10_resumen"] },
];

// DESPUÉS (6 modelos + explicación + resumen):
const fields = [
  { name: 'ChatGPT', value: r["20_res_gpt_bruto"] },
  { name: 'Perplexity', value: r["21_res_perplex_bruto"] },
  { name: 'Gemini', value: r["22_res_gemini_bruto"] },
  { name: 'DeepSeek', value: r["23_res_deepseek_bruto"] },
  { name: 'Grok', value: r["respuesta_bruto_grok"] },
  { name: 'Qwen', value: r["respuesta_bruto_qwen"] },
  { name: 'Explicación', value: r["22_explicacion"] },
  { name: 'Resumen', value: r["10_resumen"] },
];
```

### Cambio 2: Aumentar límite de registros de 4 a 6+

**Archivo:** `supabase/functions/chat-intelligence/index.ts`
**Líneas:** 2407 y 2414

```typescript
// ANTES (línea 2407):
records.slice(0, 4).forEach(r => {

// DESPUÉS:
records.slice(0, 6).forEach(r => {

// ANTES (línea 2414):
records.slice(0, 4).forEach(r => {

// DESPUÉS:
records.slice(0, 6).forEach(r => {
```

### Cambio 3: Actualizar ejemplo de tabla en system prompt

**Archivo:** `supabase/functions/chat-intelligence/index.ts`
**Líneas:** 2798-2802

```typescript
// ANTES:
| Modelo IA | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
|-----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| ChatGPT   | 64  | 71  | 63  | 35  | 35  | 100 | 50  | 88  | 62  |
| Gemini    | 50  | 55  | 30  | 10  | 42  | 90  | 50  | 70  | 60  |
| ...       | ... | ... | ... | ... | ... | ... | ... | ... | ... |

// DESPUÉS:
| Modelo IA  | RIX | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
|------------|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| ChatGPT    | 64  | 71  | 63  | 35  | 35  | 100 | 50  | 88  | 62  |
| Perplexity | 68  | 75  | 58  | 42  | 38  | 95  | 55  | 85  | 58  |
| Gemini     | 50  | 55  | 30  | 10  | 42  | 90  | 50  | 70  | 60  |
| DeepSeek   | 55  | 60  | 45  | 25  | 35  | 88  | 48  | 72  | 55  |
| Grok       | 62  | 68  | 52  | 38  | 40  | 92  | 52  | 78  | 60  |
| Qwen       | 58  | 65  | 48  | 30  | 36  | 90  | 50  | 75  | 57  |
```

---

## 📁 Archivo a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/chat-intelligence/index.ts` | 3 correcciones en líneas 2353-2360, 2407, 2414, y 2798-2802 |

---

## 🧪 Resultado Esperado

### Antes (estado actual):
```text
Usuario: "Analiza Telefónica"
→ Tabla con 4 modelos (ChatGPT, Perplexity, Gemini, DeepSeek)
→ Extractos solo de 4 modelos
→ Grok y Qwen nunca aparecen citados
```

### Después (con correcciones):
```text
Usuario: "Analiza Telefónica"
→ Tabla con 6 modelos (ChatGPT, Perplexity, Gemini, DeepSeek, Grok, Qwen)
→ Extractos de todos los modelos disponibles
→ "Grok destaca con un RIX de 72 mientras que Qwen..."
```

---

## ⏱ Tiempo Estimado

- **Implementación**: ~5 minutos (cambios localizados)
- **Deploy y test**: ~3 minutos
- **Total**: ~8 minutos

---

## Sección Técnica

### Por qué el Vector Store no era el problema

El archivo `populate-vector-store/index.ts` (líneas 416-421) **sí** indexa correctamente:
```typescript
if (run["respuesta_bruto_grok"]) {
  content += `RESPUESTA COMPLETA GROK:\n${run["respuesta_bruto_grok"]}...`;
}
if (run["respuesta_bruto_qwen"]) {
  content += `RESPUESTA COMPLETA QWEN:\n${run["respuesta_bruto_qwen"]}...`;
}
```

El problema estaba en cómo `chat-intelligence` **consulta y procesa** esos datos:
1. La búsqueda vectorial devuelve documentos que **contienen** textos de Grok/Qwen
2. Pero al construir el contexto estructurado desde `rix_runs_v2`, el código filtraba solo 4 registros
3. Y al buscar keywords en textos brutos, solo buscaba en 4 campos

### Compatibilidad con datos legacy

Los cambios son **retrocompatibles**:
- Si un registro no tiene `respuesta_bruto_grok`, el campo será `null` y se ignorará
- El `slice(0, 6)` funcionará con 4 modelos (solo mostrará 4) o con 6 (mostrará todos)
