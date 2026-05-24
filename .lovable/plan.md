# Auditoría: informe Top 5 IBEX-35 no ejecutado (24-may-2026 ~09:41 Madrid)

## Qué he comprobado hasta ahora

**1. El informe SÍ se creó en BBDD** (`rix_reports`):
- `id`: 51c584a8-c1a8-480a-a0f8-96ff3170a75b
- `created_at`: 2026-05-24 07:41:05 UTC
- `session_id`: a0d4df39-61f9-4991-82b3-645d17af4f84
- `question`: *"Genera un informe ejecutivo del universo IBEX-35 limitado a las 5 mejores entre 2026-04-26 y 2026-05-24 con desglose semanal."*

Es decir, el botón "Generar informe" funcionó, navegó a `/visor` y guardó la entrada. El fallo está **después**, en el disparo de la pregunta al agente.

**2. NO hay invocación de `chat-intelligence-v2` en los logs de las últimas 2-3 horas.** Solo aparecen llamadas a `rix-batch-orchestrator` (barrido W22) y `corporate-scrape-orchestrator`. Es decir: el frontend nunca llegó a llamar al edge function que genera el informe.

**3. `chat_intelligence_sessions` está vacío** para `session_id = a0d4df39…` y para las últimas 3h en general. Confirma que el pipeline nunca corrió.

**4. Barrido W22 ya cerró sano**: 175/175 completed. No es un problema de datos.

**5. Console del cliente muestra un patrón anómalo de churn de auth**:
```
07:41:05  isAuth=true   sessionId=a0d4df39  (nuevo informe creado)
07:41:06  isAuth=false  sessionId=a0d4df39  (sesión revocada)
07:41:06  isAuth=true   sessionId=a0d4df39
07:41:35  isAuth=false  ...                 (otro corte)
07:41:35  isAuth=true
07:41:43  isAuth=false
07:41:43  isAuth=true
07:42:28  isAuth=true   sessionId=573f13b7  (¡aparece un sessionId distinto!)
07:42:29  isAuth=true   sessionId=a0d4df39
```

## Causa raíz probable

En `src/pages/RixViewer.tsx` el envío automático del informe se hace en **dos efectos en cascada**:

```ts
// Step 1: arma el "pending" y llama loadConversation(sessionId)
// Step 2: dispara sendMessage SOLO cuando:
//   - pending existe
//   - userId existe (auth resuelta)
//   - sessionId del contexto === pending.sessionId
//   - isLoadingHistory === false
```

Al entrar al visor a las 07:41:05, el ChatContext tuvo **al menos 4 ciclos de `isAuthenticated: false → true`** en los siguientes 40 s. Cada flip de auth resetea `userId` y, peor, en 07:42:28 el `sessionId` del contexto saltó a un id distinto (573f13b7), nunca igualando a `pending.sessionId`. Resultado: el guard `sessionId !== pending.sessionId` quedó siempre falso y `sendMessage` **nunca se llamó** → cero requests a `chat-intelligence-v2`.

Adicionalmente, el Step 1 ejecuta `navigate(location.pathname, { replace: true, state: {} })` para evitar reenvíos en reload. Si el efecto se re-ejecuta tras un flip de auth, el `location.state` ya está vacío y el `pending` solo se setea una vez (protegido por `autoSentRef`), pero si en ese momento la condición de Step 2 no se cumple, **no hay reintento**.

Por qué ayer funcionaba y hoy no: el churn de auth de hoy (probablemente refresh de token coincidente con el arranque del visor) destapa una **condición de carrera latente** que ya existía. No es un cambio reciente de lógica; es un bug de robustez del visor frente a auth inestable.

## Plan de acción

### 1. Diagnóstico confirmatorio (5 min, sin tocar código)
- Pedir al usuario que vuelva a /informes, abra DevTools → Network, genere otro informe Top 5 IBEX-35 y comparta:
  - Si aparece (o no) una request a `/functions/v1/chat-intelligence-v2`.
  - Logs de consola con prefijo `[ChatContext]` y `[RixViewer]`.
- En paralelo, añadir un `console.warn` temporal en RixViewer Step 2 explicando por qué no dispara (qué guard bloquea) — diagnóstico mínimo invasivo.

### 2. Fix de robustez en `src/pages/RixViewer.tsx`
- **Persistir `pending` en `sessionStorage`** con clave `rix:pending:<reportId>`, para sobrevivir a re-renders por flip de auth y al `navigate(replace, state:{})`.
- **Reintento explícito**: si tras X segundos (p.ej. 8 s) el guard sigue bloqueado, forzar `loadConversation(pending.sessionId)` otra vez y reintentar.
- **Toast de error visible** al usuario si pasados 15 s sigue sin haberse enviado: *"No se pudo iniciar el informe. Reintentar"* con botón que rehidrata `pending` desde sessionStorage.
- Limpiar `sessionStorage` cuando `sendMessage` se dispara o cuando el usuario navega fuera.

### 3. Fix en `ChatContext` (causa secundaria del churn)
- Revisar por qué `onAuthStateChange` reporta `isAuthenticated: false` en medio de un `TOKEN_REFRESHED` (no debería). Probable: estamos reaccionando a eventos `SIGNED_OUT` espurios en lugar de filtrar por `event === 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'`.
- Si el flip es solo cosmético (el `session` sigue vivo), no resetear `userId` a null en `TOKEN_REFRESHED`/eventos transitorios.

### 4. Recuperar el informe que el usuario quería ahora
- Como el `rix_reports` ya existe (51c584a8…), el usuario puede simplemente abrir ese informe del listado del visor y pulsar "Reintentar" (si existe) o reformular la pregunta en el chat de esa sesión — el contexto está preservado.
- Si no hay botón de reintento aún, lo añadimos como parte del fix (botón "Lanzar de nuevo este informe" en la cabecera del visor cuando el informe está vacío).

### 5. Validación
- Forzar manualmente un churn de auth (cerrar y abrir sesión rápido) en preview y comprobar que el informe se dispara igualmente.
- Confirmar en logs de edge que `chat-intelligence-v2` recibe la request.

## Sección técnica

**Archivos a tocar**:
- `src/pages/RixViewer.tsx` — añadir persistencia de `pending`, watchdog de reintento, toast de error, botón "Lanzar de nuevo este informe".
- `src/contexts/AuthContext.tsx` y/o `src/contexts/ChatContext.tsx` — filtrar eventos de Supabase auth para no resetear `userId`/`sessionId` ante `TOKEN_REFRESHED`.
- (Opcional) `src/lib/reports/reportMemory.ts` — añadir flag `dispatched_at` para saber si un informe llegó a enviarse.

**No tocar**:
- Edge functions (`chat-intelligence-v2`, `builder.ts`) — el problema es 100 % cliente.
- Pipeline de barrido — sano (W22 cerrado, 175/175).
- Fix de `Gemini`/`Google Gemini` ya desplegado ayer; sigue intacto.

**Riesgo**: bajo. Cambios encapsulados en visor + auth context. Sin migraciones de BBDD.

¿Lo lanzo así, o prefieres que primero solo añada los `console.warn` de diagnóstico para confirmar el guard exacto que bloqueó esta mañana antes de tocar la lógica?
