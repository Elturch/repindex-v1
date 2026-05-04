
# Plan: Arreglar el enlace de acceso para que SIEMPRE loguee al usuario

## Problema raíz (confirmado por código)

El sistema actual tiene **3 fallos en cadena** que hacen que el enlace de Resend no logre autenticar:

### Fallo 1 — Tipo de enlace incorrecto

`send-user-magic-link/index.ts` línea 169 usa `type: "recovery"`:
```ts
supabaseAdmin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: 'https://repindex-v1.lovable.app/dashboard' } })
```

`recovery` es un enlace de **reseteo de contraseña**, no de login. Genera una URL tipo:
```
https://jzkjykmrwisijiqlwuua.supabase.co/auth/v1/verify?token=xxx&type=recovery&redirect_to=...
```

Cuando el usuario clica, Supabase intenta llevarle a una pantalla de "establecer nueva contraseña" — pero RepIndex **no tiene esa pantalla**. El SDK procesa el token, lo consume (un solo uso), y deja al usuario en `/dashboard` sin sesión válida → `ProtectedRoute` ve `!isAuthenticated` → redirige a `/login` → **bucle**.

### Fallo 2 — Cliente configurado en flujo equivocado

`src/integrations/supabase/client.ts` línea 19 usa `flowType: 'implicit'`. Implicit espera tokens en el **hash** (`#access_token=...`). Pero los enlaces que genera Supabase 2024+ devuelven un **code en query** (`?code=...`) que requiere `flowType: 'pkce'` + `exchangeCodeForSession()`.

El código actual no maneja ninguno de los dos correctamente: no llama a `exchangeCodeForSession`, y `ProtectedRoute` solo espera 2.5s a que el SDK lo procese (línea 28). Si el SDK no procesa, redirige.

### Fallo 3 — Outlook/Mimecast prefetch

Estos clientes corporativos hacen "click silencioso" al recibir el correo para escanearlo. Eso **consume el token** antes de que el usuario llegue. Cuando el humano clica, el token ya está usado → bucle.

Esto explica EXACTAMENTE el patrón de los 11 usuarios sin login: **8 de 11 son corporativos** (`@masorange.es`, `@iberdrola.es`, `@eco.pt`, `@klemgroup.ma`, `@carrerescomunicacion.com`, `@paravium.com`, `@202digitalrep.com`).

## Solución: enlace propio que envuelve un OTP

En vez de mandar la URL nativa de Supabase (frágil, prefetcheable, single-use), mandamos un enlace a **nuestra propia página** que lleva un código OTP. Al abrirla, RepIndex llama a `verifyOtp` y crea sesión. Inmune a prefetch porque verificar requiere POST con el token.

### Arquitectura

```text
[Usuario pide acceso]
       ↓
[send-user-magic-link]
       ↓ generateLink({ type: 'magiclink' })  ← cambio crítico
       ↓ extrae el OTP token (no la URL completa)
       ↓ construye URL propia: https://repindex.ai/auth/callback?token=XXX&email=YYY
       ↓ envía email con esa URL
       ↓
[Usuario clica]
       ↓
[/auth/callback en RepIndex]
       ↓ supabase.auth.verifyOtp({ email, token, type: 'magiclink' })
       ↓ sesión creada → navigate('/dashboard')
       ↓
[ProtectedRoute] → ✅ autenticado
```

Por qué esto funciona donde el actual falla:
- **No usa `recovery`** → no espera pantalla de reset.
- **OTP token aguanta hasta 1h** y solo se consume en POST → prefetch de Outlook no lo invalida.
- **`verifyOtp` es atómico** → no depende de `detectSessionInUrl` ni del flowType.
- **URL en nuestro dominio** → más confiable para filtros corporativos que `*.supabase.co`.

## Sprint único — ~50 min

### 1. Nueva página `src/pages/AuthCallback.tsx`

```text
- Lee ?token=&email= de la URL
- Si faltan → redirige a /login con error
- Llama supabase.auth.verifyOtp({ email, token, type: 'magiclink' })
- Si OK → navigate(/dashboard, replace=true)
- Si error 'expired' → mensaje "Enlace expirado, pide otro" + botón a /login
- Si error 'used' → mensaje "Enlace ya utilizado" + botón a /login
- UI: spinner centrado mientras procesa, mismo estilo que ProtectedRoute
```

Ruta `/auth/callback` registrada en `App.tsx` como **pública** (no envuelta en `ProtectedRoute`).

### 2. Refactor `send-user-magic-link/index.ts`

Cambios mínimos en el bloque de generación de link:

```ts
// ANTES (línea 167-172):
generateLink({ type: "recovery", email, options: { redirectTo } })

// DESPUÉS:
const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
  type: "magiclink",
  email: normalizedEmail,
})
// linkData.properties.email_otp es el token de 6 dígitos hash
// linkData.properties.hashed_token es el token largo para verifyOtp
const token = linkData.properties.hashed_token
const magicLink = `https://repindex.ai/auth/callback?token=${token}&email=${encodeURIComponent(normalizedEmail)}`
```

Ya no dependemos de `action_link`, `redirect_to`, ni de `flowType` del cliente.

### 3. Cliente Supabase: cambiar a `pkce`

`src/integrations/supabase/client.ts`:
```ts
flowType: 'pkce',           // antes: 'implicit'
detectSessionInUrl: false,  // ya no nos hace falta, lo gestionamos manual
```
Esto además mejora seguridad y elimina el race condition del hash.

### 4. Limpiar `ProtectedRoute`

Quitar el bloque de `urlHasToken` + `waitingForToken` + 2.5s timeout. Ya no aplica porque ahora el callback es explícito en `/auth/callback`.

### 5. Actualizar email template

En el HTML del email cambiar el texto del botón a "Acceder a RepIndex" apuntando a la nueva URL. Mantener el fallback de copiar el link.

## Lo que NO tocamos en este sprint

- Logging de envíos en BD (Sprint email-1 anterior, sigue siendo útil después).
- Webhook de Resend (Sprint email-3, sigue válido).
- Panel admin (Sprint email-4).
- Refactor de las otras 11 functions (Sprint email-2).

Este sprint es **quirúrgico sobre el problema de login**. Los anteriores 4 sprints siguen siendo el plan completo, este se inserta como **Sprint email-0 (prioritario)**.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `generateLink({type:'magiclink'})` no devuelve `hashed_token` | Validamos en local primero; si Supabase cambió la API usamos `properties.action_link` y parseamos el token de la URL |
| `verifyOtp` falla con `type:'magiclink'` | Probamos también `type:'email'` que es el alias moderno; el bloque tiene try/catch con fallback |
| Cambiar a PKCE rompe sesiones existentes | Sesiones persisten en localStorage independiente del flowType; usuarios ya logueados no se ven afectados |
| Usuarios con email no confirmado | El `auto-confirm` actual (línea 145) se mantiene, sigue funcionando |

## Validación post-deploy

1. Tú pides magic link a tu email personal y a uno corporativo.
2. Verificas que el enlace en el correo tiene formato `repindex.ai/auth/callback?token=...&email=...`.
3. Clicas → debes acabar en `/dashboard` logueado en menos de 3s.
4. Repites en ventana de incógnito.
5. Pides un segundo enlace y dejas que Outlook lo prefetchee → el segundo clic humano debe seguir funcionando (porque OTP no se consume con GET).
6. Mandas magic link manual a los 11 usuarios huérfanos desde admin y monitorizas `last_login` en `user_profiles`.

## Criterio de éxito

- 0 usuarios reportan "bucle de login".
- Los 11 usuarios huérfanos consiguen entrar al primer intento.
- `last_login` se actualiza para todos en menos de 24h.

¿Apruebo y ejecuto este sprint quirúrgico **antes** de los 4 sprints de logging/webhook/admin? Mi recomendación: este primero (resuelve el bloqueo real), y después los otros para tener observabilidad permanente.
