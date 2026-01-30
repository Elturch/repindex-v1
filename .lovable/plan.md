

# Plan: Corregir Registro de Tokens en Modo Streaming

## Diagnóstico Confirmado

El panel de "Mapa de Procesos" muestra 0 calls, $0.0000, 0 tokens porque:

| Modo | Tokens Registrados | Coste Registrado |
|------|-------------------|------------------|
| No-streaming (`action_type: 'chat'`) | **Correcto** | **Correcto** |
| Streaming (`action_type: 'chat_stream'`) | **0** | **$0.00** |

**Causa raíz**: OpenAI NO envía `usage` (tokens) en las respuestas de streaming **por defecto**. El código actual espera recibirlos pero nunca llegan:

```typescript
// Líneas 469-473 - Nunca se ejecuta porque parsed.usage siempre es undefined
if (parsed.usage) {
  totalInputTokens = parsed.usage.prompt_tokens || 0;
  totalOutputTokens = parsed.usage.completion_tokens || 0;
}
```

## Solución

Añadir `stream_options: { include_usage: true }` a la petición de OpenAI, lo cual hace que el API envíe un chunk final con la información de tokens.

## Archivos a Modificar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Añadir `stream_options` a peticiones de OpenAI streaming | Bajo |

## Cambios Técnicos

### Función `streamOpenAIResponse` (líneas 411-423)

Cambio en el body de la petición:

```typescript
// ANTES (líneas 417-422)
body: JSON.stringify({
  model,
  messages,
  max_completion_tokens: maxTokens,
  stream: true,
}),

// DESPUÉS
body: JSON.stringify({
  model,
  messages,
  max_completion_tokens: maxTokens,
  stream: true,
  stream_options: { include_usage: true }, // Añadir esta línea
}),
```

### Ubicaciones Afectadas

Hay que aplicar este cambio en todas las llamadas a OpenAI con streaming:

1. **Función `streamOpenAIResponse`** (línea ~417)
   - Usada por el flujo principal de chat streaming
   
2. **Cualquier otra llamada directa a OpenAI con `stream: true`** (revisar si existe)

## Comportamiento Esperado Después del Fix

Con `stream_options: { include_usage: true }`, OpenAI enviará un chunk adicional al final con:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 800,
    "total_tokens": 2000
  }
}
```

Este chunk será capturado por el código existente en líneas 469-473, que ya está preparado para procesarlo.

## Impacto en Producción

- **Riesgo**: Muy bajo
- **Afectación al pipeline RIX**: Ninguna (solo afecta a chat-intelligence)
- **Compatibilidad**: OpenAI soporta `stream_options` desde GPT-4o y modelos posteriores
- **Fallback Gemini**: Necesita revisión para ver si tiene opción equivalente

## Verificación Post-Implementación

1. Hacer una consulta al chat en modo streaming
2. Verificar en `api_usage_logs` que el nuevo registro tiene `input_tokens > 0`
3. Refrescar el panel de admin para confirmar que los costes aparecen

## Nota sobre Gemini

El streaming de Gemini también necesita revisión. Su API devuelve tokens en el último chunk de forma diferente. Hay que verificar que la función `streamGeminiResponse` también los captura correctamente.

