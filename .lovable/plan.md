## Problema

El nivel de consenso se calcula sólo con el rango (max−min) de los scores RIX. Esto crea un sesgo de lectura: cuando hay crisis institucional, las 6 IAs convergen en señales negativas (rango bajo → "Consenso Alto"), y el usuario lo interpreta como "todo está bien". El término "reputación" arrastra un sesgo de negatividad inherente en los LLMs.

## Solución (2 capas + 1 educativa)

### Capa 1 — Consenso firmado (signed consensus)

Reinterpretar el indicador para distinguir polaridad. Mismo cálculo de rango, pero etiqueta cualitativa enriquecida:

```text
rango ≤ 10 + RIX promedio ≥ 60 → "Consenso positivo"   (verde)
rango ≤ 10 + RIX promedio 40-60 → "Consenso neutro"    (gris)
rango ≤ 10 + RIX promedio < 40  → "Consenso de crisis" (rojo)
rango 10-20                      → "Consenso medio"    (ámbar)
rango > 20                       → "Disenso"           (azul)
```

Umbrales del RIX promedio configurables (constantes en `consensusRanking.ts`).

### Capa 2 — Etiqueta semántica de la semana

Edge function nueva `classify-week-theme` que, una vez por semana tras el sweep dominical, llama a Gemini Flash Lite para clasificar los `raw_texts` agregados de cada (ticker, semana) en una etiqueta cerrada:

```text
neutral | positiva | crisis_regulatoria | crisis_financiera |
crisis_reputacional | hito_corporativo | resultado_financiero
```

Resultado se persiste en una tabla nueva `weekly_theme_tags(ticker, week_start, theme, confidence, model_used)`. Sólo escribe el CRON, lectura pública.

Cuando la semana está marcada como `crisis_*`, el chip de consenso muestra un badge "⚠ Forzado por crisis" en frontend y la narrativa V2 inyecta una nota metodológica.

### Capa 3 — Educar al usuario

Tooltip en cada chip de consenso explicando que consenso alto sobre RIX bajo = coincidencia en señales negativas, no salud reputacional.

## Cambios concretos

### Backend / datos
1. **Nueva tabla** `weekly_theme_tags` (migración Supabase): `ticker text, week_start date, theme text, confidence numeric, model_used text, created_at timestamptz`. PK `(ticker, week_start)`. RLS: SELECT público, INSERT sólo service role.
2. **Nueva edge function** `classify-week-theme` — itera tickers × semanas faltantes, llama Lovable AI Gateway (`google/gemini-3-flash-preview`) con tool calling JSON, persiste resultados. Idempotente.
3. **CRON nuevo** que invoca `classify-week-theme` los lunes tras el sweep dominical.
4. **`supabase/functions/_shared/consensusRanking.ts`** y **`src/lib/consensusRanking.ts`**: ampliar `ConsensusLevel` con `"positivo" | "neutro" | "crisis" | "medio" | "disenso"`. Nueva función `classifySignedConsensus(range, mean)`. Mantener helper viejo para retro-compat (deprecate gradual).
5. **`prompts/coverageRules.ts`** y `rankingMode.ts`: añadir bloque que, si `theme === 'crisis_*'`, declare en la narrativa "Consenso forzado por contexto de crisis — no leer como salud reputacional".

### Frontend
6. **`MiniTablesGrid.tsx`** y **`Dashboard.tsx`** (línea ~957): renderizar la etiqueta firmada con color semántico y badge ⚠ cuando hay crisis. Tooltip pedagógico (shadcn `Tooltip`) en cada chip.
7. **`useLandingTopFives.ts`**: leer `weekly_theme_tags` y exponer `theme` junto a `consensusLevel`.
8. **`FilterPanel.tsx`** / `LivePreview`: aviso en el preview cuando la ventana seleccionada contiene semanas-crisis dominantes.

### Métricas y tests
9. Test en `supabase/functions/chat-intelligence-v2/orchestrator_test.ts` que valide la nueva clasificación firmada.
10. Memoria nueva `mem://methodology/signed-consensus-and-crisis-bias` documentando la regla.

## Out of scope
- No tocar el cálculo de RIX ni los pesos de las 8 métricas.
- No re-etiquetar histórico de forma síncrona: backfill se hará por lotes con un botón en el panel admin (siguiente iteración).
- No cambiar el ranking de `sectorRanking` (sólo enriquecer su lectura).

## Riesgos
- Coste extra de Lovable AI: ~80 tickers × 1 llamada/semana = barato con Flash Lite.
- Falsos positivos del clasificador: mitigado con umbral `confidence >= 0.7` para mostrar el badge; por debajo, sólo se guarda el tag pero no se expone en UI.
