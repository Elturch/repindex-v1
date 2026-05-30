## Auditoría — Crear informe (post barridos recientes)

Reviso `RixReports.tsx`, `filterState.ts`, `coherenceEngine.ts`, `compileQuestion.ts` y `FilterPanel.tsx`. Confirmo en BD que el último barrido canónico es **2026-05-24** (175 tickers × 6 modelos × 10 semanas, sin huecos). El backend está sano, los fallos están en el front del compilador.

### Anomalías detectadas

**A1 — Ventana inicial desfasada (causa principal de "informe vacío / fechas raras").**
`createInitialFilterState()` arranca con `to = todayISO()` (hoy = 2026-05-30). El `useEffect` solo re-ancla si `origin === "free"` y aún no se ha tocado. Si el usuario pulsa cualquier preset (7d/30d/90d/YTD) **antes** de que `useLatestBatchDate` resuelva, el preset usa `todayISO()` como ancla y queda fijado en `2026-05-30` con `origin: "user-set"`, sin re-ancla automática posterior. El informe acaba con narrativa "entre 2026-05-02 y 2026-05-30" cuando no hay datos después de 2026-05-24.

**A2 — Inconsistencia de longitud `last_month` (28 vs 29 días).**
`defaultWindow()` → `subDaysISO(today, 28)`. `reanchorWindow('last_month')` → `subDaysISO(anchor, 29)`. El botón "Actualizar al último barrido" siempre aparece aunque el preset esté correctamente anclado, porque la ventana inicial y la re-anclada nunca coinciden bit a bit.

**A3 — R15 promete ajuste y solo emite warning.**
`coherenceEngine.ts` línea 290: si `window.from < "2026-01-01"` muestra "se ajustará automáticamente", pero no muta el estado. La query final incluye fechas pre-2026 y el agente puede inventar datos en ese hueco (viola la doctrina temporal y `data-availability-floor`).

**A4 — Nombres de modelo mal mapeados en la pregunta compilada.**
`compileQuestion.ts` línea 109 emite `"usando solo ChatGPT, Gemini, DeepSeek"` con labels de UI. La BD guarda `"Google Gemini"` y `"Deepseek"`. Ya existe `toDbModelNames()` en `filterState.ts` pero no se usa aquí — el agente puede no resolver el thesaurus y dejar fuera modelos.

**A5 — `topN`/`order` se cuelan en "visión general" si el usuario los tocó.**
`compileQuestion` añade "limitado a las X mejores" cuando `userTouched`, incluso en `vision_general`. La narrativa queda contradictoria ("informe ejecutivo … limitado a las 10 mejores"). El `hiddenForIntent('vision_general')` no los oculta, así que el usuario los toca sin querer al venir desde otro intent.

**A6 — Subsectores y sectores se imprimen sin etiquetar y con `", "`.**
`"del sector A, B"` o `"del subsector X, Y"` con dos o más entradas confunde al parser. Faltan separadores tipo `"y"` y un wrapping defensivo cuando el nombre contiene comas.

### Cambios propuestos (todo front, sin tocar agente ni BD)

1. **`src/lib/reports/filterState.ts`**
   - Unificar `defaultWindow()` para que `last_month` reste 29 días (alineado con `reanchorWindow`). Aplica también a la ventana inicial.
   - Añadir constante `DATA_FLOOR = "2026-01-01"` y exportarla.

2. **`src/pages/RixReports.tsx`**
   - El `useEffect` de re-ancla debe re-anclar también cuando `origin === "user-set"` siempre que el `preset` no sea `"custom"` y `to !== lastBatchDate`. Garantiza que cualquier preset siga al último barrido al cargar.

3. **`src/lib/reports/coherenceEngine.ts` (R15 real)**
   - Si `window.value.from < DATA_FLOOR`, **mutar** el estado a `from = DATA_FLOOR` (manteniendo `origin`), no solo avisar. Mantener el warning informativo.

4. **`src/lib/reports/compileQuestion.ts`**
   - Importar `toDbModelNames` y usarlo al emitir "usando solo …".
   - Suprimir la cláusula `topN/order` cuando `intent === "vision_general"` aunque haya `userTouched` (gana el intent).
   - Para sectores/subsectores múltiples: unir con `", "` salvo el último con `" y "`. Si solo hay 1, sin coma.
   - Si `granularity === "snapshot"`, añadir `"como foto fija del último barrido"` para que el agente no asuma desglose semanal por defecto.

5. **`src/components/reports/FilterPanel.tsx`**
   - El botón "Actualizar al último barrido" solo debe aparecer si la diferencia entre `to` y `lastBatchDate` es real (más de 0 días). Ajuste cosmético dependiente del fix A2.

### Fuera de alcance (no se toca)

- Backend RIX, agente V2, esquema BD, edge functions de barrido. El watchdog muestra `175 completed, 0 failed` para 2026-W22; el próximo barrido encontrará el sistema limpio.
- No se modifica el contrato persistido de informes ya guardados (`reportMemory`). Los informes antiguos rehidratan filtros tal cual y el usuario puede pulsar "Actualizar al último barrido" para re-anclar.

### Verificación tras implementar

- Cargar `/informes` con red lenta simulada y pulsar `30d` antes de que llegue `lastBatchDate`: la ventana debe acabar en `2026-05-24` automáticamente.
- Elegir 2 modelos (Gemini + DeepSeek): la pregunta compilada debe decir `"Google Gemini, Deepseek"`.
- Fijar fecha manual `2025-12-15`: la query final debe arrancar en `2026-01-01`.
- Visión general con `topN` tocado: no debe aparecer "limitado a las X mejores".
- Ranking 2 sectores: "del sector A y B" (no "A, B").
