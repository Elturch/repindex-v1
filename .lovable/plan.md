

# Plan: Restaurar la precision del Agente Rix y unificar Rix Press

## Diagnostico confirmado

He revisado todo el codigo en detalle. Hay DOS problemas independientes pero acumulativos:

### Problema 1: El Agente Rix estandar tiene contaminacion por sales_memento

En la linea 4259 de `chat-intelligence/index.ts`, los 200 documentos vectoriales se inyectan al contexto **sin filtrar** los `sales_memento` (narrativas comerciales inventadas para crear urgencia de venta). Estos documentos contienen frases como "esta empresa necesita urgentemente..." que el LLM toma como datos reales.

Ironicamente, el handler de Press (linea 5825) SI los filtra correctamente.

**Fix**: Anadir `.filter(doc => doc.metadata?.source_type !== 'sales_memento')` antes de inyectar los vectorDocs al contexto del agente estandar.

### Problema 2: El Rix Press es un sistema paralelo degradado

El `handlePressMode` (linea 5793) y el `rix-press-agent` independiente son atajos que acceden a solo el 20% de los datos disponibles:
- Solo 500 registros RIX (vs ~2.000 del agente estandar)
- Solo 20 documentos por text search basico (vs 200 por embeddings semanticos)  
- Sin analisis de regresion, sin grafo de conocimiento, sin mementos corporativos
- Gemini directo sin las reglas anti-alucinacion detalladas del agente estandar

## Solucion en 4 pasos

### Paso 1: Filtrar sales_memento en el agente estandar

En `supabase/functions/chat-intelligence/index.ts`, linea 4257-4264:

```text
Antes:
  vectorDocs.forEach((doc: any, idx: number) => {

Despues:
  const cleanVectorDocs = (vectorDocs || []).filter(
    (doc: any) => doc.metadata?.source_type !== 'sales_memento'
  );
  cleanVectorDocs.forEach((doc: any, idx: number) => {
```

Actualizar el header del bloque para reflejar el conteo filtrado. **No se reduce la cantidad de documentos** — solo se eliminan los que son narrativas comerciales.

### Paso 2: Reforzar regla anti-alucinacion numerica en el system prompt

Anadir al inicio del system prompt del agente estandar (antes de las otras instrucciones, alrededor de linea 4667):

```text
REGLA DE MAXIMA PRIORIDAD — PRECISION NUMERICA ABSOLUTA:

- Cada score RIX, porcentaje o cifra que cites DEBE existir LITERALMENTE 
  en los datos proporcionados.
- Si no encuentras el dato exacto, escribe: "No dispongo de ese dato 
  en el contexto actual."
- PROHIBIDO redondear, estimar o inferir cifras. Si el dato dice 47.3, 
  cita 47.3 — no 47 ni "cerca de 50".
- Cuando cites un score, INDICA SIEMPRE el modelo de IA y el periodo. 
  Ejemplo: "RIX 64 (ChatGPT, 3-8 Feb 2026)".
- Si no hay datos suficientes para una respuesta precisa, dilo 
  explicitamente en vez de construir una respuesta con datos parciales.
```

### Paso 3: Eliminar el edge function rix-press-agent

Borrar `supabase/functions/rix-press-agent/index.ts` y eliminarlo del despliegue. Este codigo es el que mas errores produce — usa Gemini directo con temperatura 0.7 y datos minimos.

### Paso 4: Redirigir Rix Press al motor estandar de chat-intelligence

**En `src/contexts/ChatContext.tsx`** (linea 469): Cambiar la ruta para que las peticiones de press vayan a `chat-intelligence` en vez de `rix-press-agent`. Enviar el rol `periodista` (que ya existe en `chatRoles.ts` linea 128-149) con profundidad `exhaustive`:

```text
Antes:
  const edgeFunctionName = options?.pressMode ? 'rix-press-agent' : 'chat-intelligence';

Despues:
  const edgeFunctionName = 'chat-intelligence';  // Siempre usa el motor completo
```

Y en el `requestBody`, cuando `pressMode` es true, enviar `roleId: 'periodista'` y `depthLevel: 'exhaustive'` para que use el mismo pipeline completo con tono periodistico.

**En `supabase/functions/chat-intelligence/index.ts`**: Eliminar el bloque `handlePressMode` (lineas 5742-5990) y el bloque de routing de press (lineas 2030-2083). Las peticiones de prensa ya se procesaran como cualquier otra consulta con el rol `periodista`.

## Que NO se toca

- Los 200 documentos vectoriales se mantienen (solo se filtran los sales_memento)
- El ranking individual completo se mantiene (cada empresa debe aparecer)
- Los textos brutos (evidencias de IA) se mantienen intactos
- El modelo o3 con fallback a Gemini se mantiene
- El analisis de regresion se mantiene
- El grafo de conocimiento se mantiene

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/chat-intelligence/index.ts` | Filtrar sales_memento en seccion 6.2; reforzar system prompt anti-alucinacion; eliminar handlePressMode y PRESS_SYSTEM_PROMPT (~250 lineas); eliminar routing de press (~50 lineas) |
| `supabase/functions/rix-press-agent/index.ts` | ELIMINAR completamente |
| `src/contexts/ChatContext.tsx` | Redirigir press al motor estandar con roleId 'periodista' y depthLevel 'exhaustive' |

## Resultado esperado

- El Agente Rix estandar deja de contaminarse con narrativas comerciales
- Las reglas anti-alucinacion reforzadas reducen la invencion de cifras
- El modo Rix Press usa exactamente los mismos 2.000 registros, 200 docs vectoriales, regresion y grafo que el agente estandar
- El boton de Rix Press sigue funcionando igual para el usuario, solo cambia el motor interno
- Se eliminan ~300 lineas de codigo muerto/duplicado

