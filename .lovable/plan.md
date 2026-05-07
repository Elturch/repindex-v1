# Fallos detectados en Informes RIX (universo IBEX-MC y similares)

## Diagnóstico

Tres bugs en el backend `chat-intelligence-v2/skills/sectorRanking.ts`:

1. **Colapso de familia IBEX → siempre IBEX-35.** La detección actual es:
   ```ts
   const ibexOnly = /\bibex(?:[-\s]?\d+)?\b/i.test(parsed.raw_question);
   ...
   if (ibexOnly) scopeQ = scopeQ.eq("ibex_family_code", "IBEX-35");
   ```
   Cualquier mención a "IBEX-MC", "IBEX-SC", "MC-OTHER", "BME-GROWTH" cae en el regex y se fuerza a `IBEX-35`. Por eso el datapack devuelve 35 empresas y `2657 observaciones` aunque el filtro frontend diga `IBEX-MC` o `IBEX Small Cap`. La BD ya tiene los códigos: 35 / 21 / 31 / 26 / 19.

2. **`topN` ignora "limitado a las 10 peores".** El parser sólo busca `/\btop\s*(\d{1,2})\b/`. La frase compilada por el frontend es `limitado a las 10 peores`, así que `topN` cae al default de la familia (35 / 25 / 15) y el informe lista todo el universo.

3. **`order` (asc/desc/divergence) no se propaga.** Aunque el frontend escribe "10 peores" / "10 mejores" / "10 de mayor divergencia", el backend siempre ordena `desc` por `09_rix_score`. Hay que extraer el orden de la misma cláusula.

(Modelos sí se respetan: el flujo `dbModelFilter` mapea `Gemini → Google Gemini` y filtra SQL.)

## Cambios

### 1. `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`

- Sustituir `ibexOnly: boolean` por `familyCode: string | null` en `fetchRankingRows` y `fetchSectorSourceRows`.
- Detectar familia con un mapa explícito sobre `parsed.raw_question`:
  ```
  IBEX-35 | IBEX-MC | IBEX-SC | MC-OTHER | BME-GROWTH
  ```
  Aliases tolerados: "IBEX Medium Cap" → IBEX-MC, "IBEX Small Cap" → IBEX-SC, "Mercado Continuo" sin IBEX → MC-OTHER. Si no hay match, `familyCode = null`.
- Aplicar `scopeQ.eq("ibex_family_code", familyCode)` con el valor exacto.
- Sólo invocar `assertIbex35Invariant` cuando `familyCode === "IBEX-35"`.
- `topN` por defecto pasa a depender del tamaño real de la familia: 35 / 21 / 31 / 26 / 19. Si `scopeTickers` o `sector` están presentes mantienen su lógica actual.
- Añadir parser de "limitado a las N (peores|mejores|de mayor divergencia)" → `explicitTopN` y `orderHint`.
- Pasar `orderHint` a `aggregateRanking` para invertir el orden cuando sea `asc` o aplicar el ranking por rango (`rix_max - rix_min`) cuando sea `divergence`.
- `scopeLabel` refleja la familia detectada ("IBEX Medium Cap (21 empresas)", etc.).

### 2. `supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts`

- Reemplazar las menciones hardcoded a "IBEX-35" en la sección 1 del prompt cuando el alcance no sea IBEX-35: usar `${scopeLabel}` y la cifra real de empresas.
- Añadir regla explícita: "El alcance del informe es {familyCode}; PROHIBIDO mencionar IBEX-35 si el alcance es otra familia".

### 3. `src/lib/reports/compileQuestion.ts`

- Cuando `state.universe.value` contenga un código de familia (IBEX-35, IBEX-MC, IBEX-SC, MC-OTHER, BME-GROWTH) usarlo literal: `del universo IBEX-MC`. (Hoy ya lo hace, validar que el string es exacto al `ibex_family_code` de BD.)
- Mapear los labels visibles del FilterPanel ("IBEX Small Cap", "IBEX Medium Cap", "Mercado Continuo") a sus códigos canónicos antes de inyectar la frase, para que el backend reciba siempre `IBEX-SC`, `IBEX-MC`, `MC-OTHER`.

### 4. Verificación

- Llamar `chat-intelligence-v2` vía `supabase--curl_edge_functions` con tres preguntas:
  - `Genera un informe ejecutivo del universo IBEX-MC limitado a las 10 peores entre 2026-02-06 y 2026-05-07 con desglose semanal.` → datapack debe mostrar 21 empresas, ranking de 10 (peores), informe sin mencionar IBEX-35.
  - `... universo IBEX-SC limitado a las 5 mejores ...` → 31 empresas en alcance, ranking de 5 (mejores).
  - `... universo IBEX-35 ...` → comportamiento actual intacto.
- Revisar logs `[RIX-V2][sectorRanking]` para confirmar `family=IBEX-MC`, `topN=10`, `order=asc`.

## Fuera de alcance

- No se tocan los skills `companyAnalysis`, `companyEvolution`, `divergenceAnalysis`. Si el usuario pide "perfil del universo IBEX-MC" eso entra en sector_ranking igualmente (intent classifier lo enruta así).
- No se modifica el `verified_competitors` ni el bloque "Contexto Competitivo" (ya resuelto en la iteración anterior).
- No se cambia el FilterPanel UI ni los presets visibles.
