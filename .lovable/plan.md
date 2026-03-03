

# Plan: Eliminar referencias al DataPack y mejorar la consistencia narrativa

## Problemas detectados en el informe generado

1. **Referencias internas filtradas**: El informe incluye líneas como `(Fuentes: DATAPACK.ranking, DATAPACK.sector_avg, HECHOS.temas_clave)` que son artefactos internos del pipeline. El usuario no sabe qué es un "DATAPACK" ni "HECHOS".

2. **Estructura de bullets dispersa**: El informe salta de empresa en empresa con bullets sueltos sin hilo conductor. Falta un relato que conecte las señales en una narrativa coherente (contexto → hallazgo → implicación).

## Cambios en `supabase/functions/chat-intelligence/index.ts`

### Cambio 1: Prohibir referencias internas en el prompt E5

En el bloque de reglas del `systemPrompt` (líneas ~2604-2728), añadir una regla explícita:

```
REGLA ANTI-FILTRACIÓN INTERNA (PRIORIDAD MÁXIMA):
• NUNCA menciones "DATAPACK", "HECHOS", "ANALISIS", "E1", "E2", "E3", "E4", "E5", "E6", "DataPack", "snapshot", "pack", "classifier" ni ningún nombre de componente interno del pipeline.
• NUNCA escribas líneas como "(Fuentes: DATAPACK.ranking...)" ni "(Fuentes: HECHOS.temas_clave)".
• El usuario NO sabe que existen estos bloques internos. Para él, los datos vienen de "las seis IAs analizadas" o "el análisis RepIndex de esta semana".
• Si necesitas citar la fuente de un dato, di: "Según el análisis de [nombre de IA]" o "Los datos de esta semana muestran...".
```

### Cambio 2: Regla de consistencia narrativa en el prompt E5

Añadir instrucciones de estructura narrativa que sustituyan los bullets dispersos por un relato conectado:

```
CONSISTENCIA NARRATIVA (OBLIGATORIO):
• Cada sección debe tener un HILO CONDUCTOR claro: arranca con una afirmación de contexto, desarrolla con evidencia y cierra con una implicación.
• NO listes empresas como bullets sueltos. Agrupa por SEÑAL TEMÁTICA: "Tres compañías del sector financiero comparten una señal positiva..." es mejor que tres bullets separados.
• Conecta las secciones entre sí: el cierre de una sección debe anticipar la siguiente. Ejemplo: "Esta fortaleza en banca contrasta con la fragilidad del sector energético, que analizamos a continuación."
• Prioriza la PANORÁMICA antes del DETALLE: primero el estado general del índice, después los casos destacados.
• Las empresas que solo aparecen para rellenar NO deben mencionarse. Mejor profundizar en 5-6 casos con contexto que listar 15 con un bullet cada uno.
• Cada párrafo debe responder a "¿y qué significa esto?" — nunca dejes un dato sin interpretación.
```

### Cambio 3: Limpiar el userPrompt de etiquetas internas visibles

En el `userPrompt` (líneas 2737-2749), las etiquetas `═══ DATAPACK (E2 — FUENTE DE VERDAD) ═══` son útiles para el LLM pero el problema es que el LLM las copia al output. Añadir al final del userPrompt una línea de refuerzo:

```
RECORDATORIO FINAL: Las etiquetas DATAPACK, HECHOS, ANALISIS son bloques internos para tu consumo. NUNCA las menciones ni las cites en tu respuesta. El usuario solo debe ver "según las IAs", "los datos de esta semana" o "el análisis RepIndex".
```

### Cambio 4: Filtro de post-procesamiento en backend

Después de recibir la respuesta del E5 y antes de pasarla al E6 (maquetador), añadir un regex de limpieza que elimine cualquier referencia interna que se haya filtrado:

```typescript
// Limpiar referencias internas filtradas
const internalRefPattern = /\(?\s*(?:Fuentes?|Sources?)\s*:\s*(?:DATAPACK|HECHOS|ANALISIS|DataPack|E[1-6])[^)]*\)?/gi;
cleanedMarkdown = rawMarkdown.replace(internalRefPattern, '');
// También limpiar menciones sueltas
const internalTerms = /\b(DATAPACK|DataPack|HECHOS|ANALISIS)\b\.?\w*/g;
cleanedMarkdown = cleanedMarkdown.replace(internalTerms, 'los datos de esta semana');
```

## Resumen

| Cambio | Qué resuelve |
|--------|-------------|
| Regla anti-filtración | Elimina "DATAPACK", "HECHOS" del output |
| Regla de consistencia narrativa | Transforma bullets dispersos en relato conectado |
| Refuerzo en userPrompt | Doble barrera contra filtraciones |
| Regex post-procesamiento | Barrera final: limpia lo que el LLM haya dejado pasar |

