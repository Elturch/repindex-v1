

# Re-implementar rix-press-agent desde cero

## Diagnostico

La implementacion anterior no persistio correctamente:
- `supabase/functions/rix-press-agent/index.ts` NO EXISTE en el proyecto
- `src/contexts/ChatContext.tsx` NO tiene routing condicional — sigue enviando todo a `chat-intelligence`
- La `GOOGLE_GEMINI_API_KEY` SI esta configurada como secreto, no hay problema de API key
- No se esta usando "Lovable AI" — el plan siempre fue usar tu clave de Gemini directamente

## Acciones

### 1. CREAR `supabase/functions/rix-press-agent/index.ts`

Edge Function independiente con:
- CORS headers estandar
- Fetch de datos RIX unificados (rix_runs + rix_runs_v2)
- Query al Vector Store (tabla documents)
- System prompt de periodista investigador
- Llamada a Gemini 2.5 Pro via `GOOGLE_GEMINI_API_KEY` (tu clave, no Lovable AI)
- Streaming SSE compatible con el parser del frontend
- Logging en chat_intelligence_sessions y api_usage_logs
- Auth: verificar rol press en produccion, bypass en preview/dev

### 2. EDITAR `supabase/config.toml`

Verificar que exista la entrada:
```toml
[functions.rix-press-agent]
verify_jwt = false
```

### 3. EDITAR `src/contexts/ChatContext.tsx`

Cambiar el `sendMessage` para que cuando `isRixPressMode === true`:
- Apunte a `/functions/v1/rix-press-agent` en lugar de `/functions/v1/chat-intelligence`
- Envie un body simplificado (question, conversationHistory, sessionId, language, languageName)

### 4. Desplegar la Edge Function

Deploy automatico tras crear el archivo.

## Archivos

| Archivo | Accion |
|---------|--------|
| `supabase/functions/rix-press-agent/index.ts` | CREAR |
| `supabase/config.toml` | VERIFICAR/EDITAR |
| `src/contexts/ChatContext.tsx` | EDITAR — routing condicional |

