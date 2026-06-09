# Diagnóstico

He revisado la BD (`rix_reports`) y el código del visor. El renombrado **sí persiste cuando se confirma**: el informe más reciente "Banca Comercial" tiene `custom_name="Banca Comercial"` guardado correctamente. El problema es que **solo se guarda si el usuario pulsa Enter o el botón ✓**: no hay autosave al perder el foco. Si el usuario teclea el nuevo nombre y hace clic fuera (en otro informe, en el chat, recarga, etc.), el input desaparece sin enviar el UPDATE.

En la BD se ve el patrón: de los 3 informes recientes con título idéntico "Visión general · Banca Comercial", **solo 1 tiene `custom_name`** poblado. Los otros 2 quedaron en NULL → al recargar el visor, esos 2 vuelven a mostrar el título auto-generado y "parecen" haber perdido el nombre.

Causa secundaria menor: hay 3 filas duplicadas creadas con ~12 ms de diferencia (mismo título, distinto `session_id`). Eso es un bug aparte de la pantalla `/informes` que dispara el insert múltiples veces (probablemente StrictMode + efecto sin guarda). Lo dejo señalado pero **fuera de scope** de este fix.

# Fix propuesto (acotado, sólo `/visor`)

Sub-commit atómico en `src/pages/RixViewer.tsx` — única función `commitRename` + JSX del `<Input>` del renombrado. No toco `reportMemory.ts`, ni RLS, ni el flujo de creación.

## Cambios

1. **Autosave al perder foco** (`onBlur`) en el input de renombrado:
   - Si el valor difiere del original (`entry.customName || entry.title`), confirmar igual que Enter.
   - Si está vacío o es idéntico, cancelar silenciosamente.
   - Guardar el `originalName` en un ref (`renameOriginalRef`) cuando arranca `startRename`, para poder comparar en `commitRename`.

2. **Confirmación visual** con toast en `commitRename`:
   - Éxito → `toast({ title: "Nombre actualizado" })`.
   - Error → toast destructivo con el mensaje del servidor.
   - Requiere que `renameReport` devuelva `{ ok, error }` en vez de `void`. Cambio mínimo en `reportMemory.ts` (solo el tipo de retorno; sigue siendo backwards-compatible donde se ignora el valor).

3. **Guardar el botón ✓ con `onMouseDown` en lugar de `onClick`** para que dispare ANTES del `onBlur` del input y no haya doble commit. (Patrón estándar React.)

4. **Trim defensivo**: si tras `trim()` el valor queda vacío y era distinto del original, interpretarlo como "restaurar al título auto-generado" → pasar `null` a `renameReport` (la función ya hace `trim() || null`, sólo confirmar comportamiento).

## Archivos tocados

- `src/pages/RixViewer.tsx` — `startRename`, `commitRename`, JSX del `<Input>` (4 líneas + handler nuevo).
- `src/lib/reports/reportMemory.ts` — `renameReport` retorna `{ ok: boolean; error?: string }` (cambio de firma trivial, retro-compatible).

## Fuera de scope (señalado, no se toca)

- Duplicados de `rix_reports` creados a los pocos ms (fix iría en `RixReports.tsx` o `addReport`, no en el visor).
- Histórico de "(actualizado) (actualizado) ..." encadenados en `handleRegenerate` (es un bug distinto: cada regen concatena sin idempotencia).

## Verificación

1. Renombrar un informe y hacer clic en otra fila → debe persistir (autosave on blur).
2. Renombrar y pulsar Enter → toast "Nombre actualizado".
3. Renombrar a cadena vacía → vuelve al título auto-generado.
4. Recargar `/visor` → los renombres siguen visibles.
5. `SELECT id, title, custom_name FROM rix_reports ORDER BY created_at DESC LIMIT 5` en BD para confirmar persistencia.

¿Procedo?