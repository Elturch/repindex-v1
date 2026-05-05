# Plan de corrección quirúrgica — /informes y /visor

## 1) Causa raíz por incidencia

**A. Búsqueda no encuentra "Telefonica" → "Telefónica"**
`MultiChipSelect` usa `cmdk` (`Command`) con su filtro por defecto, que es case-insensitive pero **accent-sensitive**. El `value` que se compara es `opt.label` (sin normalizar). Por eso "Telef" hace match (substring directa) y "Telefonica" no (la fuente tiene "ó").

**B. Query residual al cerrar popover**
`MultiChipSelect` no controla el valor de `CommandInput`; cuando el `Popover` se cierra, `cmdk` mantiene su estado interno de búsqueda y, al reabrir cualquier instancia (o saltar entre filtros), aparece el último texto. Además, `CommandItem` con `onSelect` puede dispararse vía Enter sobre el primer match aunque el usuario no haya navegado por la lista, por la lógica de "auto-highlight" de cmdk.

**C. "IBEX-35" sale aunque no se haya elegido universo**
En `compileFiltersToQuestion` (`src/lib/reports/compileQuestion.ts`), el `else` final fuerza `"del IBEX-35"` cuando no hay universo/sector/subsector/tickers. Debe emitirse una etiqueta neutral ("de todos los universos cotizados").

**D. Coherencia bidireccional**
No requiere cambios. La fix B no toca `coherenceEngine.ts` ni el `FilterState`.

---

## 2) Archivos a tocar

1. **`src/lib/utils.ts`** — añadir `normalizeText(value: string): string` (trim + lowercase + NFD + strip diacritics). Pequeña utilidad reutilizable.

2. **`src/components/reports/MultiChipSelect.tsx`** *(núcleo de A + B)*
   - Importar `normalizeText`.
   - Pasar `filter` custom a `<Command>`: `(value, search) => normalizeText(value).includes(normalizeText(search)) ? 1 : 0`.
   - Incluir `ticker` (hint) en el string buscable: en `CommandItem`, usar `value={normalizeText(`${opt.label} ${opt.hint ?? ""}`)}` para que coincida tanto por nombre como por ticker, sin cambiar lo que se ve.
   - Controlar el input: `const [search, setSearch] = useState("")`; pasar `value={search}` y `onValueChange={setSearch}` a `CommandInput`.
   - En `onOpenChange` del `Popover`: al cerrar, `setSearch("")`. También limpiar tras cada `toggle` (selección).
   - Sin cambios visuales.

3. **`src/lib/reports/compileQuestion.ts`** *(C)*
   - Reemplazar el `else { parts.push("del IBEX-35"); }` final por `parts.push("de todos los universos cotizados");` (o equivalente neutral). Mantener intacta la rama cuando `universe.value` contiene `"IBEX-35"` explícito.

4. *(Opcional mínimo, solo si afecta a C visualmente)* **`src/components/reports/LivePreview.tsx`** — no requiere cambios; los `Badge` no muestran universo por defecto. **No se toca.**

No se modifica `coherenceEngine.ts`, `filterState.ts`, `FilterPanel.tsx`, `RixViewer.tsx`, `RixReports.tsx`, `ChatContext.tsx`.

---

## 3) Detalle técnico de los cambios

### `utils.ts`
```ts
export function normalizeText(value: string): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
```

### `MultiChipSelect.tsx` (cambios mínimos)
- `<Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>`
- `<Command filter={(val, q) => normalizeText(val).includes(normalizeText(q)) ? 1 : 0}>`
- `<CommandInput value={search} onValueChange={setSearch} ... />`
- `<CommandItem value={`${opt.label} ${opt.hint ?? ""}`} onSelect={() => { toggle(opt.value); setSearch(""); }}>`
- Para evitar autoselección por Enter con un único residuo: como el input se limpia al cerrar y al seleccionar, el riesgo desaparece. No se modifica el comportamiento de teclado de cmdk (mantiene "highlight visible → Enter selecciona").

### `compileQuestion.ts`
```ts
} else {
  parts.push("de todos los universos cotizados");
}
```

---

## 4) Riesgos y no regresiones revisadas

- **Top N**: sin cambios en la lógica `topNApplies`. Se conserva.
- **Bypass de normalización LLM en /visor**: sin cambios en `RixViewer.tsx` ni `ChatContext.tsx`.
- **Estado de carga al generar**: sin cambios en `RixViewer.tsx`.
- **Coherencia bidireccional**: sin cambios en `coherenceEngine.ts`.
- **Búsqueda por ticker**: el `value` del `CommandItem` ahora incluye `label + hint`, así que tanto "Telefónica" como "TEF" siguen funcionando.
- **Selectores que NO usan `MultiChipSelect`** (Granularidad, Orden, Tipo de fuente — `Select` de Radix sin buscador): no afectados.
- **Universos múltiples explícitos** (p.ej. usuario elige `IBEX-35`): la rama `universe.value.length > 0` sigue activa antes del `else`.

Validación manual posterior:
1. Visión general IBEX-35 (con universo seleccionado) → compila "del universo IBEX-35". OK.
2. Visión general sin universo → "de todos los universos cotizados". OK.
3. Ranking por sector. OK.
4. Comparativa con 2 empresas (buscar "Telefonica" + "Bbva" sin tildes/mayúsculas). OK.
5. Evolución 90d. OK.
6. Divergencia con todos los modelos sin universo → ya no aparece "IBEX-35" parásito.
7. Perfil de empresa. OK.

---

## 5) Mejoras opcionales no implementadas

- Mostrar el universo (o "Todos los universos") como `Badge` explícito en `LivePreview` para feedback visual.
- Aplicar `normalizeText` también al filtro de `Command` en otros componentes con buscador (p.ej. selects de admin) si existen casos análogos.
- Añadir tests unitarios para `normalizeText` y para `compileFiltersToQuestion` en el caso "sin universo".
