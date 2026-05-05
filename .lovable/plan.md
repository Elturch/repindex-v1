# Visor de Informes RIX (sustituye a /chat en navegación)

## Concepto

`/chat` se conserva intacto técnicamente (motor V2, ChatContext, persistencia, exportaciones) pero **se oculta de la navegación**. En su lugar aparece el **Visor de Informes RIX** en la nueva ruta `/visor`, que reutiliza por dentro el mismo `ChatContext` para mostrar los informes generados desde `/informes`, con una **memoria de informes cargados** que permite alternar entre ellos sin perderlos.

El flujo del usuario queda:

```text
/informes  →  Construye con 11 filtros  →  [Generar informe]
    │
    ▼
/visor     →  Renderiza la narrativa V2 + 9 epígrafes + bibliografía
              Lateral: lista de informes cargados (memoria)
              CTAs: [+ Nuevo informe] [Editar filtros] [Exportar]
```

## Cambios

### 1. Navegación (`src/components/layout/Header.tsx`)
- Ocultar el item "Chat" (no eliminar la ruta).
- Renombrar "Informes RIX" → **"Crear informe"** (`/informes`).
- Añadir nuevo item **"Visor de informes"** (`/visor`, icono `FileText`).
- `/chat` sigue accesible escribiendo la URL o desde "Mis conversaciones".

### 2. Nueva ruta y página `/visor` (`src/pages/RixViewer.tsx`)
Layout de dos columnas:

```text
┌──────────────────────────────────────────────────────────────┐
│ Visor de Informes RIX            [+ Nuevo informe] [Export▾] │
├────────────────┬─────────────────────────────────────────────┤
│ Memoria        │  ReportInfoBar (entidad · timeframe · IAs)  │
│ ──────────     │  ─────────────────────────────────────────  │
│ ● Informe #3   │                                             │
│   IBEX-35      │   [Aquí se renderiza el informe activo:    │
│   Ranking top5 │    ChatMessages reutilizado, sin input]    │
│   12:04        │                                             │
│ ○ Informe #2   │   - Headline                                │
│   Telefónica   │   - Diagnóstico                             │
│   Comparativa  │   - 6 modelos IA                            │
│ ○ Informe #1   │   - Patrones                                │
│   Banca · Evo  │   - Bibliografía verificada                 │
│                │                                             │
│ [Limpiar mem.] │   [Editar filtros de este informe]          │
└────────────────┴─────────────────────────────────────────────┘
```

- Estado vacío: tarjeta con "Aún no has generado ningún informe" + CTA grande **"Crear informe RIX"** → `/informes`.
- "Editar filtros" navega a `/informes` con `state.prefilFilters` para rehidratar.
- "+ Nuevo informe" navega a `/informes` con estado limpio.

### 3. Memoria de informes cargados
- Nuevo store ligero `src/lib/reports/reportMemory.ts`:
  - `localStorage` (clave `rix:viewer:memory`), array de objetos:
    ```ts
    { id, createdAt, title, filters: FilterState, question: string,
      sessionId: string, summary?: { entity, intent, window } }
    ```
  - API: `addReport`, `listReports`, `removeReport`, `clearAll`, `getActiveId`, `setActiveId`.
- Cuando se genera un informe desde `/informes`:
  - `RixReports.tsx` añade entrada a la memoria **antes** de navegar y pasa `reportId` en `state`.
- Cuando se entra en `/visor`:
  - Se lista la memoria en la columna izquierda (tarjetas seleccionables).
  - Al hacer click en una tarjeta, se carga la `sessionId` correspondiente en `ChatContext` y se renderiza con `ChatMessages`.
- "Limpiar memoria" vacía la lista local sin borrar las conversaciones del backend.

### 4. Integración con `ChatContext`
- Reutilizar el provider y `ChatMessages` tal cual (sin tocar el motor).
- Necesitamos exponer/usar un método para **cargar una `sessionId` existente** al cambiar de informe en la memoria. Si `ChatContext` ya soporta `setSessionId` o equivalente, se usa; si no, se añade un setter mínimo (cargar mensajes históricos de esa sesión).
- Verificación previa antes de implementar: leer `src/contexts/ChatContext.tsx` para confirmar el método de carga de sesiones existentes.

### 5. Round-trip "Editar filtros"
- `RixReports.tsx`:
  - Al pulsar "Generar informe": `addReport({ filters, question, ... })` → `navigate("/visor", { state: { autoSendQuestion, reportId } })`.
  - Al montar: si `location.state.prefilFilters` existe, `setState(prefilFilters)`.
- `RixViewer.tsx`:
  - Recibe `autoSendQuestion` igual que hoy hace `ChatIntelligence` y dispara `sendMessage(q)` una sola vez.

### 6. `/chat` (sin cambios funcionales)
- Se mantiene `ChatIntelligence` y la ruta `/chat`.
- Solo deja de aparecer en el menú principal.

## Archivos

**Nuevos**
- `src/pages/RixViewer.tsx` — visor con memoria + render del informe activo.
- `src/lib/reports/reportMemory.ts` — store en `localStorage`.
- `src/components/reports/ReportMemoryList.tsx` — columna lateral.

**Modificados**
- `src/App.tsx` — añadir ruta protegida `/visor` → `RixViewer`.
- `src/components/layout/Header.tsx` — ocultar "Chat", añadir "Visor de informes", renombrar "Informes RIX" a "Crear informe".
- `src/pages/RixReports.tsx` — guardar en memoria + navegar a `/visor` (en lugar de `/chat`); leer `prefilFilters` al montar.
- `src/contexts/ChatContext.tsx` — solo si no existe ya: setter público para cargar una sesión existente por `sessionId`.

## Lo que NO cambia

- Motor V2 (`chat-intelligence-v2`), skills, narrativa de 9 epígrafes, bibliografía.
- `/chat` y su funcionalidad completa (queda accesible por URL).
- `/informes` y los 11 filtros bidireccionales (solo cambia el destino del botón "Generar informe").
- Persistencia de conversaciones en backend ni "Mis conversaciones".
