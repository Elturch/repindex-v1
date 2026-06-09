## Objetivo

Eliminar el doble fallo observado en el informe IBEX-35 YTD:
1. v2 parsea mal el rango temporal (`2026-01-23 → 2026-01-24` en vez de `2026-01-01 → 2026-06-07`).
2. v1 toma "Genera" como ticker y devuelve "Fuera de cobertura".

La optimización de CPU de `sectorRanking` (P1) queda fuera de este plan — se aborda después si vuelve a aparecer el `CPU Time exceeded` con el rango correcto ya parseado.

## Cambios

### 1. Parser temporal — `chat-intelligence-v2/parser/temporalParser.ts` (o equivalente)

Añadir regla de **máxima prioridad** que detecte rangos ISO explícitos en la pregunta antes de aplicar cualquier heurística de "lo que va de año" / "year to date":

```
/\bentre\s+(\d{4}-\d{2}-\d{2})\s+y\s+(\d{4}-\d{2}-\d{2})\b/i
/\bdesde\s+(\d{4}-\d{2}-\d{2})\s+(?:hasta|a)\s+(\d{4}-\d{2}-\d{2})\b/i
/\bdel?\s+(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})\b/i
```

Si matchea → `from = match[1]`, `to = match[2]`, `mode = "period"`, saltar el resto de heurísticas. Esto cubre los informes generados desde `/informes` (que siempre incluyen el rango ISO explícito).

### 2. Bloquear fallback v1 para queries multi-entidad — `src/contexts/ChatContext.tsx`

En la rama de fallback (`v2 failed, retrying with v1 fallback`), antes de llamar a v1 detectar si la pregunta es de **scope grupal** y, en ese caso, NO degradar a v1 — mostrar error claro al usuario:

```ts
const isGroupScope = /\b(IBEX-?35|universo|todos los|todas las|ranking|sector\s+\w+|subsector)\b/i.test(query);
if (isGroupScope) {
  throw new Error("El informe agregado no se ha podido generar. Reintenta en unos segundos o reduce el alcance temporal.");
}
```

Razón: v1 no soporta análisis multi-entidad ni rankings agregados; siempre devolverá "Fuera de cobertura" con un ticker inventado.

### 3. Mensaje de error UX (RixViewer)

`RixViewer.tsx` debe pintar el mensaje de error anterior tal cual (no como respuesta del asistente), con un botón "Reintentar" que reuse el mismo `originalQuestion`. Sin cambios de lógica adicionales.

## Verificación

1. Generar desde `/informes` informe IBEX-35 YTD → logs de v2 deben mostrar `from=2026-01-01 | to=2026-06-07` (no `2026-01-23`).
2. Si v2 sigue agotando CPU (P1 pendiente), el usuario verá el mensaje claro de reintento — no la respuesta absurda "No tengo a «Genera» en el índice".
3. Test directo: pregunta puntual "reputación de Iberdrola en 2026-05-10" sigue funcionando (snapshot path intacto).

## Fuera de alcance

- Optimización de payload de `sectorRanking` para IBEX-35 completo (P1, abordable después con paginación o agregación SQL en `rix_runs_v2`).
- Cambios en v1.
- Cambios en el visor más allá del mensaje de error.
