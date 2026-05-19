# Por qué los informes ahora solo muestran 4 modelos (antes 6)

## Resumen para no técnicos

El sábado pasado los informes mostraban los 6 modelos porque la consulta a la base de datos **no filtraba por modelo**: traía todo lo que hubiera para esa empresa y ese período, y luego el código reconocía cada modelo internamente. El **13 de mayo (commit `20f6a59`)** se añadió un filtro al SQL para ahorrar tráfico cuando el usuario pide modelos específicos. Ese filtro se aplicó **sin traducir los nombres** entre la UI y la base de datos. Como en la BD los modelos se llaman `"Google Gemini"` y `"Deepseek"` y el pipeline V2 los pide como `"Gemini"` y `"DeepSeek"`, esos dos modelos quedan fuera silenciosamente. Resultado: cualquier informe generado después del 13 de mayo pierde 2 de los 6 modelos.

Es una regresión, no un cambio intencional de metodología.

## Evidencia técnica

1. **Commit responsable**: `20f6a59` — 2026-05-13 08:44 UTC, archivo `supabase/functions/chat-intelligence-v2/datapack/builder.ts`.
2. **Antes (estado del sábado y previos)**: `fetchRows()` se llamaba sin parámetro `models` → la query sólo filtraba por `ticker` + ventana temporal. Los 6 nombres convivían sin problema porque nadie comparaba strings de modelo en SQL.
3. **Después del 13-may**: se añadió `if (models && models.length > 0) q = q.in("02_model_name", models);` y se pasó `parsed.models` desde `buildDataPack()`. `parsed.models` viene del enum V2 (`MODEL_NAMES`) que usa los labels cortos `"Gemini"` y `"DeepSeek"`.
4. **Mismatch con BD**: una consulta directa para Ferrovial 2026-04 → 2026-05 devuelve 6 filas por modelo con nombres `"ChatGPT"`, `"Deepseek"`, `"Google Gemini"`, `"Grok"`, `"Perplexity"`, `"Qwen"`. El `.in("02_model_name", ["ChatGPT","Perplexity","Gemini","DeepSeek","Grok","Qwen"])` matchea solo 4 → Gemini y DeepSeek se descartan a nivel SQL.
5. **Confirmación en el informe HTML adjunto**: sección 3 "Visión por Modelo de IA" lista solo 4 filas; sección 4 "Evolución Temporal" muestra `Filas: 4` por semana.
6. **¿Por qué `sectorRanking` no falla?**: ese skill (`sectorRanking.ts` líneas 1212-1214) hace la traducción local `m === "Gemini" ? "Google Gemini" : m === "DeepSeek" ? "Deepseek" : m` antes de su propio SQL. El `builder.ts` central no la tiene, por eso solo afecta a `companyAnalysis`, `comparison`, `modelDivergence`, `companyEvolution` (todos los que pasan por `buildDataPack`).
7. **Por qué pasó desapercibido**: `normalizeModelName()` sí traduce al leer (`"Google Gemini" → "Gemini"`), pero ese normalizador ya no llega a ver esas filas porque el SQL las descartó antes. No hay assertion de "esperaba 6 modelos, recibí 4" en el datapack, así que no salta ningún warning.

## Fix propuesto (1 archivo, mínimo)

Editar `supabase/functions/chat-intelligence-v2/datapack/builder.ts`:

1. Añadir un mapa local UI → BD:
   ```ts
   const UI_TO_DB_MODEL: Record<string, string> = {
     Gemini: "Google Gemini",
     DeepSeek: "Deepseek",
   };
   function toDbModelName(m: string): string {
     return UI_TO_DB_MODEL[m] ?? m;
   }
   ```
2. En `fetchRows()` (línea 205-207), aplicar el mapeo antes del `.in()`:
   ```ts
   if (models && models.length > 0) {
     q = q.in("02_model_name", models.map(toDbModelName));
   }
   ```
3. Actualizar el log para imprimir tanto los nombres UI como los traducidos (debugging).

No se toca nada más: ni `sectorRanking.ts` (ya lo hace), ni `normalizeModelName` (la lectura inversa funciona), ni la UI, ni la BD.

## Verificación

1. Regenerar el informe de Ferrovial (2026-04-06 → 2026-05-17): sección 3 debe mostrar **6 filas** y la evolución semanal **Filas = 6**.
2. Regenerar el informe sectorial de Grupos Hospitalarios: cada empresa expone 6 modelos.
3. Comprobar en los logs de la edge function `[RIX-V2][datapack] model filter applied:` ahora muestra `["ChatGPT","Perplexity","Google Gemini","Deepseek","Grok","Qwen"]`.
4. Añadir nota al .lovable/plan.md sobre el aprendizaje: cualquier filtro SQL sobre `02_model_name` debe pasar por un traductor canónico — incluir un test en `__test__` para que no se vuelva a romper en silencio.

## Acción adicional recomendada (opcional, no implementada en este fix)

Añadir un guard en `buildDataPack()`: si `models_coverage.with_data.length < requested.length` cuando el sweep dominical fue completo, emitir un `console.warn` claro (`models requested but missing in SQL response`). Eso convertiría futuros desajustes silenciosos en alertas visibles en logs, evitando que una regresión similar pase 6 días sin detectarse.
