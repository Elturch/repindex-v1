

## Plan: Eliminar emails enviados por Supabase/Lovable, todo vía Resend

### Diagnóstico

**Buena noticia:** No hay dominio de Lovable Emails configurado, así que **Lovable NO está enviando emails**. Todas las funciones edge usan correctamente `Resend` con remitente `@repindex.ai`.

**Problema crítico encontrado:** Hay **2 puntos** donde Supabase envía emails automáticamente con su propia plantilla por defecto (no Resend, no branded):

1. **`supabase/functions/admin-api/index.ts` línea 181** — `case "create_user"` usa `supabaseAdmin.auth.admin.inviteUserByEmail()`. Este método de Supabase **dispara automáticamente un email de invitación con la plantilla por defecto de Supabase**, no con Resend.
2. **`supabase/functions/admin-api/index.ts` línea 461** — `case "invite_user"` (conversión de lead) hace exactamente lo mismo.

Esto explica por qué los usuarios de las primeras altas recibían emails poco branded que muchos confundían con spam: era el email automático de Supabase, no nuestro Resend.

**Inventario completo de emails (todos correctos vía Resend):**

| Función | Remitente | Estado |
|---|---|---|
| `send-user-magic-link` | `no-reply@repindex.ai` | ✅ Resend |
| `admin-api` → send_magic_link | `no-reply@repindex.ai` | ✅ Resend |
| `send-contact-form` | `no-reply@repindex.ai` | ✅ Resend |
| `send-legal-form` | `no-reply@repindex.ai` | ✅ Resend |
| `send-newsroom-email` | `no-reply@repindex.ai` | ✅ Resend |
| `send-qualification-form` | `info@repindex.ai` | ✅ Resend |
| `submit-qualification-form` | `info@repindex.ai` | ✅ Resend |
| `admin-api` → create_user | (Supabase auto) | ❌ **Supabase default** |
| `admin-api` → invite_user | (Supabase auto) | ❌ **Supabase default** |

### Cambios a aplicar

#### 1. Reemplazar `inviteUserByEmail` en `case "create_user"` (admin-api línea 179-225)

Sustituir el flujo por:
1. `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })` — crea el usuario sin enviar email automático.
2. Actualizar el perfil con company_id, full_name, is_individual.
3. Invocar internamente `send-user-magic-link` para enviar el email branded de bienvenida vía Resend.

#### 2. Reemplazar `inviteUserByEmail` en `case "invite_user"` (admin-api línea 459-490)

Mismo patrón: `createUser` con `email_confirm: true` + actualizar perfil + invocar `send-user-magic-link`.

#### 3. Verificación post-deploy

- Crear un usuario de prueba desde el panel admin.
- Confirmar que llega **un solo email**, branded RepIndex, vía Resend (no el de Supabase).
- Revisar logs de `admin-api` y `send-user-magic-link` para confirmar la cadena.

### Garantía a futuro

Tras estos cambios, **el 100% de los emails que reciben los usuarios saldrán de `@repindex.ai` vía Resend con plantilla branded**. Supabase ya no enviará nada en ningún flujo. No hace falta tocar plantillas de Supabase Auth porque dejaremos de invocar los métodos que las disparan.

### Archivos afectados

1. `supabase/functions/admin-api/index.ts` — reemplazar 2 invocaciones de `inviteUserByEmail` por `createUser` + invoke de `send-user-magic-link`.

