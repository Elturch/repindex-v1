

# Restaurar profundidad exhaustiva en todas las respuestas del Agente Rix

## Problema detectado

Hay dos fallos que provocan que las respuestas sean escuetas en vez de exhaustivas:

1. **FloatingChat pierde las opciones**: `handleSendMessage` y `handleSuggestionClick` en `FloatingChat.tsx` llaman a `sendMessage(message)` SIN pasar las opciones de `depthLevel` ni `roleId`. El `ChatInput` las prepara correctamente pero FloatingChat las ignora.

2. **Fallback a 'complete' en vez de 'exhaustive'**: En `ChatContext.tsx`, la llamada a la edge function usa `options?.depthLevel || 'complete'` en varios sitios (lineas 398, 431, 394). Si no llegan opciones, el sistema cae a `complete` en vez de `exhaustive`, lo que reduce el volumen de datos recuperados (5.000 records vs 10.000).

## Cambios

### 1. `src/components/chat/FloatingChat.tsx`
- Cambiar `handleSendMessage` para aceptar y reenviar las opciones de ChatInput (depthLevel, roleId)
- Cambiar `handleSuggestionClick` para enviar siempre con depthLevel `exhaustive` y el roleId de sesion

### 2. `src/contexts/ChatContext.tsx`
- Cambiar el fallback de `options?.depthLevel || 'complete'` a `options?.depthLevel || sessionDepthLevel` (que siempre es `'exhaustive'`) en:
  - El timeout calculation (linea 398)
  - El body de la request a la edge function (linea 431)
  - El insert en BD (linea 394)
- Esto garantiza que incluso sin opciones explicitas, se use la configuracion de sesion

## Resultado esperado

Todas las consultas, tanto desde la pagina completa `/chat` como desde el widget flotante, enviaran siempre `depthLevel: 'exhaustive'` a la edge function, activando la recuperacion de 10.000 registros RIX y el prompt del Embudo Narrativo con minimo 4.500 palabras.
