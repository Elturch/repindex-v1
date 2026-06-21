# Migración de modelos AI — aplicar TRAS el barrido W26

Fecha auditoría: 21-jun-2026 · Aplicar: lunes 22-jun (después de cierre W26)

## Localización exacta de strings en código

Único archivo afectado: **`supabase/functions/rix-search-v2/index.ts`**
(el ejecutor real del barrido). `_shared/modelsEnum.ts` es solo mapeo
display → no requiere cambios obligatorios.

### Cambio 1 — Grok: `grok-4-1-fast` → `grok-4.3`

Retirado el 15-may-2026. Hoy redirige silenciosamente a `grok-4.3` y
factura a tarifa `grok-4.3`. Hacer explícito:

- Línea 328: `name: 'grok-4-1-fast',` → `name: 'grok-4.3',`
- Línea 342: `model: 'grok-4-1-fast',` → `model: 'grok-4.3',`
- Línea 1047: `targetConfig.name === 'grok-4-1-fast'` → `=== 'grok-4.3'`
- Línea 1197: `config.name === 'grok-4-1-fast'` → `=== 'grok-4.3'`
- Comentarios líneas 323-324, 341: actualizar nota a "grok-4.3 (mayo 2026)".

### Cambio 2 — Gemini: limpiar alias legacy preview

La función real ya usa `gemini-2.5-pro` (líneas 504, 507) — OK.
Sólo queda un alias legacy en el mapa de retrocompatibilidad:

- Línea 590:
  `'gemini-2.5-pro': { provider: 'gemini', model: 'gemini-2.5-pro-preview-05-06' }`
  → `'gemini-2.5-pro': { provider: 'gemini', model: 'gemini-2.5-pro' }`

`gemini-2.5-pro` GA vive hasta 16-oct-2026. Re-evaluar entonces el salto a
`gemini-3.1-pro-preview`.

### Cambio 3 — DeepSeek: `deepseek-chat` → `deepseek-v4-flash`

Shutdown duro **24-jul-2026**. Margen: 5 semanas.

- Línea 416: `name: 'deepseek-chat',` → `name: 'deepseek-v4-flash',`
- Línea 430: `model: 'deepseek-chat',` → `model: 'deepseek-v4-flash',`
- Línea 589: `'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat' }`
  → `'deepseek-v4-flash': { provider: 'deepseek', model: 'deepseek-v4-flash' }`

⚠️ El `dbColumn` sigue siendo `respuesta_bruto_deepseek` y el
`displayName` "Deepseek" → continuidad histórica preservada en la BD.
Verificar que `_shared/modelsEnum.ts` mapea ambos strings al mismo
canonical "Deepseek".

## Modelos que NO se tocan

| Modelo | Motivo |
|---|---|
| `gpt-5` (OpenAI) | Activo, alias rolling, sin EOL |
| `gpt-4.1-mini` (OpenAI) | Activo en API, sin deprecación anunciada |
| `sonar-pro` (Perplexity) | Activo, sin deprecación |
| `qwen-max` (Alibaba) | Activo (legacy), sin EOL; migrar a `qwen3.7-max` es opcional |

## Validación post-cambio

1. Lanzar `rix-search-v2` manualmente con 1 ticker de prueba (p.ej. SAN).
2. Confirmar que las 6 columnas `respuesta_bruto_*` reciben texto > 0.
3. Revisar logs de la edge function por errores 404 / model_not_found.
4. Si Grok devuelve estructura distinta con `grok-4.3`, revisar `parseResponse`
   (líneas 349-400).

## Continuidad histórica

W26 (esta noche) se ejecuta con los strings actuales → comparable con W1-W25.
W27 en adelante con los nuevos strings. Anotar en `weekly_theme_tags` o
changelog el corte de modelo en la semana W27 para no atribuir variaciones
RIX a cambios de comportamiento de mercado.