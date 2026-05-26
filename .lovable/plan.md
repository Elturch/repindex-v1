## Auditoría completa de los dos flujos de correo

### Flujo A — Modal de login con email NO registrado (el que mencionas)

**Ruta exacta del código:**
```text
src/pages/Login.tsx
   handleSubmit → useAuth().sendMagicLink(email)
      └─ edge function `send-user-magic-link`
          └─ user_profiles no contiene ese email
              └─ devuelve { notRegistered: true }
   setLoginState('not_registered')
   Pantalla "Email no registrado" → checkbox de consentimiento
   Click "Sí, contadme"
      └─ edge function `save-interested-lead`
          ├─ inserta row en `interested_leads`
          ├─ si email corporativo:
          │    ├─ inserta row en `lead_qualification_responses` con token UUID
          │    └─ Resend → email con botón a
          │         https://repindex-v1.lovable.app/cualificacion/{token}
          └─ si NO corporativo: envía email de rechazo
Usuario abre el enlace
   └─ ruta /cualificacion/:token → src/pages/Qualification.tsx
       └─ validateToken() hace:
          supabase.from('lead_qualification_responses')
                  .select('*, interested_leads(email)')
                  .eq('token', token).single()
```

**🔴 Bug confirmado:**

La tabla `lead_qualification_responses` tiene RLS activado, y sus **únicas dos políticas exigen ser admin**:
- "Admins can view qualification responses" — `has_role(auth.uid(),'admin')`
- "Service role and admins manage qualification responses" — `has_role(auth.uid(),'admin')`

El usuario que abre el enlace está **anónimo** → el SELECT siempre devuelve `null` → la página renderiza "Enlace no válido". El formulario nunca llega a mostrarse, por eso nunca se envía.

**Evidencia incontestable en producción:**
- 9 enlaces enviados desde abril (Cellnex ×2, Sacyr, ITP Aero, El Confidencial, Veolia, Curtichs, Trustmaker…)
- `submitted_at = null` en **todos**, sin excepción
- ITP Aero recibió 3 reenvíos el mismo día (12-may) — clásico "el enlace no funciona, mándamelo otra vez"

**Adicional:** hay **dos rutas** distintas que insertan en `lead_qualification_responses` (`save-interested-lead` desde el login, y `send-qualification-form` desde el panel admin). Ambas generan enlaces que la página no puede validar.

---

### Flujo B — Magic link para usuarios YA registrados

`send-user-magic-link` y `/auth/callback` están correctamente implementados (auto-confirma email, extrae `hashed_token`, usa `verifyOtp` con fallbacks, mitiga prefetch corporativo). Causas probables si "no entran":

- **Dominio Resend:** envía desde `no-reply@repindex.ai`. Si `repindex.ai` no está Verified en Resend (SPF/DKIM/DMARC), Mimecast/Outlook lo bloquea o reescribe el enlace.
- **Resolución de `repindex.ai`:** el enlace siempre apunta a `https://repindex.ai/auth/callback`. Si el dominio personalizado no responde a esa ruta, el usuario ve 404. Sitio publicado real: `repindex-v1.lovable.app`.
- **Prefetch corporativo agresivo:** algunos proxies ejecutan JS y queman el token antes del clic humano. La mitigación robusta es un botón intermedio.

---

## Plan de implementación

### 1. Desbloquear el formulario de cualificación (crítico)

- Crear edge function pública `validate-qualification-token` (verify_jwt=false, service-role) que reciba `{ token }` y devuelva `{ valid, email, expired, used }` — sin exponer toda la fila.
- Modificar `src/pages/Qualification.tsx` para invocar esa función en lugar del SELECT directo.
- Resultado: el botón "Completar formulario" del correo abrirá realmente el formulario.

### 2. Robustecer `/auth/callback` contra prefetch corporativo

- En `src/pages/AuthCallback.tsx`, no disparar `verifyOtp` automáticamente al cargar. Mostrar un botón "Acceder a RepIndex" que solo dispare la verificación con click humano.
- Coste: un clic más. Beneficio: tokens quemados por Mimecast/Defender pasan de ser un fallo silencioso a no ocurrir.

### 3. Unificar el `from` y el dominio del enlace

- En `save-interested-lead`, `send-qualification-form` y `send-user-magic-link` usar todos `noreply@repindex.ai` (hoy hay `info@`, `noreply@` y `no-reply@` mezclados — esto perjudica reputación de envío).
- En los emails de cualificación, sustituir el dominio Lovable de fallback por el dominio que el usuario abrió (basado en `origin` del request al edge function), con `https://repindex.ai` como default.

### 4. Validación operativa (tú, no yo)

- Confirmar en Resend → Domains que `repindex.ai` aparece **Verified** con SPF/DKIM/DMARC en verde.
- Abrir `https://repindex.ai/auth/callback?token=foo&email=foo@bar.com` en incógnito y confirmar que carga la SPA (debe ver el botón intermedio tras el fix #2).

### 5. Test end-to-end tras los cambios

- Email **no registrado** corporativo → recibir formulario → abrir → submit → confirmar `submitted_at` poblado en BD.
- Email **no registrado** no corporativo → recibir email de rechazo, sin enlace roto.
- Email **registrado** → recibir magic link → clic → botón intermedio → entrar al dashboard.

---

## Pregunta

¿Procedo con los pasos 1, 2 y 3 (cambios de código)? Los pasos 4 y 5 los harías tú después.
