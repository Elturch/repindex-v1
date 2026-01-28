
## Diagnóstico (por qué “no se mueve nada” aunque salga el toast)
Ahora mismo el botón **sí está creando el trigger**, pero:
1) En tu BD hay un `cron_triggers` **en estado `pending`** (lo he comprobado).  
2) El procesamiento de `cron_triggers` en `rix-batch-orchestrator` **solo ocurre cuando la función se invoca con `trigger: 'watchdog'`**.  
   - Cuando tú “actualizas” en la UI, el panel llama a `rix-batch-orchestrator` con `{ get_status: true }`, y en ese modo **no procesa triggers**.
3) Además, el contador de “pendientes” del panel de análisis V2 cuenta *todo lo que no tiene `09_rix_score`*, pero **solo una parte es “analizable”** (tiene `20_res_gpt_bruto` y por tanto `rix-analyze-v2` puede recalcularlo).  
   - En este momento hay **muy pocos “pendientes analizables”** (he visto ~11), así que aunque el repair corra, el número grande del panel puede no cambiar como esperas.

Resultado: ves el toast de “programado”, pero si no entra un “watchdog” en ese rato (o entra tarde), el trigger sigue `pending` y los números no cambian; y aun cuando se procese, puede que cambie poco.

---

## Objetivo de la mejora
Que el admin **muestre progreso real** (estado del trigger y cuántos pendientes son realmente procesables) y que tengas un botón para **ejecutar el trigger “ahora”** (sin depender del watchdog/cron).

---

## Cambios propuestos (implementación)

### 1) Backend: permitir “procesar triggers ahora” desde el panel
**Archivo:** `supabase/functions/rix-batch-orchestrator/index.ts`

- Añadir un modo explícito para procesar solo triggers, por ejemplo:
  - `trigger: 'process_triggers'` o un boolean `process_triggers_only: true`
- En ese modo la función hará:
  - `processCronTriggers(...)`
  - devolverá `{ triggersProcessed: [...], success: true }`
  - **no** ejecutará barrido de empresas (para que sea rápido y seguro).

Esto permite que el panel, tras crear el trigger, dispare una ejecución controlada que lo procese inmediatamente.

---

### 2) Backend: endurecer seguridad del Edge Function `admin-cron-triggers`
**Archivo:** `supabase/functions/admin-cron-triggers/index.ts`

Ahora mismo el allowlist acepta cualquier `*.lovable.app`, lo que incluye **producción** (`repindex-v1.lovable.app`). Como esta función usa **service role**, eso es demasiado permisivo.

- Cambiar `isAllowedOrigin()` para que:
  - Permita `localhost`, `127.0.0.1`, `*.lovableproject.com`, `lovable.dev`
  - Permita `*.lovable.app` **solo si** el host contiene `preview` (ej: `id-preview--...lovable.app`)
  - Si no hay `origin`/`referer`, denegar por defecto
- (Opcional pero recomendado) exigir autenticación:
  - leer `Authorization: Bearer <jwt>`
  - validar usuario con `supabaseAdmin.auth.getUser(token)`
  - comprobar rol admin (tabla `user_roles` / función existente `has_role`) y si no, `403`

**Archivo:** `supabase/config.toml`
- Añadir sección:
  - `[functions.admin-cron-triggers] verify_jwt = false`
  (y validar JWT manualmente en el código, si activamos la comprobación)

---

### 3) Frontend: mostrar estado del trigger y progreso (para que “se vea”)
**Archivo:** `src/components/admin/SweepMonitorPanel.tsx`

#### 3.1. Añadir “Estado de Reparación”
- Crear estado local `repairTrigger` con:
  - `id`, `status`, `created_at`, `processed_at`, `result`
- Añadir una función `fetchLatestRepairTrigger()` que lea el último trigger `repair_analysis`
  - O bien por tabla (si el usuario siempre está logueado y RLS permite)
  - O mejor: ampliar `admin-cron-triggers` para aceptar `action: 'get_latest'` y devolver el último trigger (así no dependemos de RLS)

#### 3.2. Polling automático tras programar reparación
Después de pulsar “Completar Análisis Pendientes”:
- Guardar el `trigger.id` devuelto
- Lanzar polling cada 5s durante 60–120s:
  - refrescar estado del trigger
  - si pasa a `completed/failed`, parar polling y refrescar `fetchAnalysisStatus()`

Así el usuario ve:
- `pending -> processing -> completed` (o `failed`) aunque el score tarde.

#### 3.3. Botón “Procesar ahora”
Añadir un botón junto al de reparación:
- “Procesar ahora (sin esperar cron)”
- Llama a `supabase.functions.invoke('rix-batch-orchestrator', { body: { trigger: 'process_triggers' }})`
- Luego refresca `fetchLatestRepairTrigger()` y `fetchAnalysisStatus()`

Esto elimina la dependencia del schedule y hace que “Actualizar” tenga efecto real.

---

### 4) Frontend: separar “Pendientes” en 2 métricas (clave para evitar confusión)
**Archivo:** `src/components/admin/SweepMonitorPanel.tsx`

Modificar `fetchAnalysisStatus()` para traer campos extra y calcular:
- **Pendientes totales**: `09_rix_score IS NULL`
- **Pendientes analizables**: `09_rix_score IS NULL AND 20_res_gpt_bruto IS NOT NULL`
- **Pendientes sin datos (no analizables)**: `09_rix_score IS NULL AND 20_res_gpt_bruto IS NULL`
- También por modelo (para que Grok quede claro si lo que falta es búsqueda vs análisis)

Actualizar el UI para:
- Mostrar ambos contadores
- Cambiar el texto del botón a algo tipo:
  - “Completar análisis (solo analizables)”
- En el toast indicar cuántos registros se intentarán procesar realmente.

---

## Cómo validaremos que queda resuelto (checklist)
1) Pulsas “Completar Análisis Pendientes” y aparece “Trigger creado: <id>”.
2) En “Estado de Reparación” ves el trigger en `pending`.
3) Pulsas “Procesar ahora” y el trigger pasa a `processing` y luego `completed` (o muestra error claro).
4) El contador de “Pendientes analizables” baja (y, si procede, el total con score sube).
5) Verificación de seguridad: desde el dominio publicado **no** debe permitir origin (y si activamos auth+rol, sin admin no debe dejar).

---

## Archivos a tocar
- `supabase/functions/rix-batch-orchestrator/index.ts` (nuevo modo: procesar triggers bajo demanda)
- `supabase/functions/admin-cron-triggers/index.ts` (allowlist estricta + opcional auth/rol + endpoint para status)
- `supabase/config.toml` (añadir sección de función `admin-cron-triggers`)
- `src/components/admin/SweepMonitorPanel.tsx` (UI: estado trigger, polling, botón procesar ahora, métricas “analizable/no-analizable”)

---

## Nota importante (contexto del “cron”)
Aunque tengas un watchdog programado “cada 5 min”, en la práctica ahora mismo no se está ejecutando con esa frecuencia (en logs solo aparece una invocación). Con el botón “Procesar ahora”, el sistema funciona igual incluso si el scheduling falla o se retrasa.
