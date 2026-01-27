
# Plan: Ampliar Timeout 5x para Generación de Boletines

## Diagnóstico

El SDK de Supabase (`supabase.functions.invoke`) **no soporta la opción `signal`** para AbortController. El timeout por defecto del navegador/fetch es ~60 segundos, pero los boletines de empresas grandes (como Telefónica con 412 registros) tardan ~2 minutos.

## Solución Simple

Reemplazar `supabase.functions.invoke` por `fetch` directo **solo para la llamada de chat-intelligence**, con un timeout configurable de **5 minutos (300 segundos)**.

---

## Cambios Requeridos

### Archivo: `src/contexts/ChatContext.tsx`

**Cambio principal**: Crear una función helper que use `fetch` con `AbortController` en lugar del SDK:

```typescript
// Helper para llamar a edge functions con timeout extendido
async function invokeWithTimeout(
  functionName: string,
  body: any,
  timeoutMs: number = 300000 // 5 minutos por defecto
): Promise<{ data: any; error: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(
      `https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText) };
    }
    
    const data = await response.json();
    return { data, error: null };
    
  } catch (err: any) {
    clearTimeout(timeoutId);
    
    if (err.name === 'AbortError') {
      return { 
        data: null, 
        error: new Error('La generación del informe ha excedido el tiempo límite (5 minutos). Intenta con un informe más corto.')
      };
    }
    
    return { data: null, error: err };
  }
}
```

**Reemplazar las llamadas** en `sendMessage` y `enrichResponse`:

```typescript
// ANTES (línea ~256)
const { data, error } = await supabase.functions.invoke('chat-intelligence', {
  body: { ... }
});

// DESPUÉS
const { data, error } = await invokeWithTimeout('chat-intelligence', {
  question,
  conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
  // ... resto de parámetros
}, 300000); // 5 minutos
```

---

## Configuración de Timeouts por Tipo de Informe

| Tipo de Informe | Timeout Actual | Nuevo Timeout |
|-----------------|----------------|---------------|
| Quick           | 60s (implícito)| 120s (2 min)  |
| Complete        | 60s (implícito)| 180s (3 min)  |
| Exhaustive      | 60s (implícito)| 300s (5 min)  |
| Bulletin        | 60s (implícito)| 300s (5 min)  |
| Enrich          | 60s (implícito)| 120s (2 min)  |

Lógica:
```typescript
const getTimeoutForDepth = (depth: string, bulletinMode: boolean): number => {
  if (bulletinMode) return 300000; // 5 min para boletines
  switch (depth) {
    case 'quick': return 120000;     // 2 min
    case 'complete': return 180000;  // 3 min
    case 'exhaustive': return 300000; // 5 min
    default: return 180000;          // 3 min por defecto
  }
};
```

---

## Mejora UX: Feedback Durante la Espera

Para que el usuario no piense que la aplicación se ha colgado durante 2-5 minutos:

```typescript
// En sendMessage, después de setIsLoading(true):
const loadingMessages = [
  "Consultando 6 modelos de IA...",
  "Analizando datos de mercado...",
  "Recopilando información sectorial...",
  "Procesando histórico de la empresa...",
  "Generando informe ejecutivo...",
];

let messageIndex = 0;
const rotateInterval = setInterval(() => {
  setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
  messageIndex++;
}, 15000); // Cada 15 segundos cambia el mensaje

// Limpiar al terminar
clearInterval(rotateInterval);
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/contexts/ChatContext.tsx` | Añadir `invokeWithTimeout`, reemplazar llamadas, añadir lógica de timeout por tipo |
| `src/components/chat/ChatMessages.tsx` | Mostrar mensaje de progreso durante carga larga |

---

## Resultado Esperado

| Escenario | Antes | Después |
|-----------|-------|---------|
| Boletín Telefónica (~2 min) | TIMEOUT ERROR | Completa correctamente |
| Informe exhaustivo (~90 seg) | Falla frecuente | Completa correctamente |
| Usuario ve pantalla | Loader estático | Mensajes rotativos de progreso |
| Error real (>5 min) | Silencioso | Mensaje claro "tiempo excedido" |

---

## Implementación

1. **`invokeWithTimeout` helper** - Función con fetch + AbortController (5 min)
2. **Reemplazar llamadas** - `sendMessage` y `enrichResponse` (5 min)
3. **Timeout dinámico** - Según `depthLevel` y `bulletinMode` (3 min)
4. **Mensajes de progreso** - Rotar cada 15 segundos (7 min)

**Total estimado: ~20 minutos**
