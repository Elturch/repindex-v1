## Diagnóstico

El informe nunca llegó al Agente RIX V2: `chat-intelligence-v2` está caído por un **error de compilación** introducido en mi última edición de `sectorRanking.ts`:

```
worker boot error: Uncaught SyntaxError: Identifier 'isSingleModel' has already been declared
  at sectorRanking.ts:876
```

Eso dispara el fallback a v1, y v1 intenta validar el primer token («Genera») como marca → "Fuera de cobertura. No tengo a «Genera»…".

## Causa raíz (en `companyAnalysis` dentro de `sectorRanking.ts`)

En el bloque ~895-960 quedaron dos defectos tras la corrección del orden por columna visible:

1. `isSingleModel` se declara dos veces:
   - línea 908 (`Array.isArray(parsed.models) && parsed.models.length === 1`)
   - línea 953 (`models.length === 1`)
2. `models` se usa en la línea 953/958 antes de declararse en la línea 960 (`const models = parsed.models;`) → TDZ.

## Corrección (mínima, sin tocar lógica de ranking)

Una única edición quirúrgica en `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`:

- Mover `const models = parsed.models;` **arriba**, justo antes de la línea 908.
- Eliminar la redeclaración local de `isSingleModel` en la línea 953.
- Mantener exactamente la misma firma `aggregateRanking(rows, topN, orderHint, isSingleModel ? (models[0] as ModelName) : undefined)` y el render de tabla single/multi-model.

No se altera nada más: ni ordenación, ni snapshot detection, ni cobertura semanal, ni prompts, ni dashboard.

## Verificación

1. Confirmar que `chat-intelligence-v2` arranca (sin "worker boot error" en logs).
2. Re-lanzar el mismo informe (IBEX-35, top 5, 2026-04-10 → 2026-05-09, semanal, sólo ChatGPT) y comprobar:
   - Tabla ordenada por la columna visible `RIX (ChatGPT)`.
   - Pie: "5 semanas con datos", **no** "1 snapshot de 4 esperados".
   - Sin "consenso entre IAs" ni anti-referencias (single-model).
3. Cotejar el snapshot 2026-05-10 del Dashboard contra los valores semanales de la tabla (deben coincidir en la última semana).
