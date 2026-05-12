
# Paso 2.5 — Aislamiento estricto Fase 2 vía header

Diseño confirmado conforme al brief del usuario. Objetivo: que los 3 flags Fase 2 (`ENRICH_RANKING_SUBMETRICS`, `TINY_UNIVERSE_GUARD`, `EXEC_NARRATIVE`) puedan activarse en el único entorno Supabase disponible **sin afectar a un solo usuario real**, exigiendo un header secreto que sólo emite el `StressTestsPanel` interno.

---

## 1. Contrato de aislamiento

Variables de entorno nuevas (Supabase Secrets):

| Secret | Default | Tipo | Rol |
|---|---|---|---|
| `PHASE2_STAGING_ONLY` | **`true`** | bool | Maestro. Mientras `true`, los 3 flags Fase 2 sólo se evalúan si la request trae header válido. |
| `STRESS_TESTS_HEADER_TOKEN` | (generar aleatorio 32+ chars al setearlo) | string | Token compartido. Comparación por igualdad estricta (`===`). |

Header HTTP nuevo:

- `x-repindex-stress: <token>` — único modo de "desbloquear" la lectura real de los 3 flags Fase 2 mientras `PHASE2_STAGING_ONLY=true`.

Tabla de verdad efectiva de cada flag Fase 2 (`ENRICH_RANKING_SUBMETRICS` / `TINY_UNIVERSE_GUARD` / `EXEC_NARRATIVE`):

```text
PHASE2_STAGING_ONLY  header válido  Secret flag  →  efectivo
true (default)       no             true/false    →  false   ← USUARIOS REALES
true                 sí             true          →  true    ← runner stress
true                 sí             false         →  false
false                cualquiera     true          →  true    ← modo "abierto" futuro
false                cualquiera     false         →  false
```

**Regla de oro:** un usuario real **nunca** envía el header → flags Fase 2 efectivos = `false` siempre, independientemente del Secret. Comportamiento idéntico al baseline 21:19:05.

---

## 2. Archivos a crear / modificar

### Crear

- `supabase/functions/chat-intelligence-v2/scope/policies/phase2IsolationPolicy.ts`
  - `export const PHASE2_ISOLATION_HEADER = "x-repindex-stress" as const;`
  - `export const PHASE2_ISOLATION_VERSION = 1 as const;`
  - Documentación en cabecera del archivo: contrato de aislamiento, tabla de verdad, criterios de rollback.

- `supabase/functions/chat-intelligence-v2/scope/headerGate.ts`
  - `export interface RequestHeaderContext { phase2_unlocked: boolean }`
  - `export function buildHeaderContext(headers: Headers | null | undefined): RequestHeaderContext`
    - Lee `PHASE2_STAGING_ONLY` (default `true`) y `STRESS_TESTS_HEADER_TOKEN`.
    - Si `PHASE2_STAGING_ONLY=false` → `phase2_unlocked = true` (modo abierto).
    - Si `PHASE2_STAGING_ONLY=true`:
      - Si no hay token Secret configurado → `phase2_unlocked = false` (fail-closed).
      - Sino comparar `headers.get("x-repindex-stress") === token` con `===`. Vacío/null → `false`.
  - Pure, sin I/O excepto `Deno.env.get`.

### Modificar

- `supabase/functions/chat-intelligence-v2/scope/featureFlags.ts`
  - Mantener `isXxxEnabled()` legacy para compat (devolver el Secret crudo sin gating).
  - **Añadir** variantes con sufijo `WithContext`:
    - `isEnrichRankingSubmetricsEnabledWithContext(ctx)`
    - `isTinyUniverseGuardEnabledWithContext(ctx)`
    - `isExecNarrativeEnabledWithContext(ctx)`
    - Cada una: `return ctx.phase2_unlocked && readBool("...");`
  - Ampliar `scopeFlagsSnapshot(ctx?)` para devolver tanto el `raw` como el `effective` por flag, plus `phase2_isolation_active: boolean` y `phase2_unlocked: boolean`.

- `supabase/functions/chat-intelligence-v2/index.ts`
  - Línea ~89: ya se leen headers. Construir `const headerCtx = buildHeaderContext(req.headers);` antes del `orchestratorProcess`.
  - Pasar `headerCtx` como nuevo campo del último argumento (`{ user_id, session_id, headerCtx }`).
  - Emitir `meta.phase2_isolation_active` en frame `done` (telemetría mínima).

- `supabase/functions/chat-intelligence-v2/orchestrator.ts`
  - Aceptar `headerCtx` en la firma de `process(...)` (opcional, default `{ phase2_unlocked: false }`).
  - Sustituir las 4 llamadas detectadas (líneas 757, 773, 849, 876, 968) por las variantes `WithContext(headerCtx)`.
  - Inyectar `phase2_isolation_active = (env.PHASE2_STAGING_ONLY default true) === true` y `phase2_unlocked = headerCtx.phase2_unlocked` en el `meta` final del result.

- `src/components/admin/StressTestsPanel.tsx`
  - Añadir constante local `STRESS_HEADER_NAME = "x-repindex-stress"`.
  - Recuperar el token desde un input controlado en el panel (almacenado solo en `useState`, **nunca** en localStorage ni en código). El admin lo pega manualmente la primera vez por sesión de navegador.
  - El runner se invoca vía `supabase.functions.invoke("stress-matrix-runner", { body, headers: { [STRESS_HEADER_NAME]: token } })`.
  - El campo del token se muestra como `<input type="password">` con botón "Limpiar".

- `supabase/functions/stress-matrix-runner/index.ts`
  - Leer `req.headers.get("x-repindex-stress")` y reenviarlo a cada `fetch` interno contra `chat-intelligence-v2` (header passthrough). Si falta y la family es `phase2-*`, abortar el run con error claro `phase2_header_missing`.
  - No es necesario que el runner valide el token (lo valida el destino).

- `supabase/functions/stress-matrix-runner/asserts.ts`
  - Sin cambios funcionales. Verificar que ningún assert dependa de leer flags Secret directamente — debe leer `meta.*` que ya emite el orchestrator.

### NO se tocan

- `sectorRanking.ts`, `periodEvolution.ts`, `sanitizeFinalMarkdown`, `outputGuard`, `*.scoped.ts` legacy.
- `USE_SCOPED_SKILLS`, `FREEZE_COSMETIC_INJECTORS`.
- Asserts S1–S5 + SQL_DIFF.
- Composite gating Fase 1.
- Inyectores cosméticos.

---

## 3. Defaults consolidados (post-Paso 2.5)

| Flag | Default Secret | Efectivo para usuario real | Efectivo runner stress con header |
|---|---|---|---|
| `PHASE2_STAGING_ONLY` | `true` | n/a | n/a |
| `STRESS_TESTS_HEADER_TOKEN` | unset al merge → set manual antes de gates 3-5 | n/a | n/a |
| `ENRICH_RANKING_SUBMETRICS` | `false` | `false` | sólo `true` si Secret=`true` |
| `TINY_UNIVERSE_GUARD` | `false` | `false` | sólo `true` si Secret=`true` |
| `EXEC_NARRATIVE` | `false` | `false` | sólo `true` si Secret=`true` |

---

## 4. Garantía de regresión cero

- Camino "usuario real" (sin header): `phase2_unlocked=false` → las 3 funciones `WithContext` devuelven `false` antes de leer el Secret. Bypass total del enriquecimiento, del guard, del prelude y del validador. El path de ejecución es **byte-a-byte el de Fase 1**.
- Las funciones legacy `isXxxEnabled()` se conservan únicamente para no romper imports; **no se llaman** desde el orchestrator. Marcar con `@deprecated — use *WithContext`.
- Snapshot diferencial: con `PHASE2_STAGING_ONLY=true` y los 3 Secrets en `false`, `phase1-full` SIN header debe igualar baseline 21:19:05 / 22:54:43.

---

## 5. Telemetría mínima (auditoría)

`meta` añade en cada respuesta:

```json
{
  "phase2_isolation_active": true,
  "phase2_unlocked": false,
  "phase2_flags_effective": {
    "enrich_ranking_submetrics": false,
    "tiny_universe_guard": false,
    "exec_narrative": false
  }
}
```

Estos campos viajan en el frame `done` SSE y se persisten en `chat_logs.scope_audit.phase2_isolation`.

---

## 6. Criterios de cierre formal del Paso 2.5 (Gate E4 reforzado)

1. `phase1-full` SIN header → 21/21 verde, idéntico a baseline. (validación regresión cero)
2. `phase1-full` CON header válido y los 3 Secrets en `false` → 21/21 verde, `meta.phase2_unlocked=true` pero `phase2_flags_effective` todos `false`. (valida que header solo no activa nada)
3. `phase1-full` SIN header con `STRESS_TESTS_HEADER_TOKEN` mal escrito → 21/21 verde (header inválido = mismo efecto que sin header).
4. Inspección de `meta.phase2_isolation_active` en respuestas reales del preview → siempre `true` mientras `PHASE2_STAGING_ONLY=true`.

Sólo cuando los 4 verdes el usuario procede con Gate 3 (TINY) bajo el nuevo protocolo aislado.

---

## 7. Nuevo protocolo de Gates 3-4-5 (post 2.5)

Para cada gate, en este orden estricto:

1. Set Secret correspondiente (`TINY_UNIVERSE_GUARD` / `EXEC_NARRATIVE` / `ENRICH_RANKING_SUBMETRICS`) = `true`. `PHASE2_STAGING_ONLY` permanece `true`. Token sin tocar.
2. Esperar propagación <5 min.
3. Lanzar **en paralelo** desde `/admin`:
   - `phase2-tiny|exec|full` CON header → debe pasar el assert correspondiente.
   - `phase1-full` SIN header → debe seguir 21/21 (valida aislamiento bidireccional en vivo).
4. Si ambos verdes → Secret a `false` antes del siguiente gate.
5. Si alguno rojo → `false` inmediato + diagnóstico (violations / numbers_unmatched / attempts).

---

## 8. Rollback (E5 ampliado)

| Vector | Acción | Tiempo |
|---|---|---|
| Algún flag Fase 2 funciona mal incluso aislado | Secret de ese flag → `false` | <5 min |
| El gating de header se rompe (ej. token leak) | Rotar `STRESS_TESTS_HEADER_TOKEN` | <5 min |
| Sospecha de fuga global del aislamiento | `PHASE2_STAGING_ONLY=false` jamás se activa hasta cierre formal Fase 2 | n/a |
| Revertir Paso 2.5 entero | `git revert` de los commits del paso + redeploy automático | <15 min |

---

## 9. Orden de ejecución (cuando autorices)

1. Implementar archivos de la sección 2 en un solo paso atómico.
2. Esperar deploy automático de las 2 edge functions afectadas.
3. **Antes de tocar Secrets**: pedirte que añadas `STRESS_TESTS_HEADER_TOKEN` (vía `add_secret`, valor que tú generas) y confirmes `PHASE2_STAGING_ONLY` en `true` (también nuevo, vía `add_secret`).
4. Tú lanzas los 4 sub-gates de la sección 6.
5. Si los 4 verdes → reanudamos Gates 3-4-5 con el protocolo de la sección 7.
6. Si los 5 gates Fase 2 verdes → entrego checklist D+0/D+7/D+14 sin ejecutar.

No se modifica nada hasta tu "adelante" explícito sobre este plan.
