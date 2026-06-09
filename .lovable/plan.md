# Diagnóstico

En `src/lib/reports/coherenceEngine.ts` (regla **R-sub-1**, líneas 182-199) cuando el usuario marca un subsector (p.ej. "Banca Comercial"), el motor de coherencia rellena automáticamente el campo Sector con el sector padre ("Banca y Servicios Financieros") y lo marca como `origin="derived"`. Por eso aparece en el panel aunque el usuario no lo haya tocado.

Ese auto-derive es innecesario para la pregunta final:
- `compileQuestion.ts` (L65-68) ya prioriza subsector sobre sector — si hay subsector, ignora sector.
- `buildReportTitle` (`reportMemory.ts:176-179`) también prioriza subsector.

Por tanto el sector derivado no aporta nada al informe; solo ensucia visualmente el filtro y puede dar lugar a que el LLM use "sector Banca y Servicios Financieros" como `scopeLabel` en vez de "subsector Banca Comercial".

# Fix propuesto (sub-commit atómico)

Único archivo: **`src/lib/reports/coherenceEngine.ts`**.

## Cambio

Eliminar/desactivar la regla **R-sub-1** (auto-derive sector desde subsector). El subsector deja de "tirar" del sector hacia arriba. El sector queda vacío salvo que el usuario lo marque explícitamente.

Conservamos:
- **R-sub-2** (líneas 201-…): si sector user-set y subsector no encaja, sigue limpiando. Sin cambios.
- **R1** (ascendente desde tickers): sigue infiriendo sector/subsector desde empresas concretas, que es lo esperado al elegir empresas.

## Impacto downstream

Verificado: nada se rompe.
- `compileQuestion.ts:65-68` → ya usa subsector si existe.
- `reportMemory.ts:buildReportTitle` → ya prioriza subsector.
- `rankingMode.ts` `scopeLabel` → vendrá ahora como "subsector Banca Comercial" (correcto), no como "sector Banca y Servicios Financieros".
- `FilterPanel.tsx` → el campo Sector mostrará "Todos los sectores" en placeholder; el chip de subsector mantiene su valor.

## Verificación

1. Ir a `/informes`, marcar "Banca Comercial" en Subsector.
2. Campo Sector debe quedar vacío (placeholder "Todos los sectores").
3. Generar informe → pregunta compilada contiene "del subsector Banca Comercial" (no "del sector Banca y Servicios Financieros").
4. Título del informe en `/visor` → "Visión general · Banca Comercial".
5. Probar también el camino opuesto: marcar empresas concretas → R1 sigue rellenando sector/subsector como antes (esto NO cambia).

## Fuera de scope

- Cambiar la pantalla `/informes` para ocultar visualmente el sector cuando hay subsector (no hace falta tras este fix: el sector quedará vacío de forma natural).
- Bug de duplicados de `rix_reports` (señalado antes, sigue pendiente y aparte).

¿Procedo?