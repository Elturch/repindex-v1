

El usuario tiene razón. Metí todo el `MiniTablesGrid` (las 10 tablas de la home) en el Dashboard, cuando lo que pidió es solo el **toggle "Consenso IAs"** que reordene las tablas que **ya existen** en el dashboard.

Necesito explorar qué hay actualmente en `Dashboard.tsx` para entender qué tablas reordenar.

Voy a inspeccionar el código antes de planificar.

---

Tras revisar `src/pages/Dashboard.tsx` y los hooks que alimentan sus tablas (`useUnifiedRixRuns`, `useUnifiedMarketAverages`, etc.), el dashboard tiene sus propias tablas/rankings independientes de la home. Lo correcto es:

## Plan: Toggle "Consenso IAs" nativo del Dashboard

### Revertir el error
1. **`src/pages/Dashboard.tsx`** — quitar el `<MiniTablesGrid />` y el `<LandingAIModelProvider>` que añadí en los pasos anteriores. El dashboard vuelve a su estado original.

### Añadir el toggle al Dashboard
2. **`src/pages/Dashboard.tsx`** — añadir un `<Switch>` "Consenso IAs" en la barra de controles superior del dashboard (junto al selector de modelo / filtros existentes), con el mismo tooltip explicativo que en la home:
   > "Prioriza empresas con menor dispersión entre los 6 modelos de IA. Es el mismo criterio que usa el Agente Rix."
3. Estado local `rankingMode: "score" | "consensus"` (default `"score"`).
4. Cuando `consensus` esté activo, **deshabilitar visualmente el selector de modelo IA** (igual que en la home) porque el consenso usa los 6 modelos.

### Aplicar el orden a las tablas existentes del Dashboard
5. Identificar en `Dashboard.tsx` las tablas/rankings que se renderizan (Top, Bottom, Movers, etc. construidas a partir de `useUnifiedRixRuns` / hooks similares) y, antes de pasarlas al render, aplicar la misma función de ordenación que ya existe en `useLandingTopFives.ts`:
   - Modo `score`: orden actual (por `rix_score` desc).
   - Modo `consensus`: agrupar por empresa, calcular `majorityScore` (media del bloque mayoritario, descartando outliers cuando hay ≥4 modelos) y `consensusLevel` (alto/medio/bajo según rango), y ordenar por `consensusLevel` y luego por `majorityScore`.
6. **Extraer la lógica de consenso** de `useLandingTopFives.ts` a un helper compartido `src/lib/consensusRanking.ts` para que tanto la home como el dashboard usen exactamente el mismo algoritmo (single source of truth).

### Etiquetado visual
7. Mostrar bajo el título de cada tabla del dashboard un pequeño badge dinámico:
   - `score` → "RIX (modelo X)"
   - `consensus` → "RIX bloque mayoritario · 6 IAs"

### Verificación
- En `/dashboard`, activar el toggle y comprobar que **todas las tablas** se reordenan sin recargar nuevos datos ni añadir secciones de la home.
- Confirmar que el orden en modo consenso coincide con el del Agente Rix para Top 5 IBEX.
- Confirmar que la home (`/`) sigue funcionando igual.

### Archivos afectados
1. `src/pages/Dashboard.tsx` — quitar `MiniTablesGrid`, añadir toggle + aplicar ordenación.
2. `src/lib/consensusRanking.ts` (nuevo) — helper compartido.
3. `src/hooks/useLandingTopFives.ts` — refactor mínimo para usar el helper compartido.

