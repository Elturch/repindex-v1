

El usuario propone una solución muy razonable: mantener el orden actual del dashboard (por RIX simple) como vista por defecto, y añadir un toggle/botón "Consenso IAs" que reordene por la métrica de consenso (la que usa el agente Rix). Así ambas vistas conviven sin romper expectativas.

Esto resuelve el problema de raíz: en vez de forzar al agente y al dashboard a usar el mismo criterio (lo que rompería una de las dos lógicas), se hace explícito que hay **dos formas legítimas de rankear** y el usuario elige cuál ver.

## Plan: Toggle "Consenso IAs" en el dashboard

### Comportamiento

**Modo por defecto (RIX simple):**
- Top 5 IBEX ordenado por `rix_score` descendente (lo que se ve hoy: BBVA, Merlin, Acerinox, Bankinter, Rovi).
- Etiqueta visible: "Ranking por puntuación RIX".

**Modo Consenso IAs (al activar el toggle):**
- Top 5 IBEX ordenado por `consensus_level` (alto → bajo) y luego por `majority_block_score`.
- Etiqueta visible: "Ranking por consenso entre 6 IAs".
- Pequeño tooltip explicativo: "Prioriza empresas con menor dispersión entre los 6 modelos de IA. Es el mismo criterio que usa el Agente Rix."

El toggle aplica a **las 10 mini-tablas** (Top/Bottom IBEX, Top/Bottom Resto, Movers, etc.) para mantener coherencia visual.

### Cambios técnicos

#### 1. Hook `useLandingTopFives.ts`
- Aceptar segundo parámetro `mode: "score" | "consensus"`.
- Cuando `mode === "consensus"`, traer también `consensus_level` y `majority_block_score` (calculado desde `rix_runs_v2` por empresa/semana, agrupado).
- Cambiar el `.order()` y la lógica de `slice(0, 5)` según el modo.

#### 2. Componente `MiniTablesGrid.tsx`
- Añadir estado local `rankingMode` con valor por defecto `"score"`.
- Renderizar un `<Switch>` (shadcn) junto al `AIModelSelector` con label "Consenso IAs".
- Pasar el modo al hook.
- Mostrar el badge de la métrica usada bajo el título de cada tabla ("RIX" vs "Bloque mayoritario").

#### 3. Vista SQL (defensivo, opcional)
- Crear `rix_trends_consensus` que precalcule por empresa/semana: `majority_block_score` y `consensus_level`. Evita calcularlo en el cliente y mantiene rendimiento.

### Lo que NO cambia
- El agente Rix sigue ordenando por consenso (ya es su comportamiento). Solo se documentará en el prompt que la métrica mostrada se llama "RIX bloque mayoritario" para que el usuario entienda la diferencia con el dashboard.
- Las URLs y el resto de páginas no se tocan.

### Archivos afectados
1. `src/hooks/useLandingTopFives.ts` — añadir parámetro `mode` y lógica de consenso.
2. `src/components/landing/MiniTablesGrid.tsx` — toggle UI + badge métrica.
3. `supabase/functions/chat-intelligence/index.ts` — refinar el prompt para etiquetar la métrica como "RIX bloque mayoritario" (no inventar rangos).
4. Migración SQL — vista `rix_trends_consensus` (opcional, mejora rendimiento).

### Verificación
- En `/` (landing) y `/dashboard`, alternar el toggle y comprobar que el orden cambia coherentemente.
- Pedir al agente "top 5 IBEX" y confirmar que su Top 5 coincide con el dashboard **en modo Consenso IAs**.
- Tooltip del toggle visible en hover.

