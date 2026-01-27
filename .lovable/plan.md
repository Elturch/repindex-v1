
# Plan: Implementar Live Streaming para Generacion de Informes

## Objetivo

Transformar la generacion de informes del sistema actual (respuesta completa al final) a un sistema de streaming en tiempo real donde el texto aparece palabra por palabra, similar a ChatGPT. Esto:

1. **Elimina timeouts** - El cliente recibe datos continuamente, manteniendo la conexion activa
2. **Mejora la UX** - El usuario ve el progreso inmediato en lugar de esperar 1-3 minutos
3. **Permite descarga al completar** - Boton de descarga/guardado aparece cuando termina el stream

---

## Arquitectura Propuesta

```text
┌─────────────────────┐     SSE Stream      ┌──────────────────────────┐
│   ChatContext.tsx   │ ◄─────────────────► │  chat-intelligence       │
│   (Frontend)        │    text/event-stream │  (Edge Function)         │
│                     │                      │                          │
│  - EventSource API  │   data: {"chunk":..} │  - OpenAI stream: true   │
│  - Acumula chunks   │   data: {"done":true}│  - ReadableStream        │
│  - Renderiza texto  │                      │  - TransformStream       │
└─────────────────────┘                      └──────────────────────────┘
```

---

## Cambios Requeridos

### 1. Edge Function: `supabase/functions/chat-intelligence/index.ts`

**Nuevo endpoint con streaming:**

```typescript
// Nueva funcion de streaming para OpenAI
async function streamOpenAIResponse(
  messages: Array<{role: string; content: string}>,
  model: string,
  maxTokens: number
): Promise<ReadableStream> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: maxTokens,
      stream: true,  // CLAVE: Activar streaming
    }),
  });

  return response.body!;
}

// Handler para requests con streaming
if (streamMode) {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // 1. Enviar metadatos iniciales
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'start', metadata: {...} })}\n\n`
      ));
      
      // 2. Stream del contenido principal
      for await (const chunk of openAIStream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'chunk', text })}\n\n`
          ));
        }
      }
      
      // 3. Generar preguntas sugeridas (post-stream)
      const suggestedQuestions = await generateSuggestedQuestions(...);
      
      // 4. Enviar finalizacion con metadata
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ 
          type: 'done', 
          suggestedQuestions,
          drumrollQuestion,
          metadata: {...}
        })}\n\n`
      ));
      
      controller.close();
    }
  });

  return new Response(stream, { headers });
}
```

**Logica de fallback a Gemini con streaming:**

```typescript
// Gemini tambien soporta streaming via su API
async function streamGeminiResponse(...) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [...],
        generationConfig: { maxOutputTokens }
      }),
    }
  );
  // Procesar NDJSON stream de Gemini
}
```

### 2. Frontend: `src/contexts/ChatContext.tsx`

**Nuevo metodo `sendMessageStreaming`:**

```typescript
const sendMessageStreaming = useCallback(async (
  question: string, 
  options?: SendMessageOptions
) => {
  // 1. Preparar mensaje del usuario
  const userMessage: Message = { role: 'user', content: question };
  setMessages(prev => [...prev, userMessage]);
  
  // 2. Crear mensaje vacio para el asistente (se ira llenando)
  const assistantMessage: Message = { 
    role: 'assistant', 
    content: '', 
    isStreaming: true  // Nueva propiedad
  };
  setMessages(prev => [...prev, assistantMessage]);
  
  // 3. Abrir conexion EventSource
  const eventSource = new EventSource(
    `${SUPABASE_URL}/functions/v1/chat-intelligence-stream?` +
    new URLSearchParams({
      question,
      sessionId,
      depthLevel: options?.depthLevel || 'complete',
      language: language.code,
      // ... otros params
    }),
    { 
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    }
  );
  
  // 4. Manejar chunks entrantes
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'chunk') {
      // Acumular texto en el ultimo mensaje
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        lastMsg.content += data.text;
        return updated;
      });
    } 
    else if (data.type === 'done') {
      // Marcar como completado y agregar metadata
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        lastMsg.isStreaming = false;
        lastMsg.suggestedQuestions = data.suggestedQuestions;
        lastMsg.drumrollQuestion = data.drumrollQuestion;
        lastMsg.metadata = data.metadata;
        return updated;
      });
      
      eventSource.close();
      setIsLoading(false);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('Stream error:', error);
    eventSource.close();
    setIsLoading(false);
    // Fallback a metodo tradicional si falla
  };
  
}, [sessionId, language, ...]);
```

### 3. Frontend: `src/components/chat/ChatMessages.tsx`

**Indicador visual de streaming:**

```tsx
{message.role === 'assistant' && (
  <div className="relative">
    <MarkdownMessage 
      content={message.content} 
      showDownload={!message.isStreaming}  // Solo mostrar cuando complete
      languageCode={languageCode}
    />
    
    {/* Cursor parpadeante durante streaming */}
    {message.isStreaming && (
      <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
    )}
  </div>
)}

{/* Barra de progreso durante streaming */}
{message.isStreaming && (
  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    <span>Generando informe...</span>
  </div>
)}
```

### 4. Interfaz de Message actualizada

**`src/contexts/ChatContext.tsx` - Tipos:**

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedQuestions?: string[];
  drumrollQuestion?: DrumrollQuestion;
  metadata?: MessageMetadata;
  isStreaming?: boolean;  // NUEVO: indica si el mensaje esta en streaming
}
```

---

## Flujo de Datos Detallado

```text
1. Usuario envia pregunta
   │
2. ChatContext:
   ├── Agrega mensaje usuario
   ├── Agrega mensaje asistente vacio (isStreaming: true)
   └── Abre EventSource a /chat-intelligence-stream
   │
3. Edge Function:
   ├── Recopila contexto (vector store, rix_runs, etc.)
   ├── Envia SSE: { type: 'start', metadata: {...} }
   ├── Llama OpenAI con stream: true
   └── Por cada chunk:
       └── Envia SSE: { type: 'chunk', text: '...' }
   │
4. Frontend (en paralelo):
   ├── Recibe chunks
   ├── Acumula en message.content
   └── Re-renderiza (efecto "typing")
   │
5. Edge Function (al terminar):
   ├── Genera suggestedQuestions
   ├── Genera drumrollQuestion
   ├── Guarda en DB
   └── Envia SSE: { type: 'done', suggestedQuestions, ... }
   │
6. Frontend:
   ├── Marca isStreaming: false
   ├── Muestra boton de descarga
   └── Cierra EventSource
```

---

## Consideraciones Tecnicas

### Manejo de Errores

```typescript
// Edge Function: Si OpenAI falla, fallback a Gemini con stream
try {
  for await (const chunk of openAIStream) { ... }
} catch (openAIError) {
  // Notificar al cliente del cambio
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({ type: 'fallback', provider: 'gemini' })}\n\n`
  ));
  // Continuar con Gemini stream
  for await (const chunk of geminiStream) { ... }
}
```

### Reconexion automatica

```typescript
// Frontend: Reintentar si se pierde conexion
eventSource.onerror = () => {
  if (retryCount < 3) {
    setTimeout(() => {
      retryCount++;
      // Reconectar desde donde se quedo (enviar offset)
    }, 1000);
  }
};
```

### Compatibilidad con fetch (alternativa a EventSource)

```typescript
// Si EventSource no funciona (CORS issues), usar fetch con ReadableStream
const response = await fetch(url, { method: 'POST', body: ... });
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // Parsear SSE y procesar
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/chat-intelligence/index.ts` | Agregar modo streaming con SSE, ReadableStream |
| `src/contexts/ChatContext.tsx` | Nuevo metodo `sendMessageStreaming`, tipos actualizados |
| `src/components/chat/ChatMessages.tsx` | Indicador de streaming, cursor parpadeante |
| `src/components/ui/markdown-message.tsx` | Ocultar descarga durante streaming |

---

## Resultado Esperado

| Antes | Despues |
|-------|---------|
| Espera 1-3 min sin feedback | Texto aparece palabra por palabra |
| Timeout en informes largos | Conexion siempre activa |
| Descarga disponible solo al final | Descarga aparece al completar stream |
| Mensaje de "Generando..." generico | Progreso visible en tiempo real |

El usuario vera el informe construirse en tiempo real, con un cursor parpadeante que indica que sigue generandose, y al finalizar aparecera el boton de descarga junto con las preguntas sugeridas.
