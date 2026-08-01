# Auditoría de conexión con las 6 IAs (antes del barrido)

## Qué ya está verificado (solo lectura, sin tocar nada)

**Las 6 claves API están presentes** en los secretos del proyecto.

| IA | Modelo configurado | Variable de clave | Clave |
|---|---|---|---|
| ChatGPT | `gpt-4.1-mini` (endpoint `/v1/responses`) | `OPENAI_API_KEY` | presente |
| Perplexity | `perplexity-sonar-pro` | `PERPLEXITY_API_KEY` | presente (gestionada por conector) |
| Gemini | `gemini-2.5-pro` | `GOOGLE_GEMINI_API_KEY` | presente |
| Grok | `grok-4-1-fast` (endpoint `/v1/responses`) | `XAI_API_KEY` | presente |
| DeepSeek | `deepseek-v4-flash` (cambiado hoy) | `DEEPSEEK_API_KEY` | presente |
| Qwen | `qwen-max` (DashScope intl) | `DASHSCOPE_API_KEY` | presente |

**Últimos 3 barridos (12, 19 y 26 de julio):** 185 registros por modelo y semana, ninguna respuesta vacía, un único error puntual en Qwen el 12-jul. Tiempos medios: ChatGPT ~13s, Grok ~35s, Gemini ~54s, Perplexity ~65s, DeepSeek ~73s, Qwen ~85-114s. Qwen es el más lento y el que corre más riesgo de timeout.

**Riesgo principal:** el cambio de `deepseek-chat` → `deepseek-v4-flash` se aplicó hoy en el código y **nunca se ha ejecutado contra la API real**. Si el identificador no fuese exacto, DeepSeek devolvería error en las 185 empresas del barrido de mañana. Es el único cambio del pipeline sin probar.

## Lo que propongo hacer (todo lectura, sin escribir en base de datos)

1. **Ping real a los 6 proveedores** desde el sandbox: una petición mínima por API (prompt de una palabra, respuesta muy corta) con el mismo endpoint, cabeceras y formato de cuerpo que construye `rix-search-v2`. Confirma de golpe clave válida, identificador de modelo aceptado, endpoint vivo y ausencia de límite de cuota. Coste despreciable.
2. **Confirmar que la versión desplegada de `rix-search-v2` ya lleva `deepseek-v4-flash`**, y no solo el repositorio.
3. **Revisar cola y CRON del barrido** (`seed-sweep-queue`, `rix-batch-orchestrator`, watchdog) para verificar que la ejecución de mañana está programada y que no quedan triggers atascados de la semana pasada.
4. **Informe final** con semáforo por IA (verde / aviso / rojo), el error literal si alguna falla y la acción concreta recomendada antes del barrido.

## Detalle técnico

- Los pings se lanzan con `curl` leyendo variables de entorno; no se imprime ningún valor de clave.
- Cuerpos replicados de `buildRequest` en `supabase/functions/rix-search-v2/index.ts`: OpenAI y xAI con Responses API, Gemini con `generateContent`, DeepSeek y Perplexity con chat/completions, Qwen con formato DashScope.
- No se ejecuta ningún barrido, no se inserta nada en `rix_runs_v2` y no se tocan prompts ni pesos (metodología v1 congelada).