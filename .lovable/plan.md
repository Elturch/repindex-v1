
# Fix: Restaurar integridad del Agente Rix — eliminar incentivos a la alucinacion

## Diagnostico raiz

He auditado las 7.273 lineas de `chat-intelligence/index.ts` y he encontrado **3 causas raiz** de las alucinaciones masivas:

### Causa 1: El prompt ORDENA al LLM fabricar contenido de consultoria

- Linea 1447: `"RECUERDA: Este es un informe de consultoría estratégica de máximo rigor"` — instruye al LLM a comportarse como McKinsey
- Lineas 1400-1426 (PILAR 3 "PROSPECTAR"): exige "escenarios Optimista/Base/Riesgo", "3 activaciones inmediatas", "3 tacticas operativas", "3 lineas estrategicas", "Kit de Gestion con borradores ejecutivos" — todo esto OBLIGA al LLM a inventar datos cuando no los tiene
- Lineas 6169-6173 (user prompt): repite la estructura "PILAR 3 PROSPECTAR (3 activaciones + 3 tacticas + 3 lineas estrategicas)"

El LLM lee "escribe escenarios con RIX estimado" y, al no tener datos futuros, los inventa (WACC, CAPEX, VAN, Monte Carlo, etc.)

### Causa 2: La busqueda full-text usa la tabla LEGACY incorrecta

- Lineas 4588-4628: El PASO 2 (busqueda full-text) consulta `rix_runs` (tabla legacy) en vez de `rix_runs_v2`. Esto contradice la decision arquitectonica de usar solo V2 y puede devolver datos incompletos o vacios, dejando al LLM sin contexto real.

### Causa 3: Las reglas anti-fabricacion son parches cosmeticos

Los `FORBIDDEN_PATTERNS` bloquean frases especificas ("GRUPO ALPHA", "47 especialistas") pero el problema es estructural: el prompt EXIGE contenido que solo se puede fabricar.

## Solucion

### Cambio 1 — Reescribir PILAR 3 (eliminar incentivo a fabricar)

Archivo: `supabase/functions/chat-intelligence/index.ts`, funcion `buildDepthPrompt` (lineas ~1396-1451)

Reemplazar el PILAR 3 actual (que pide escenarios inventados, activaciones con plazos, KPIs ficticios) por un PILAR 3 anclado EXCLUSIVAMENTE en datos del contexto:

```text
PILAR 3 -- PROSPECTAR (Que hacer -- SOLO basado en datos reales)

Quien llega a Pilar 3 sabe que acciones tomar el lunes.
TODAS las recomendaciones deben derivarse de datos REALES del contexto.

### Metricas con margen de mejora
Identifica las 3 metricas mas bajas del contexto y explica:
- Puntuacion actual vs promedio sectorial (datos del contexto)
- Que dicen las IAs sobre esa debilidad (citas del texto bruto)
- Accion concreta vinculada a esa metrica especifica

### Fortalezas a proteger
Identifica las 3 metricas mas fuertes y explica:
- Por que son fortaleza (consenso entre modelos)
- Riesgo de deterioro si no se mantiene

### Posicion competitiva accionable
Basado en el ranking del contexto:
- Distancia al lider y al rezagado
- Metricas donde los competidores superan a la empresa

PROHIBIDO en este pilar:
- Inventar escenarios con "RIX estimado" futuro
- Inventar cifras financieras (WACC, CAPEX, VAN, ROI)
- Inventar plazos temporales ficticios ("Q3 2025")
- Inventar indices propietarios
- Usar terminologia de consultoria estrategica (roadmap, sandbox, tokenizacion)
```

### Cambio 2 — Eliminar "informe de consultoria estrategica"

Linea 1447: Cambiar `"RECUERDA: Este es un informe de consultoría estratégica de máximo rigor."` por:
`"RECUERDA: Este es un análisis de DATOS REALES de reputación algorítmica. Solo puedes afirmar lo que los datos del contexto respaldan. Si no hay datos, dilo."`

### Cambio 3 — Corregir busqueda full-text: rix_runs -> rix_runs_v2

Lineas 4588-4628: Cambiar `from("rix_runs")` a `from("rix_runs_v2")` y ajustar los nombres de columnas para que coincidan con el esquema V2 (que incluye `respuesta_bruto_grok` y `respuesta_bruto_qwen`).

### Cambio 4 — Reforzar instrucciones del user prompt

Lineas 6169-6173: Cambiar la estructura obligatoria para eliminar la exigencia de "3 activaciones + 3 tacticas + 3 lineas estrategicas" y sustituirla por:

```text
2. ESTRUCTURA OBLIGATORIA para analisis de empresa:
   RESUMEN EJECUTIVO (titular + 3 KPIs + hallazgos + veredicto)
   -> PILAR 1 DEFINIR (vision de las 6 IAs + 8 metricas + divergencias)
   -> PILAR 2 ANALIZAR (evolucion + gaps + contexto competitivo)
   -> PILAR 3 PROSPECTAR (metricas a mejorar + fortalezas + posicion competitiva)
   -> CIERRE (fuentes y metodologia)
   
   REGLA DE ORO: Cada dato citado debe tener origen en el contexto.
   Si no hay datos para un pilar, omitelo — NO lo rellenes con ficcion.
```

### Cambio 5 — Nuevos FORBIDDEN_PATTERNS para jerga de consultoria

Anadir patrones amplios que detecten el tipo de contenido fabricado:

```javascript
// Consulting jargon fabrication
/pilar\s+\d+\s*[-–—]\s*(?:definir|analizar|prospectar|implementar|ejecutar)/i,
/(?:capex|opex)\s+(?:incremental|estimado).*\d+\s*m€/i,
/van\s+\+?\d+\s*m€/i,
/simulaciones?\s+monte\s+carlo/i,
/copula[\s-]t/i,
/cone\s+of\s+plausibility/i,
/sandbox\s+(?:etico|regulatorio)/i,
/tokenizacion\s+de\s+creditos/i,
/indice\s+(?:propietario|propio)\s+que\s+combina/i,
// Catch-all: financial jargon density
/(?:wacc|ebitda|capex|van|roi|covar)[\s\S]{0,300}(?:wacc|ebitda|capex|van|roi|covar)/i,
```

### Cambio 6 — Refuerzo en system prompt anti-fabricacion

Ampliar la seccion "REGLA CRITICA ANTI-FABRICACION" (linea ~6079) con reglas mas amplias que cubran los patrones observados.

## Archivos modificados

1. `supabase/functions/chat-intelligence/index.ts`:
   - `buildDepthPrompt()`: reescribir PILAR 3
   - Linea 1447: eliminar "consultoria estrategica"
   - PASO 2 full-text search: `rix_runs` -> `rix_runs_v2`
   - User prompt: estructura sin exigencias de contenido fabricable
   - FORBIDDEN_PATTERNS: nuevos patrones de jerga
   - System prompt: refuerzo anti-fabricacion

## Resultado esperado

- El LLM ya no tendra instrucciones que le OBLIGUEN a inventar escenarios, roadmaps ni cifras financieras
- El PILAR 3 estara anclado en datos reales del contexto (metricas bajas, posicion competitiva)
- La busqueda full-text usara la tabla correcta (V2) para encontrar datos reales
- Los patrones de compliance detectaran jerga de consultoria fabricada en streaming
- Si no hay datos suficientes, el LLM dira "No dispongo de datos" en vez de inventar un informe de McKinsey
