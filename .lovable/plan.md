

# Plan: Corregir el ranking individual para que incluya TODOS los modelos

## Diagnostico confirmado con datos reales

El Agente Rix carga **1996 registros** correctamente, pero al construir el contexto para el LLM, el ranking individual se ordena por score DESC **mezclando todos los modelos** y se trunca a 150 registros (linea 4331).

Resultado real de la semana actual (2026-02-01):
- Qwen: 57 de los 150 slots (scores altos ~73-80)
- Gemini: 44 slots
- Grok: 27 slots
- Perplexity: 12 slots
- DeepSeek: 7 slots
- **ChatGPT: SOLO 3 slots** (scores bajos ~59-71)

Cuando un usuario pregunta "ranking del IBEX 35 segun ChatGPT", el LLM solo tiene 3 registros de ChatGPT en su contexto. Por eso dice "no dispongo de ese dato" para Santander, BBVA, Inditex, etc. **No es una alucinacion — es que literalmente no tiene los datos.**

## Solucion: Ranking agrupado por modelo

En lugar de un unico ranking mezclado truncado a 150, crear un ranking **por modelo de IA** donde cada modelo muestra sus top N empresas. Asi cada modelo queda representado equitativamente.

### Cambio en `supabase/functions/chat-intelligence/index.ts`

Reemplazar el bloque del ranking individual (lineas ~4323-4337) con un ranking agrupado por modelo:

```text
Antes (linea 4327-4337):
  context += "| # | Empresa | Ticker | RIX | Modelo IA |"
  rankedRecords.slice(0, 150).forEach(...)  // Mezcla todos los modelos, ChatGPT desaparece

Despues:
  // Agrupar por modelo de IA
  const recordsByModel = new Map();
  rankedRecords.forEach(record => {
    if (!recordsByModel.has(record.model)) {
      recordsByModel.set(record.model, []);
    }
    recordsByModel.get(record.model).push(record);
  });

  // Mostrar ranking POR CADA MODELO (top 40 empresas de cada uno)
  for (const [model, records] of recordsByModel) {
    context += "\n📊 RANKING " + model.toUpperCase() + ":\n";
    context += "| # | Empresa | Ticker | RIX |\n";
    context += "|---|---------|--------|-----|\n";
    records.slice(0, 40).forEach((record, idx) => {
      context += "| " + (idx+1) + " | " + record.company + " | " + record.ticker + " | " + record.rixScore + " |\n";
    });
  }
```

Con 6 modelos x 40 empresas = 240 filas (vs 150 mezcladas), pero ahora **cada modelo tiene su ranking completo** de las top 40. Esto cubre todas las empresas del IBEX 35 en cada modelo.

### Impacto en el tamano del contexto

- Antes: 150 filas mezcladas = ~6.000 chars
- Despues: 240 filas agrupadas = ~9.600 chars (+3.600 chars, un incremento menor)

El contexto total sube ~2% (de ~200K a ~204K chars). Marginal.

### Que mas se toca

Nada mas. El filtro de sales_memento y la regla anti-alucinacion del paso anterior ya estan aplicados. Este cambio solo afecta a como se presentan los datos al LLM, no a que datos se cargan.

## Archivo a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/chat-intelligence/index.ts` | Reemplazar ranking individual mezclado (lineas 4323-4337) por ranking agrupado por modelo de IA, top 40 empresas por modelo |

## Resultado esperado

Cuando alguien pregunte "ranking ChatGPT ultima semana":
- Antes: El LLM solo ve 3 empresas de ChatGPT, dice "no tengo datos" del resto
- Despues: El LLM ve las 40 top empresas de ChatGPT con sus scores exactos, responde con el ranking completo

