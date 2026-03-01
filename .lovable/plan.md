

# Fix: Restaurar integridad del Agente Rix -- Pipeline multi-consulta SQL + eliminacion de incentivos a fabricar

## Diagnostico confirmado

Tras auditar las 7.301 lineas de `chat-intelligence/index.ts` y el frontend, las alucinaciones persisten por **4 causas estructurales**:

### Causa 1: Auto-continuacion ciega por `MIN_CORPORATE_CHARS = 18000`
- Lineas 6405-6444 (streaming) y 6659-6686 (non-streaming): si la respuesta tiene menos de 18.000 chars (~4.500 palabras), se activa `too_short` y el sistema lanza continuaciones usando SOLO los ultimos 500 chars como contexto.
- Sin reinyectar datos SQL ni evidencia, el LLM rellena con ficcion de consultoria hasta alcanzar el umbral.
- Esto explica la repeticion infinita de "PILAR 1 -- DEFI..." que el usuario reporta.

### Causa 2: Frontend fuerza `exhaustive` siempre
- `ChatContext.tsx` linea 265: `useState<DepthLevel>('exhaustive')`
- Linea 338: `configureSession` fuerza `'exhaustive'` hardcodeado
- Combinado con la exigencia de 4.500-5.400 palabras (linea 6204), obliga al LLM a generar volumen masivo, priorizando extension sobre precision.

### Causa 3: Full-text search demasiado permisivo
- Linea 4584: keywords de 4+ chars se buscan con `ILIKE %keyword%` en 8 columnas de texto bruto, con `limit(5000)` por keyword.
- Keywords como "gestion", "energia", "digital" devuelven miles de resultados irrelevantes.
- El contexto resultante (~89k chars segun logs) ahoga la senal real con ruido.

### Causa 4: Deteccion de empresas con falsos positivos
- Linea 3856: palabras de >4 chars del nombre de empresa se buscan con `includes()` en la pregunta.
- "Energia" (de "Acciona Energia") puede matchear cualquier pregunta sobre energia.
- No hay score de confianza ni deduplicacion por relevancia.

## Plan de implementacion (5 fases secuenciales)

---

### Fase 1 -- Desactivar el ciclo de auto-continuacion `too_short` (HOTFIX CRITICO)

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

**Que cambiar:**
1. **Eliminar la condicion `too_short`** de los bucles de continuacion (lineas 6408, 6410-6411 streaming; 6662, 6664 non-streaming).
   - Mantener continuaciones SOLO para `finish_reason === "length"` (truncacion tecnica real) y `forbiddenDetected`.
   - Eliminar `MIN_CORPORATE_CHARS` y `checkTooShort()`.

2. **Cuando haya continuacion por truncacion real**, reinyectar contexto:
   - Incluir la pregunta original del usuario en el continuation prompt.
   - Incluir un resumen del DataPack SQL (scores, metricas clave) en vez de solo 500 chars de texto previo.
   - Mantener la prohibicion de repetir contenido.

**Resultado:** Se eliminan los bucles infinitos de "PILAR 1 -- DEFI..." y la fabricacion por relleno.

---

### Fase 2 -- Pipeline multi-consulta SQL estructurado (DataPack)

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

**Concepto:** Antes de construir el contexto narrativo, ejecutar un bloque de consultas SQL especificas que produzcan un `DataPack` estructurado. El LLM recibe PRIMERO los datos tabulares y DESPUES los textos narrativos como evidencia cualitativa.

**Consultas SQL del DataPack (usando fetchUnifiedRixData existente):**

1. **Query A -- Snapshot canonico de la empresa** (ya existe en PASO 3, linea 4660):
   - 6 modelos x ultima semana: RIX + 8 metricas + categorias
   - Se mantiene tal cual, pero se formatea como tabla resumen al inicio del contexto

2. **Query B -- Promedios sectoriales** (NUEVA):
   - Calcular promedio RIX y por metrica del sector/subsector de la empresa para la misma semana
   - Usar `companiesCache` para filtrar por `sector_category` y/o `ibex_family_code`
   - Comparar empresa vs media sectorial en cada dimension

3. **Query C -- Ranking competitivo** (parcialmente existe en 6.4, mejorar):
   - Top 5 y bottom 5 del sector
   - Distancia en puntos al lider y al rezagado
   - Solo competidores verificados (COMPITE_CON) si los hay

4. **Query D -- Evolucion temporal** (existe en PASO 3 para multi-semana, sistematizar):
   - Ultimas 4 semanas canonicas (domingos)
   - Delta semana a semana por modelo y agregado
   - Tendencia (subiendo/bajando/estable)

5. **Query E -- Divergencia inter-modelo** (NUEVA, derivada de datos ya cargados):
   - Calcular desviacion estandar entre los 6 modelos
   - Identificar modelo outlier (mas alto y mas bajo)
   - Clasificar divergencia: baja (<8 pts), media (8-15), alta (>15)

**Formato de inyeccion:** El DataPack se inyecta como un bloque JSON compacto al inicio del contexto con la instruccion:

```
DATAPACK SQL (FUENTE DE VERDAD):
Estos son los datos reales de la base de datos. TODA cifra en tu respuesta
debe coincidir con estos datos. Si un dato no esta aqui, NO lo inventes.
```

**Los textos narrativos brutos se mantienen** (respuesta_bruto_grok, etc.) pero como "evidencia cualitativa" DESPUES del DataPack, no como fuente primaria de cifras.

---

### Fase 3 -- Mejorar deteccion de empresas (anti falsos positivos)

**Archivo:** `supabase/functions/chat-intelligence/index.ts`, funcion `detectCompaniesInQuestion` (linea 3810)

**Cambios:**
1. **Score de confianza** por match:
   - Full name match: score 1.0
   - Ticker match (word boundary): score 0.9
   - include_terms match: score 0.8
   - Partial name word match: score 0.5 (actualmente 1.0)

2. **Umbral minimo**: Solo considerar empresas con score >= 0.7 para activar modo corporativo.

3. **Lista ampliada de palabras comunes a excluir** del partial match:
   - Anadir: "energia", "capital", "inmobiliaria", "servicios", "internacional", "industria", "global", "digital", "comunicacion", "financiera", "renovable", "logistica", "gestion", "tecnologia", "infraestructuras"

4. **Longitud minima de palabra significativa**: Subir de 4 a 6 chars para partial match, reduciendo falsos positivos.

---

### Fase 4 -- Reducir contaminacion del full-text search

**Archivo:** `supabase/functions/chat-intelligence/index.ts`, PASO 2 (linea 4578)

**Cambios:**
1. **Filtrar keywords mas agresivamente:**
   - Subir longitud minima de keyword de 4 a 6 chars
   - Anadir lista negra de keywords genericos: "analisis", "empresa", "sector", "datos", "modelo", "gestion", "mercado", "digital", "informe"

2. **Limitar resultados por keyword:** De `limit(5000)` a `limit(50)` cuando hay empresa detectada (ya tenemos datos especificos en PASO 3).

3. **Priorizar empresa detectada:** Si hay empresa, buscar keywords SOLO en registros de esa empresa y sus competidores, no en toda la base.

4. **Limitar extractos de texto:** De 8 extractos de 750 chars a 5 extractos de 400 chars, reduciendo contexto ruidoso.

---

### Fase 5 -- Ajustar frontend y profundidad por defecto

**Archivo:** `src/contexts/ChatContext.tsx`

**Cambios:**
1. Linea 265: Cambiar default de `'exhaustive'` a `'complete'`
2. Linea 338: Eliminar el hardcode `'exhaustive'` en `configureSession`, dejando que el usuario elija
3. Mantener `exhaustive` como opcion disponible pero no forzada

**Archivo:** `supabase/functions/chat-intelligence/index.ts`

1. Linea 6204: Cambiar "rango objetivo 4.500-5.400 palabras" por "rango objetivo 2.500-4.000 palabras. Prioriza precision y trazabilidad sobre volumen."
2. Linea 1452: Cambiar "minimo 2.500 palabras" a "minimo 1.500 palabras" para no forzar relleno.

---

## Resumen de archivos modificados

1. **`supabase/functions/chat-intelligence/index.ts`** (cambios principales):
   - Eliminar `MIN_CORPORATE_CHARS` y bucle `too_short` (Fase 1)
   - Anadir bloque DataPack SQL estructurado antes del contexto narrativo (Fase 2)
   - Mejorar `detectCompaniesInQuestion` con scoring y lista negra ampliada (Fase 3)
   - Reducir agresividad del full-text search (Fase 4)
   - Reducir exigencia de extension en prompts (Fase 5)

2. **`src/contexts/ChatContext.tsx`** (Fase 5):
   - Default de `'exhaustive'` a `'complete'`
   - Eliminar hardcode de exhaustive en `configureSession`

## Mitigacion de riesgos

| Riesgo | Mitigacion |
|--------|-----------|
| Perder riqueza narrativa | Los textos brutos se mantienen como evidencia cualitativa, solo se reordena la prioridad (datos primero, narrativa despues) |
| Falsa deteccion de empresa reducida en exceso | Score de confianza gradual (0.5-1.0) en vez de binario; umbral configurable |
| Informes demasiado cortos sin `too_short` | El LLM sigue teniendo instruccion de 2.500-4.000 palabras; solo se elimina la fuerza bruta de continuacion ciega |
| Keywords utiles filtrados | Solo se filtran genericos; keywords especificos de la pregunta se mantienen |

## Criterios de aceptacion

1. No aparecen repeticiones de "PILAR 1 -- DEFI..." en loop
2. No aparecen cifras financieras fabricadas (WACC, CAPEX, etc.)
3. Toda cifra en la respuesta es trazable al DataPack SQL
4. El agente dice "No dispongo de datos" cuando no hay datos reales
5. Logs sin bucles de `Auto-continuation reason: too_short`
6. Preguntas genericas ("que es reputacion?") no activan modo corporativo por falso positivo

