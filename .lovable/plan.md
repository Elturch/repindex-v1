

## Plan: Corrección de 4 Bugs de Consistencia del Agente Rix

### Bug #1 (P0 - Crítico): Prompt contradictorio sobre medianas

**Problema**: Las líneas 6530-6537 del system prompt instruyen explícitamente al LLM a usar "RIX mediano: 59 (±5 intermodelo)" como formato de presentación. Esto contradice las reglas anti-mediana añadidas en 6592-6616. El LLM sigue las instrucciones más detalladas (las antiguas).

**Fix**: Reescribir el bloque "INCERTIDUMBRE INTERMODELO" (6530-6539) para eliminar toda referencia a "RIX mediano" y "mediana". Reemplazar con instrucciones que usen los 6 scores individuales + Consenso + Bloque Mayoritario como formato obligatorio. La incertidumbre se expresa mediante el Rango y el Nivel de Consenso, no mediante "±X intermodelo".

### Bug #2 (P0 - Crítico): Nombres de campos JSON con "mediana"

**Problema**: Los datos serializados en el DATAPACK contienen campos llamados `rix_mediano`, `mediana`, `mediana_sectorial`, `rix_mediana`. El LLM ve estos nombres y los reproduce textualmente en sus respuestas.

**Fix**: Renombrar los campos en las funciones de datos:
- `rix_mediano` → `rix_referencia` (en ranking entries, sector snapshot, evolution)
- `mediana` → `rix_referencia` (en ranking entries del buildRankingDataPack)
- `mediana_sectorial` → `referencia_sectorial`
- `rix_mediana` en sector_avg → `rix_referencia`
- `rix_mediano` en DATAPACK serialization (línea 6319) → `rix_referencia`

Esto afecta ~15 puntos en el archivo. Los valores numéricos no cambian (sigue siendo la mediana matemática), solo el nombre del campo para que el LLM no diga "mediana".

### Bug #3 (P1 - Alto): `no_disponible` sin instrucciones en el prompt

**Problema**: Cuando el glossary detecta una entidad `no_disponible` (Abengoa, etc.), añade `[NO_DISPONIBLE: explicación]` a la pregunta pero el system prompt no contiene ninguna instrucción sobre cómo manejar este tag. El LLM ignora el tag o genera una respuesta genérica.

**Fix**: Añadir un bloque condicional en el system prompt (después de línea 6615) que detecte si la pregunta contiene `[NO_DISPONIBLE]` e instruya al LLM a:
1. Explicar que la entidad no está monitorizada actualmente por RepIndex
2. Dar el motivo específico del tag (liquidada, privada sin cobertura, etc.)
3. NO intentar analizar datos inexistentes
4. Sugerir alternativas si las hay

### Bug #4 (P1 - Medio): F2 SQL Expert promueve medianas

**Problema**: La línea 4952 del prompt de F2 dice "Usa medianas (PERCENTILE_CONT(0.5)) en vez de AVG cuando agregues scores entre modelos." Esto instruye al SQL expert a generar queries que calculan medianas, alimentando el problema.

**Fix**: Reescribir la línea 4952 para que el SQL expert genere queries que devuelvan los 6 scores individuales por modelo, sin agregar. Si necesita ordenar, usar consenso (rango inter-modelo) en vez de mediana.

### Orden de ejecución y pruebas

1. **Fix Bug #2** (campos JSON) → Deploy → Test con "Ranking del sector banca" → Verificar que la respuesta NO contiene "mediana"
2. **Fix Bug #1** (prompt contradictorio) → Deploy → Test con "Top 5 IBEX" → Verificar formato de 6 scores individuales
3. **Fix Bug #3** (no_disponible) → Deploy → Test con "Análisis de Abengoa" → Verificar respuesta explicativa
4. **Fix Bug #4** (F2 SQL) → Deploy → Test con "Evolución del sector banca últimas 6 semanas"

### Archivos afectados
- `supabase/functions/chat-intelligence/index.ts` (único archivo, ~20 cambios puntuales)

