## Diagnóstico confirmado por logs

Logs reales de `chat-intelligence-v2` (snapshot 2026-05-06 21:11):

```
question: "Genera un ranking de la métrica CXM del sector Consultoría y Auditoría
            limitado a las 10 mejores entre 2026-04-08 y 2026-05-06 con desglose semanal."
parsed temporal | from=2026-04-05 | to=2026-04-05 | mode=period
SQL window | requested=2026-04-05→2026-04-05 | reconciled=2026-04-05→2026-04-05
```

Mismo bug que con IBEX-35: el parser temporal toma la primera fecha ISO suelta (`2026-04-08`), la trata como `explicit_date` y la "snappa" al domingo anterior (`2026-04-05`). El conector español `y` en `entre 2026-04-08 y 2026-05-06` no está en la regex `ISO_RANGE_RE`.

Esto ocurre con **cualquier alcance** (IBEX, sector, subsector, scope_tickers, comparativas, evoluciones) porque el parser es global. Por eso hay que arreglarlo en la capa temporal y validar transversalmente.

## Plan

### 1. Generalizar `ISO_RANGE_RE` en `supabase/functions/_shared/temporalGuard.ts`

Aceptar todos los conectores españoles e ingleses comunes, manteniendo los actuales:

- `entre 2026-04-08 y 2026-05-06`
- `del 2026-04-08 al 2026-05-06`
- `desde 2026-04-08 hasta 2026-05-06`
- `2026-04-08 a 2026-05-06`
- `2026-04-08 - 2026-05-06`, `– 2026-05-06`, `→ 2026-05-06`
- `2026-04-08 to 2026-05-06`
- `2026-04-08 and 2026-05-06`

La regex se aplicará antes que `ISO_DATE_RE` (ya es así). Conservar `kind = explicit_range`.

### 2. Reforzar la rama `parseComparison`

`parseComparison` divide por `vs / versus / frente a / contra...`. Cuando el usuario escribe `entre A y B con desglose semanal`, el `compara` no aplica, pero hoy si el reconocedor de "comparison" se dispara por la palabra `compara`, parte la frase en dos. Añadir guarda: si ambas mitades resuelven a `explicit_date` y `entre X y Y` aparece literalmente, devolver `explicit_range` y NO comparativa.

### 3. Pasarela defensiva en `parsers/temporalParser.ts`

Antes de invocar `parseTemporalIntent`, normalizar la frase:

- Detectar patrón `entre <ISO> y <ISO>` y reescribirlo a `<ISO> a <ISO>` para garantizar que `ISO_RANGE_RE` lo capture incluso si una mejora futura olvida el conector `y`. Es un cinturón + tirantes.

### 4. Tests de regresión transversales

Añadir o ampliar `_shared/temporalGuard_test.ts` con casos:

- `entre 2026-04-08 y 2026-05-06` → `explicit_range`, `2026-04-08 → 2026-05-06`.
- `desde 2026-01-01 hasta 2026-03-31` → `explicit_range`.
- `del 2026-02-01 al 2026-02-28` → `explicit_range`.
- `2026-04-08 to 2026-05-06` → `explicit_range`.
- `2026-04-08 and 2026-05-06` → `explicit_range`.
- Sanity: una sola fecha sigue siendo `explicit_date`.

### 5. Tests de regresión por intent y alcance

Añadir un test ligero en `chat-intelligence-v2/parsers/temporalParser_test.ts` (creación nueva si no existe) que valide la integración con frases reales del panel de Informes:

- IBEX-35: `Genera un informe ejecutivo del universo IBEX-35 limitado a las 10 mejores entre 2026-04-08 y 2026-05-06 con desglose semanal.`
- Sector: `Genera un ranking de la métrica CXM del sector Consultoría y Auditoría limitado a las 10 mejores entre 2026-04-08 y 2026-05-06 con desglose semanal.`
- Subsector: `Compara las 5 mejores empresas del subsector Grupos Hospitalarios entre 2026-04-08 y 2026-05-06.`
- Comparativa multi-empresa: `Compara Iberdrola con Endesa entre 2026-04-08 y 2026-05-06.`
- Evolución: `Analiza la evolución de Inditex entre 2026-04-08 y 2026-05-06 con desglose semanal.`

Resultado esperado en todos: `requested_from = 2026-04-08`, `requested_to = 2026-05-06`, `mode = period`.

### 6. Verificación en `sectorRanking` y resto de skills

Confirmar (sin tocar lógica) que `sqlFrom = parsed.temporal.requested_from ?? parsed.temporal.from` y `sqlTo = parsed.temporal.requested_to ?? parsed.temporal.to` están correctamente puestos en:

- `skills/sectorRanking.ts` ✓ (ya lo hace)
- `skills/comparison.ts`
- `skills/periodEvolution.ts`
- `skills/modelDivergence.ts`
- `skills/companyAnalysis.ts`

Si alguna usa solo `temporal.from/to`, parchear para que use el rango requerido cuando exista. Esto evita que un futuro fallo del reconciliador vuelva a colapsar la ventana a una semana.

### 7. Despliegue y validación en vivo

1. Desplegar `chat-intelligence-v2` y `_shared` (compartido).
2. Disparar curl con la pregunta IBEX-35 original y verificar en logs:
   - `parsed temporal | from=2026-04-08 | to=2026-05-06 | mode=period`
   - `[sectorRanking] fetched=>=800 rows | window=2026-04-08→2026-05-06 | ibexOnly=true`
3. Repetir con el caso sector "Consultoría y Auditoría" para confirmar que también resuelve a 4 semanas.

### 8. Riesgos

- Falsos positivos: la palabra `y` es muy común, pero `ISO_RANGE_RE` exige dos fechas ISO completas separadas por espacios y conector. No afectará a frases sin fechas ISO.
- Comparativas con `compara X con Y entre A y B` deben seguir funcionando: el split por `con` ocurre antes; verificaremos con un test.

### Fuera de alcance

- No se toca el composer del front (`compileQuestion.ts`); ya emite `entre <from> y <to>` que es el formato natural en español.
- No se modifica el reconciliador (`reconcileWindow`) ni los límites de paginación.