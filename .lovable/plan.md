

## Diagnóstico real: Por qué se rompió con el barrido del 12 de abril

### Los datos lo demuestran

Comparación de scores para las mismas empresas entre las dos semanas:

```text
                    5 abril (funcionaba)              12 abril (roto)
Empresa   ChatGPT Deep  Gemini Grok  Perp  Qwen    ChatGPT Deep  Gemini Grok  Perp  Qwen
─────────────────────────────────────────────────────────────────────────────────────────
BBVA        42     39    69     68    66    66        71     69    72     67    53    66
ITX         47     63    59     67    49    63        53     66    83     62    57    74
CABK        41     67    63     64    50    71        64     56    72     73    68    79
TEF         55     36    62     63    47    67        70     51    53     75    43    76
```

**El 5 de abril**: los scores estaban comprimidos (rangos de 20-30 puntos), las medianas eran estables y "parecidas" a lo que mostraba cualquier modelo individual. La instrucción "ordena por mediana" producía un ranking que no chocaba visualmente con el Dashboard.

**El 12 de abril**: los scores son más altos PERO mucho más dispersos. Ejemplos:
- ITX: Gemini=83 vs ChatGPT=53 → rango de 30 puntos
- TEF: Qwen=76 vs Perplexity=43 → rango de 33 puntos
- CABK: Qwen=79 vs Deepseek=56 → rango de 23 puntos

### La causa raíz real

**Los bugs siempre estuvieron ahí. El barrido del 12 de abril los hizo visibles.**

La dispersión de scores del 12 de abril es significativamente mayor que la del 5 de abril. Cuando la dispersión es baja, la "mediana" se parece a cualquier score individual → Dashboard y Agente parecen coincidir. Cuando la dispersión es alta, la mediana diverge enormemente de los scores individuales → el usuario ve un 83 (Gemini-ITX) en el Dashboard pero el Agente le dice 64 (mediana).

No fue un cambio de código. Fue un cambio en la distribución estadística de los datos que expuso la fragilidad del diseño original basado en medianas.

### Por qué esto confirma que el plan de consenso/disenso es urgente

El sistema actual es inherentemente frágil: funciona cuando los modelos están de acuerdo y se rompe cuando divergen. Precisamente cuando la divergencia es mayor es cuando el análisis de consenso/disenso tiene más valor informativo.

### Plan de implementación (sin cambios, los 5 bugs siguen siendo los correctos)

**Archivo: `supabase/functions/chat-intelligence/index.ts`**

1. **Línea 6591** — Eliminar "Ordena por mediana". Reemplazar con: ordenar por consenso (alto→bajo) y score del bloque mayoritario. Mostrar las 6 puntuaciones individuales.

2. **Línea 6601** — Eliminar "RIX Score" singular. Reemplazar con tabla de 6 scores + Rango + Consenso + Bloque Mayoritario.

3. **Líneas 2994-3041** — Expandir scope del DataPack: snapshot y raw_texts de TODAS las empresas del ranking (no solo el líder). Filtrar `_rawRunsForSources` al scope activo.

4. **Líneas 10510-10513** — Corregir prioridad temporal: usar siempre `report_context.date_from/to` reales, no los solicitados por el usuario.

5. **`src/components/ui/markdown-message.tsx`** — En el export HTML, priorizar `reportContext.date_from/date_to`.

### Resultado esperado

El agente será robusto ante cambios de distribución: cuando los modelos divergen mucho (como el 12 de abril), el informe lo mostrará como información valiosa (disenso), no como un error. Dashboard y Agente mostrarán los mismos 6 scores base.

