

# Eliminar la alucinación de "documento guardado en carpeta" del Agente Rix

## Problema

El modelo o3 genera respuestas largas (4.500+ palabras exigidas por el Embudo Narrativo) y al acercarse al limite de tokens de salida (32.000), en vez de seguir escribiendo, **alucina** un mensaje como:

> "La respuesta completa supera el limite tecnico de entrega en esta plataforma. He generado el informe ejecutivo completo en un documento aparte y lo he dejado en la carpeta segura /Informes_RIX/..."

Esto es una invención del modelo: no existe ninguna carpeta, ningun archivo guardado, y el usuario se queda sin su informe.

## Causa raíz

1. **Sin regla anti-truncacion**: El system prompt no tiene ninguna instruccion que prohiba al modelo simular que "guarda el informe en otro sitio"
2. **max_completion_tokens insuficiente**: El streaming usa 32.000 tokens, pero un informe exhaustivo de 4.500+ palabras en español puede necesitar 35.000-40.000 tokens

## Cambios propuestos

### 1. `supabase/functions/chat-intelligence/index.ts` — Regla anti-truncacion en el system prompt

Anadir un bloque nuevo en la seccion "ESTANDARES DE CALIDAD" (despues de los "NUNCA") con una regla explicita:

```text
REGLA CRITICA ANTI-TRUNCACION:
- NUNCA simules que has "guardado" el informe en una carpeta, archivo o documento aparte
- NUNCA digas que "la respuesta supera el limite tecnico de entrega"
- NUNCA inventes rutas de carpetas como "/Informes_RIX/" ni ningun filesystem
- Tu UNICA via de entrega es ESTE CHAT. Escribe el informe completo aqui mismo.
- Si el informe es largo, escríbelo entero. No hay limite de extension para ti.
- Si por alguna razon la respuesta se corta, simplemente termina donde puedas
  de forma natural, sin inventar excusas de almacenamiento externo.
```

### 2. `supabase/functions/chat-intelligence/index.ts` — Aumentar max_completion_tokens

Cambiar los 3 puntos donde se usa `32000` como max tokens para el chat estandar:

- Linea ~6079 (streaming OpenAI): `streamOpenAIResponse(messages, "o3", 32000, ...)` a `40000`
- Linea ~6101 (streaming Gemini fallback): `streamGeminiResponse(messages, "gemini-2.5-flash", 32000, ...)` a `40000`
- Linea ~6324 (non-streaming fallback): `callAIWithFallback(messages, "o3", 32000, ...)` a `40000`

### 3. `supabase/functions/chat-intelligence/index.ts` — Refuerzo en user prompt

Anadir al final de las "INSTRUCCIONES PARA TU RESPUESTA" (seccion del user prompt, ~linea 6030):

```text
10. ENTREGA COMPLETA: Escribe el informe ENTERO en esta respuesta.
    NUNCA digas que lo has guardado en una carpeta o documento aparte.
    No existe ningun sistema de archivos. Tu unica via de entrega es este chat.
```

## Resumen de impacto

- **1 archivo** modificado: `supabase/functions/chat-intelligence/index.ts`
- **3 cambios de max_tokens**: 32000 a 40000
- **2 bloques de texto** anadidos al prompt (system + user)
- **Sin cambios funcionales** — solo proteccion contra alucinaciones y mas espacio de generacion
- Requiere **redespliegue** de la edge function

