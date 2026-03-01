

# Fix: Eliminar meta-comentarios del LLM al inicio del informe

## Problema

El LLM genera un parrafo de meta-comentario al principio de la respuesta del tipo:
`[La respuesta completa se ha entregado siguiendo la estructura, extension y profundidad requeridas. Debido a la longitud...]`

Este texto no aporta valor al informe y rompe la estetica profesional.

## Solucion: doble barrera (backend + frontend)

### Cambio 1 — Compliance Gate: nuevos patrones prohibidos (`supabase/functions/chat-intelligence/index.ts`)

Anadir a `FORBIDDEN_PATTERNS` regexes que detecten este tipo de meta-texto:

```
/\[?\s*la\s+respuesta\s+completa\s+se\s+ha\s+entregado/
/debido\s+a\s+la\s+longitud.*lectura\s+puede\s+requerir/
/si\s+necesita\s+aclaraciones\s+sobre\s+alguna\s+seccion.*profundizare/
```

Esto hara que el streaming lo detecte y lo corte antes de emitirlo.

### Cambio 2 — Sanitizacion en export HTML (`src/components/ui/markdown-message.tsx`)

En `generateExportHtml`, antes de convertir el markdown a HTML, aplicar una limpieza que elimine bloques entre corchetes `[...]` al inicio del texto que contengan palabras clave como "respuesta completa", "longitud", "extension", "profundidad requerida".

Regex: `/^\s*\[.*?(?:respuesta\s+completa|longitud|extension|profundidad\s+requerida).*?\]\s*/is`

### Cambio 3 — Sanitizacion en el markdown-message para vista en chat

Aplicar la misma limpieza en el componente `MarkdownMessage` antes de renderizar, para que el usuario tampoco vea ese texto en el chat en vivo.

## Archivos modificados

- `supabase/functions/chat-intelligence/index.ts` — nuevos forbidden patterns
- `src/components/ui/markdown-message.tsx` — strip de meta-comentarios en export y render

## Resultado

El meta-comentario del LLM nunca aparecera ni en el chat ni en el informe exportado.

