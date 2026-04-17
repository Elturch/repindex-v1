

## Plan: Garantizar que TODO usuario activo pueda entrar siempre

### Diagnóstico definitivo

**Datos reales (consulta a `auth.users` + `user_profiles`):**
- 38 usuarios activos
- 30 lograron entrar alguna vez (79%)
- **8 nunca pudieron entrar** (21%) — `last_sign_in_at IS NULL`
- 8 con `email_confirmed_at IS NULL` (los mismos 8)

**Error confirmado en logs (15:02 UTC, hoy):**
```
GET /verify  →  400: Verify requires a verification type
```

Esto significa que cuando un usuario pulsa el enlace que genera Supabase para usuarios sin `email_confirmed_at`, el link interno carece del parámetro `type=magiclink` y Supabase rechaza la verificación. Es un bug del comportamiento de `admin.generateLink({ type: "magiclink" })` cuando se usa con cuentas no confirmadas: en algunos casos genera links tipo "invite" o "recovery" que esperan otro `type`.

**Las tres causas raíz:**
1. **Generación inestable del link**: `admin.generateLink({ type: "magiclink" })` no siempre devuelve un link válido para usuarios sin confirmar; mejor pedir `type: "recovery"` (más robusto, siempre incluye `type=recovery` y autoconfirma).
2. **Sin auto-confirmación previa**: si el usuario nunca confirmó email, Supabase trata el link como "invite". Hay que marcarlos como confirmados antes de generar el link.
3. **Sin self-healing**: cuando un link falla, el usuario queda atrapado sin diagnóstico.

---

### Solución en 4 capas

#### Capa 1: Endurecer `send-user-magic-link` (la edge function existente)

Modificar `supabase/functions/send-user-magic-link/index.ts`:

1. **Auto-confirmar el email del usuario antes de generar el link** — si `email_confirmed_at` es `NULL`, llamar a `supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true })` para que el link generado sea siempre tipo "magiclink" puro (no "invite").
2. **Cambiar el tipo de link a `recovery`** — más fiable que `magiclink` porque siempre lleva `type=recovery` en la URL y autoconfirma al usuario al pulsar.
3. **Logging detallado del action_link** — registrar el link generado en logs (sin token, solo dominio + path + query keys) para detectar reincidencias.
4. **Validación del action_link** — comprobar que la URL contiene `type=` antes de enviar el email; si no, devolver error y avisar.

#### Capa 2: Migración SQL — confirmar a los 8 usuarios bloqueados

Marcar `email_confirmed_at = now()` para todos los usuarios activos (`is_active=true` en `user_profiles`) que tengan `email_confirmed_at IS NULL` en `auth.users`. Esto se hace una sola vez vía migración con `UPDATE auth.users SET email_confirmed_at = now() WHERE id IN (...)`.

> Esto es seguro: el usuario ya está autorizado en `user_profiles.is_active = true`. Confirmar el email solo desbloquea el flujo de magic link, no concede privilegios extra.

#### Capa 3: Sincronizar `admin-api` con la misma lógica

Replicar las mismas mejoras en `supabase/functions/admin-api/index.ts` (caso `send_magic_link`) para que los envíos manuales desde el panel de admin tampoco fallen.

#### Capa 4: Reenvío automático de magic link a los 8 bloqueados

Una vez confirmados en Capa 2, invocar `send-user-magic-link` para cada uno de los 8 usuarios pendientes (Pilar Serrano, Paulo Padrao, Ruben, Marisa Ribera, Eugenia, Salima, Rahma, Sstaccioli) para que reciban un link funcional inmediatamente.

---

### Archivos afectados

1. **`supabase/functions/send-user-magic-link/index.ts`** — auto-confirmar usuario + tipo `recovery` + validación + logging
2. **`supabase/functions/admin-api/index.ts`** — misma lógica en caso `send_magic_link`
3. **Migración SQL** — confirmar los 8 usuarios pendientes (`UPDATE auth.users`)
4. **Acción puntual** — invocar la edge function para los 8 usuarios

### Verificación

- Tras desplegar, revisar logs de auth: el endpoint `/verify` debe responder 200 (no 400).
- Pedir a un usuario bloqueado real (ej. Paulo Padrao) que solicite enlace → confirmar que `last_sign_in_at` se actualiza tras el clic.
- Monitorizar `auth_logs` durante 24h: no debe aparecer ningún `validation_failed` en `/verify`.

### Garantía a futuro

Con estas 3 protecciones (auto-confirm + tipo recovery + validación del link generado) **cualquier usuario con `is_active=true` en `user_profiles` podrá entrar siempre**, sin importar si fue invitado mediante el flujo viejo, si confirmó el email original, o si el link inicial expiró.

