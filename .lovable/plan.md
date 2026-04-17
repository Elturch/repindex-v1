

## Diagnóstico: problemas de primer acceso

### Hallazgos

Tras revisar `auth.users`, `user_profiles`, `interested_leads` y el código:

**1. Bug latente en el cliente Supabase** (`src/integrations/supabase/client.ts`)
- No declara `flowType` ni `detectSessionInUrl`. En `@supabase/supabase-js` v2.57 el flow por defecto es `pkce`, que requiere el parámetro `?code=...` en la URL y `exchangeCodeForSession()`.
- Los magic links generados con `admin.generateLink({ type: 'magiclink' })` devuelven un enlace tipo OTP/recovery con tokens en el hash (`#access_token=...`), que `detectSessionInUrl` recoge automáticamente solo si está activado.
- **Síntoma**: usuarios pulsan el enlace, llegan a `/dashboard`, pero el cliente no procesa el token → ProtectedRoute los manda a `/login`.

**2. Usuarios con `email_confirmed_at = NULL` (12 casos)**
- Pilar Serrano, Paulo Padrao, Ruben, Marisa Ribera, Eugenia, Salima, Rahma, Sstaccioli (1ª vez), entre otros.
- Fueron invitados con Supabase Admin (recibieron solo el `confirmation_sent_at` inicial, sin recovery posterior).
- El email de invitación inicial de Supabase no usa la plantilla branded — probablemente acabó en spam o no se entendió.
- Aunque `send-user-magic-link` está preparado para bypassar esta limitación, **estos usuarios no saben que tienen que ir a `/login` y solicitar el enlace**.

**3. Caso confirmado de fallo con magic link real**
- `paulo.padrao@eco.pt`: `recovery_sent_at = 2026-04-13 20:12` pero `last_sign_in_at = NULL`.
- Recibió el magic link branded, lo pulsó, pero la sesión no se persistió → cuadra con el bug #1.

**4. Falsos rechazos de "no registrado" (resuelto pero documentado)**
- Caso Paulo: el 13/04 09:25 intentó entrar y fue marcado como lead. Por la tarde alguien lo registró. Esto es manual y correcto.

### Plan de corrección (3 fixes)

#### Fix #1 — Configurar el cliente Supabase para procesar el magic link [CRÍTICO]
**Archivo**: `src/integrations/supabase/client.ts`

Añadir explícitamente al `auth`:
```ts
detectSessionInUrl: true,
flowType: 'implicit',  // los magic links generateLink usan tokens en hash
```

Esto permite que la SDK detecte el `#access_token=...` cuando el usuario aterriza en `/dashboard` y establezca la sesión automáticamente.

#### Fix #2 — Reenviar magic link a los 12 usuarios bloqueados [URGENTE]
Crear un script (uso único vía consulta) que:
1. Liste los usuarios con `email_confirmed_at IS NULL` y `is_active = true` en `user_profiles`.
2. Invoque `send-user-magic-link` para cada uno.

Esto desbloquea inmediatamente a los usuarios pendientes (Pilar, Paulo, Ruben, Marisa, Eugenia, Salima, Rahma, etc.).

#### Fix #3 — Mejorar feedback en `/dashboard` cuando llega con token [DEFENSA]
**Archivo**: `src/components/auth/ProtectedRoute.tsx`

Si la URL tiene `#access_token` o `?code=` y `isLoading=false` con `!isAuthenticated`, esperar 1-2s extra antes de redirigir a `/login` (la SDK puede estar procesando el token). Esto evita el redirect prematuro que rompe el flow.

### Archivos afectados
1. `src/integrations/supabase/client.ts` — añadir flowType + detectSessionInUrl
2. `src/components/auth/ProtectedRoute.tsx` — esperar si hay token en URL
3. Acción puntual: reenviar magic link a 12 usuarios bloqueados (vía invoke de la edge function)

### Verificación
- Tras desplegar los fixes, pedir a un usuario bloqueado (ej. Pilar Serrano) que solicite el enlace en `/login` y pulse el botón.
- Confirmar en `auth.users` que `last_sign_in_at` se actualiza tras el clic.

