
# Estructura Unica "Embudo Narrativo" - Modo Exhaustivo Siempre

## Resumen del cambio

Reemplazar las 3 estructuras actuales (quick/complete/exhaustive) por una unica estructura "Embudo Narrativo" que se aplica siempre en modo exhaustivo. Tambien se actualiza el handler de enrich y el sistema de sales-intelligence para seguir el mismo formato.

## Alcance

Se modifican **2 edge functions**:

1. **`chat-intelligence/index.ts`** (principal)
2. **`sales-intelligence-chat/index.ts`** (agente comercial)

---

## Cambios en `chat-intelligence/index.ts`

### 1. Funcion `buildDepthPrompt` (lineas 1157-1296)

Eliminar las 3 variantes (quick/complete/exhaustive) y reemplazar por una unica estructura que siempre devuelve el Embudo Narrativo completo, independientemente del parametro `depthLevel`:

```
RESUMEN EJECUTIVO
  - Titular-diagnostico
  - 3 KPIs con delta
  - 3 Hallazgos
  - 3 Recomendaciones (accion + responsable + KPI)
  - Veredicto
  - 5 Mensajes para la Direccion (bloque diferenciado)

PILAR 1 -- DEFINIR (Que dice el dato)
  - Vision de las 6 IAs (tarjetas ordenadas de mayor a menor)
  - Las 8 metricas (puntuacion + color + parrafo explicativo)
  - Divergencia entre modelos

PILAR 2 -- ANALIZAR (Que significan)
  - Evolucion y comparativas (tablas con deltas)
  - Amenazas y riesgos (impacto en pts + metricas + recomendacion)
  - Gaps: Realidad vs Percepcion IA
  - Contexto competitivo (ranking)

PILAR 3 -- PROSPECTAR (Que hacer)
  - 3 Activaciones inmediatas (0-7 dias)
  - 3 Tacticas operativas (2-8 semanas)
  - 3 Lineas estrategicas (trimestre)
  - Tabla de escenarios (optimista / base / riesgo)

CIERRE
  - Kit de gestion / borradores de activaciones inmediatas

Fuentes y metodologia
```

### 2. Formato de recomendaciones en Pilar 3

Cada activacion/tactica/linea estrategica lleva 6 campos obligatorios inyectados en el prompt:

```
# N -- LINEA TITULAR: verbo de accion + tactica concreta

Que: Entregables, canales, etiquetas, complementos.
Por que: Datos del informe (%, puntuaciones) + mecanismo causal IA.
Responsable: Area(s) implicada(s).
KPI: Nombre descriptivo de metrica + umbral + plazo.
Impacto IA: Modelo -- Metrica (flecha arriba uno o dos niveles, uno por linea).
```

### 3. Bloque de estructura en el system prompt principal (lineas ~4555-4588)

Reemplazar la seccion "ESTRUCTURA DE INFORME EJECUTIVO" actual (secciones 1-5 genericas) por el mismo Embudo Narrativo, para que tanto `buildDepthPrompt` como el system prompt base sean coherentes.

### 4. Handler `handleEnrichRequest` (lineas 2217-2391)

Reemplazar la estructura actual del enrich (secciones 1-7 genericas) por el Embudo Narrativo. El enrich sigue siendo una expansion, pero ahora la estructura de salida es identica: Resumen Ejecutivo, Pilar 1 DEFINIR, Pilar 2 ANALIZAR, Pilar 3 PROSPECTAR, Cierre.

### 5. Regla de prioridad de roles (lineas ~4917-4931)

Simplificar: ya no hay condicionales por depth level. El rol siempre modifica el angulo/tono pero NUNCA la estructura ni la extension. Se mantiene el minimo de 2.500 palabras.

### 6. Parametros de data fetching

Como todo es exhaustivo, los parametros que antes variaban por depth se fijan al maximo:
- `vectorMatchCount`: siempre 30
- `competitorLimit`: siempre 8
- `maxRixRecords`: siempre 10.000
- Periodos historicos: siempre 4
- Noticias corporativas: siempre 5
- Regresion estadistica: siempre activa

Se mantiene el parametro `depthLevel` en la interfaz por retrocompatibilidad, pero internamente siempre se trata como exhaustivo.

---

## Cambios en `sales-intelligence-chat/index.ts`

Adaptar el prompt de ventas para que siga la misma estructura de Embudo Narrativo pero con el angulo comercial:

- Resumen Ejecutivo con angulo de venta (titular-diagnostico orientado a urgencia comercial)
- Pilar 1 DEFINIR: datos crudos traducidos a impacto de negocio
- Pilar 2 ANALIZAR: comparativas con competidores, riesgos invisibles
- Pilar 3 PROSPECTAR: por que RepIndex resuelve cada problema detectado
- Cierre: Preguntas "imposibles" (ya existentes) + call to action

Se mantiene el lenguaje resultadista y la prohibicion de acronimos tecnicos del prompt actual.

---

## Lo que NO cambia

- Pipeline SQL-to-Narrative (fases de generacion SQL + ejecucion + razonamiento)
- Sistema de Vector Store y Graph RAG
- Protocolo anti-alucinacion (cero inventos)
- Glosario canonico de metricas (NVM, DRM, SIM, etc.)
- Sistema de streaming SSE
- Logica de deteccion de empresas y competidores
- Boletin ejecutivo (tiene su propio prompt especializado)
- Regresion estadistica y correlacion de precios

---

## Seccion tecnica

### Archivos modificados
| Archivo | Tipo de cambio |
|---------|---------------|
| `supabase/functions/chat-intelligence/index.ts` | Reescritura de `buildDepthPrompt`, seccion de estructura en system prompt, `handleEnrichRequest`, fijacion de parametros de data fetching |
| `supabase/functions/sales-intelligence-chat/index.ts` | Reestructuracion del `SALES_SYSTEM_PROMPT` al formato Embudo Narrativo |

### Riesgos y mitigaciones
- **Respuestas mas largas en modo "quick"**: Al forzar exhaustivo siempre, las respuestas seran mas largas y lentas. Dado que el usuario lo ha solicitado explicitamente ("todo en exhaustivo"), esto es aceptable.
- **Coste de tokens**: Aumentara el consumo de tokens al usar siempre modelos de razonamiento con max tokens altos. Se mantiene el logging de costes para monitorizar.
- **Compliance del modelo**: Los LLMs siguen la estructura con ~85-90% de fidelidad. El formato de 6 campos en recomendaciones es lo suficientemente estructurado para que lo respeten de forma consistente.
