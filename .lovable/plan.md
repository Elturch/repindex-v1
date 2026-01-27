

# Plan: Reducir Timeout de OpenAI para Boletines

## Cambio Requerido

**Archivo**: `supabase/functions/chat-intelligence/index.ts` (línea 1741)

```typescript
// ANTES
const result = await callAIWithFallback(bulletinMessages, 'o3', 40000, logPrefix, 180000);

// DESPUÉS
// Timeout reduced to 60s to ensure Gemini fallback has enough time before server limit (~150s)
const result = await callAIWithFallback(bulletinMessages, 'o3', 40000, logPrefix, 60000);
```

## Por Qué Este Cambio

| Escenario | Antes (180s) | Después (60s) |
|-----------|--------------|---------------|
| OpenAI responde en 45s | OK | OK |
| OpenAI lento (>60s) | Espera hasta 180s → Server mata la conexión | Corta a 60s → Gemini responde en ~50s → Total: 110s → OK |
| Resultado | "Failed to fetch" | Boletín generado correctamente |

## Calidad

No se ve afectada porque:
- Los datos (registros RIX) ya están procesados
- Gemini 2.0 Flash genera boletines de calidad comparable
- El tiempo de respuesta no determina la profundidad del análisis

## Resultado Esperado

Los boletines de empresas grandes (Telefónica con 412 registros, etc.) completarán exitosamente en lugar de fallar por timeout del servidor.

