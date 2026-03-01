

# Fix: Meta-comentarios y alucinaciones de contenido ficticio

## Problema 1 — Meta-comentario no capturado

El texto `[Elaboración en progreso: este informe supera el límite de generación de esta sesión. Se ofrecerá en la próxima respuesta inmediatamente.]` no es detectado por ningun patron existente. Es una variante nueva de la familia "limite/truncacion".

## Problema 2 — Alucinacion de contenido ficticio

El LLM inventa un informe completo sobre "GRUPO ALPHA", con "47 especialistas", "9,8 TB de datos brutos", "112 entrevistas cualitativas". Esto ocurre cuando el LLM no tiene suficiente contexto real y decide fabricar un informe generico de consultoria en vez de usar los datos RIX del contexto.

---

## Solucion

### Cambio 1 — Nuevos FORBIDDEN_PATTERNS (backend)

Archivo: `supabase/functions/chat-intelligence/index.ts`

Anadir 6 nuevos patrones a `FORBIDDEN_PATTERNS` (linea ~677):

```
// Meta-commentary: "elaboración en progreso", "próxima respuesta"
/elaboracion\s+en\s+progreso/,
/se\s+ofrecera\s+en\s+la\s+proxima\s+respuesta/,
/limite\s+de\s+generacion\s+de\s+esta\s+sesion/,
/informe\s+supera\s+el\s+limite\s+de\s+generacion/,
// Content fabrication markers
/para\s+preservar\s+la\s+confidencialidad.*denominaremos/,
/equipo\s+interfuncional\s+de\s+\d+\s+especialistas/,
```

### Cambio 2 — Ampliar stripLlmMetaCommentary (frontend)

Archivo: `src/components/ui/markdown-message.tsx`

Anadir nuevos patrones de limpieza en `stripLlmMetaCommentary` (linea ~225):

```typescript
// "Elaboración en progreso" variant
cleaned = cleaned.replace(/^\s*\[.*?(?:elaboraci[oó]n\s+en\s+progreso|l[ií]mite\s+de\s+generaci[oó]n|pr[oó]xima\s+respuesta).*?\]\s*/is, '');
```

### Cambio 3 — Regla anti-fabricacion en system prompt (backend)

Archivo: `supabase/functions/chat-intelligence/index.ts`

Anadir un nuevo bloque justo despues de la seccion "REGLA CRITICA ANTI-TRUNCACION" (linea ~6066):

```
REGLA CRITICA ANTI-FABRICACION DE CONTENIDO (PRIORIDAD MAXIMA):
- NUNCA inventes empresas ficticias ("GRUPO ALPHA", "Empresa X", "Acme Corp")
- NUNCA fabriques datos de equipos ("47 especialistas", "112 entrevistas")
- NUNCA inventes volumenes de datos ("9,8 TB de datos brutos", "74.000 items")
- NUNCA escribas un informe generico de consultoria cuando NO tienes datos RIX
- Si NO hay datos en el contexto para la empresa preguntada, DILO CLARAMENTE:
  "No dispongo de datos RIX para esta empresa. Solo puedo analizar las ~175
  empresas del censo RepIndex."
- Tu trabajo es analizar datos REALES del contexto, no crear ficcion corporativa.
- Si la pregunta es generica (sin empresa especifica), responde sobre metodologia
  RepIndex, NO inventes un caso de estudio ficticio.
- JAMAS uses frases como "para preservar la confidencialidad del cliente"
  ni "denominaremos a la empresa como..." — eso es FICCION, no analisis.
```

### Cambio 4 — Patron de compliance para "proxima respuesta"

Anadir a la seccion anti-truncacion del system prompt (linea ~6053):

```
- NUNCA digas "elaboración en progreso" ni "se ofrecerá en la próxima respuesta"
- NUNCA digas "este informe supera el límite de generación de esta sesión"
- No existe ningun "limite de generacion de sesion". Escribe el informe completo.
```

## Archivos modificados

1. `supabase/functions/chat-intelligence/index.ts` — forbidden patterns + system prompt
2. `src/components/ui/markdown-message.tsx` — strip de meta-comentarios

## Resultado esperado

- El meta-comentario "Elaboracion en progreso..." sera cortado en streaming por el compliance gate
- Si alguno escapa, el frontend lo limpiara antes de renderizar
- El LLM tendra prohibicion explicita de fabricar contenido ficticio
- Si no hay datos reales, dira "No dispongo de datos RIX" en vez de inventar
