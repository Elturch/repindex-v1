
# Plan: Resolver el Conflicto Depth Level vs Role Prompt

## Diagnóstico Confirmado

La respuesta del chat ("nota de prensa de RepIndex") solo generó **1,143 tokens** (~800 palabras) cuando el nivel `exhaustive` debía producir **hasta 4,500 palabras** con tablas detalladas.

| Elemento | Esperado (Exhaustive) | Recibido |
|----------|----------------------|----------|
| Longitud | 4,500 palabras (~6K tokens) | 800 palabras (1.1K tokens) |
| Secciones | 5 secciones con tablas | 6 puntos periodísticos |
| Tablas | Scores por modelo, métricas, evolución | Ninguna |
| Citas | Extractos de los 6 modelos IA | Citas implícitas genéricas |

**Causa raíz**: Conflicto de instrucciones entre el **depth level** (exhaustive = informe largo con tablas) y el **role** (periodista = formato noticia breve).

## Solución Propuesta

Modificar el sistema para que el **depth level siempre tenga prioridad** sobre el role prompt, y que los roles solo modifiquen el *tono* sin reducir la *extensión*.

### Cambio 1: Reforzar el Depth Prompt para Exhaustive

**Archivo**: `supabase/functions/chat-intelligence/index.ts`
**Ubicación**: Función `buildDepthPrompt()` (líneas 1216-1276)

Añadir una instrucción clara de longitud mínima en el prompt exhaustive:

```
## EXTENSIÓN OBLIGATORIA
- Mínimo 2,500 palabras (~15,000 caracteres)
- TODAS las secciones numeradas son OBLIGATORIAS
- Si el usuario pide formato periodístico, MANTÉN la extensión pero adapta el tono
- Una respuesta corta en modo exhaustive es un ERROR
```

### Cambio 2: Modificar la Combinación Role + Depth

**Archivo**: `supabase/functions/chat-intelligence/index.ts`
**Ubicación**: Construcción del system prompt (líneas 4759-4771)

Añadir instrucción de prioridad cuando hay rol + depth exhaustive:

```
Si el usuario ha seleccionado un ROL específico (${roleName}) Y la profundidad es EXHAUSTIVE:
- PRIORIDAD 1: Estructura y extensión del formato exhaustive (4,500 palabras, tablas, secciones)
- PRIORIDAD 2: Tono y enfoque del rol (${roleName})
- El rol adapta el TONO, no reduce la EXTENSIÓN
```

### Cambio 3: Actualizar Rol Periodista

**Archivo**: `src/lib/chatRoles.ts`
**Ubicación**: Rol "periodista" (líneas 128-144)

Añadir clarificación de extensión:

```
NOTA: Si el nivel de profundidad es EXHAUSTIVE o COMPLETE, mantén la extensión 
solicitada. Puedes estructurar el contenido como reportaje de investigación largo
(vs nota de prensa breve) para acomodar la profundidad requerida.
```

## Impacto

| Aspecto | Antes | Después |
|---------|-------|---------|
| Exhaustive + Periodista | ~800 palabras (nota breve) | ~3,000+ palabras (reportaje largo) |
| Exhaustive + CEO | Variable | Mínimo 2,500 palabras garantizado |
| Quick + Periodista | ~500 palabras | ~500 palabras (sin cambio) |

## Archivos a Modificar

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Reforzar extensión mínima en exhaustive | ~1216-1276 |
| `supabase/functions/chat-intelligence/index.ts` | Instrucción de prioridad depth > role | ~4759-4771 |
| `src/lib/chatRoles.ts` | Clarificar que roles no reducen extensión | ~128-144 |

## Alternativa: Mantener Comportamiento Actual

Si el comportamiento actual es intencional (periodista = siempre breve), el sistema está funcionando correctamente. En este caso:

1. Documentar que **el rol tiene prioridad** sobre el depth level para formato
2. Añadir UI que muestre advertencia: "El rol Periodista genera respuestas más breves"
3. Recomendar usar rol "General" para informes exhaustivos completos

## Recomendación

**Implementar el Cambio 1 + Cambio 2**: El depth level debe ser respetado siempre, y los roles solo modifican el tono. Un usuario que selecciona "exhaustive" espera una respuesta larga independientemente del rol.
