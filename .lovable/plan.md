

# Fix: Rix Press - Usar Google Gemini API directa + bypass auth en preview

## 3 problemas a resolver

### 1. Usar GOOGLE_GEMINI_API_KEY en lugar de Lovable AI Gateway

El codigo actual en `handlePressMode` (linea 5829) llama a `https://ai.gateway.lovable.dev/v1/chat/completions` sin Authorization header. Se debe reemplazar por la API directa de Google Gemini usando `GOOGLE_GEMINI_API_KEY` (ya configurada como secret), con el modelo `gemini-3-pro-preview`.

El proyecto ya tiene un patron establecido para llamar a Gemini directamente (linea 527): `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={apiKey}`. Se reutilizara ese mismo patron, convirtiendo los mensajes al formato Gemini (contents + systemInstruction).

### 2. Bypass de autenticacion en Preview

Las lineas 2046-2065 bloquean el acceso a press mode sin userId y sin rol `press`. En entorno Preview no hay sesion real. Se relajara la validacion para permitir acceso cuando no hay userId (mismo patron que el resto del proyecto).

### 3. Permitir enviar sin seleccionar perfil profesional

`ChatInput.tsx` linea 161: `canSend` exige `isSessionConfigured`. Rix Press es un modo independiente que no necesita elegir perfil. Se modificara para permitir envio cuando `isRixPressMode` esta activo.

## Cambios tecnicos

### `supabase/functions/chat-intelligence/index.ts`

**Seccion press mode auth (lineas 2046-2065):**
- Si `userId` existe: verificar rol `press` en DB (produccion)
- Si `userId` no existe: permitir acceso (preview/dev) y continuar

**Seccion handlePressMode (lineas 5829-5838):**
Reemplazar la llamada al Lovable AI Gateway por llamada directa a Google Gemini API:

```typescript
const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
if (!geminiApiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

// Convertir mensajes al formato Gemini
const contents = pressMessages
  .filter(m => m.role !== 'system')
  .map(m => ({ role: 'user', parts: [{ text: m.content }] }));
const systemInstruction = pressMessages.find(m => m.role === 'system')?.content;

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:streamGenerateContent?key=${geminiApiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      generationConfig: { maxOutputTokens: 8000 },
    }),
  }
);
```

Tambien se ajustara el parsing de la respuesta streaming ya que el formato de Gemini nativo es diferente al formato OpenAI (los chunks vienen como JSON array con `candidates[0].content.parts[0].text` en vez de `choices[0].delta.content`).

### `src/components/chat/ChatInput.tsx`

Linea 161, cambiar:
```typescript
// Antes
const canSend = value.trim() && !isLoading && isSessionConfigured;

// Despues
const canSend = value.trim() && !isLoading && (isSessionConfigured || isRixPressMode);
```

### `src/contexts/ChatContext.tsx`

Actualizar `toggleRixPressMode` para auto-configurar la sesion cuando se activa:

```typescript
const toggleRixPressMode = () => {
  setIsRixPressMode(prev => {
    const next = !prev;
    if (next && !isSessionConfigured) {
      configureSession('journalist');
    }
    return next;
  });
};
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | (1) Bypass auth sin userId, (2) Reemplazar Lovable Gateway por Google Gemini API directa con `GOOGLE_GEMINI_API_KEY`, (3) Adaptar streaming parser al formato Gemini nativo |
| `src/components/chat/ChatInput.tsx` | Permitir envio con `isRixPressMode` sin perfil seleccionado |
| `src/contexts/ChatContext.tsx` | Auto-configurar sesion al activar Rix Press |

