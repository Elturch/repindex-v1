## Objetivo

Tener sesión Supabase válida **siempre abierta por defecto** en Lovable Preview, sin que tengas que escribir email ni password ni pulsar magic link. Solo abrir `/chat` y funcionar.

## Idea clave

En vez de `signInWithPassword` (requiere conocer y mantener una contraseña), usamos el **service role** desde una edge function para generar tokens de sesión del admin y dárselos al navegador. El frontend hace `supabase.auth.setSession(...)` y queda logueado. Cero contraseñas en cliente, cero env vars que tú tengas que mantener.

## Componentes

### 1. Edge function `dev-preview-session` (nueva)

- **Pública** (verify_jwt = false), pero con allowlist estricta de Origin:
  - `http://localhost:*`
  - `https://id-preview--bc807963-c063-4e58-b3fe-21a2a28cd8bf.lovable.app`
  - Cualquier otro Origin → 403.
- Usa `SUPABASE_SERVICE_ROLE_KEY` (ya disponible en edge runtime).
- Email del admin de preview hardcodeado en el código de la función (no es secreto, es solo el identificador del usuario; el poder está en el service role, no en el email). Sugerencia: el mismo que ya usas tú.
- Flujo:
  1. `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL })` → devuelve `hashed_token`.
  2. `supabaseAdmin.auth.verifyOtp({ token_hash, type: 'magiclink' })` → devuelve `session` con `access_token` y `refresh_token`.
  3. Responde `{ access_token, refresh_token }` al cliente.

### 2. `src/lib/devAutoLogin.ts` (nuevo)

- Export `ensureDevSession()`.
- Si `isDevOrPreview()` y no hay sesión activa (`supabase.auth.getSession()` vacío):
  - `fetch` a la edge function `dev-preview-session`.
  - `supabase.auth.setSession({ access_token, refresh_token })`.
- Idempotente: si ya hay sesión, no hace nada.

### 3. Hook en `src/main.tsx` (o `App.tsx`)

- Antes de renderizar (o en un `useEffect` de nivel raíz), `await ensureDevSession()`.
- Mostrar un splash mínimo mientras se resuelve (≈300 ms en local).

### 4. Guardas

- En **producción** (`repindex.ai`, `repindex-v1.lovable.app`) la función ni se llama (gate por `isDevOrPreview()` en cliente) y además devolvería 403 por allowlist de Origin. Doble cinturón.
- Memoria del proyecto se actualiza con esta excepción de seguridad documentada.

## Detalles técnicos

- Allowlist de Origin con regex en la función: `/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/` y `/^http:\/\/localhost(:\d+)?$/`.
- CORS headers solo para esos orígenes.
- El admin email se lee de `Deno.env.get('DEV_PREVIEW_ADMIN_EMAIL')` con fallback hardcodeado, por si quieres rotarlo sin redeploy.
- No se persiste nada nuevo en DB. Reutiliza el flujo OTP de Supabase end-to-end.

## Lo que necesito de ti

Una sola decisión: **qué email usar como "admin de preview"**. Propongo el tuyo de admin actual (el que ya tiene rol en `user_profiles`). Si me lo confirmas, implemento todo en un único paso, sin pedirte nada más.
