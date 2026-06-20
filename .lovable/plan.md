## Auditoría de modelos para el barrido W26 (dom 00:00 UTC)

### Resultados

| Modelo en uso | Estado oficial | Riesgo barrido esta noche |
|---|---|---|
| `gpt-5` (OpenAI) | ✅ Activo | Ninguno |
| `gpt-4.1-mini` (OpenAI) | ✅ Activo en API | Ninguno |
| `sonar-pro` (Perplexity) | ✅ Activo | Ninguno |
| `qwen-max` (Alibaba) | ✅ Activo (legacy, sin fecha EOL) | Ninguno |
| `gemini-2.5-pro-preview-05-06` | ❌ **Retirado oficialmente el 2-dic-2025** | ⚠️ Alto — pero el barrido W24 (14-jun) lo usó con 175 respuestas OK → Google lo está redirigiendo silenciosamente. Puede dejar de funcionar sin aviso |
| `deepseek-chat` | ⚠️ **Deprecated, shutdown 24-jul-2026** | Bajo esta noche, alto en 5 semanas. Hoy redirige a `deepseek-v4-flash` |
| `grok-*` (xAI) | ❌ `grok-3` y `grok-4` retirados 15-may-2026, redirigen a `grok-4.3` | Verificar qué string usa el código — si es `grok-3/4`, ya se está facturando a tarifa `grok-4.3` sin saberlo |

### Acciones recomendadas antes del barrido

**Bloqueante real:** ninguno — el barrido W26 va a ejecutarse. Todos los slugs siguen respondiendo (con redirección silenciosa en Google/xAI).

**Urgente pero no esta noche** — actualizar strings de modelo para evitar facturación opaca y futura caída:

1. **`gemini-2.5-pro-preview-05-06` → `gemini-2.5-pro`** (GA, vive hasta 16-oct-2026) o `gemini-3.1-pro-preview` (siguiente generación).
2. **`deepseek-chat` → `deepseek-v4-flash`** antes del 24-jul-2026 (límite duro).
3. **`grok-*` → `grok-4.3`** si el código usa `grok-3` o `grok-4` (confirmar abriendo la edge function `rix-execute-model`).

### Próximo paso propuesto

¿Quieres que (a) **solo te confirme** que el barrido de esta noche va a funcionar tal cual (sí, con la salvedad Google/xAI), o (b) además **localice los strings de modelo en el código** (edge functions de ejecución) y prepare una migración mínima a `gemini-2.5-pro`, `grok-4.3` y `deepseek-v4-flash` para aplicar **después** del barrido de esta noche, manteniendo W26 con los modelos actuales para no romper continuidad histórica?