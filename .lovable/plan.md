

# Plan: Envío Automático del Formulario de Cualificación al Consentir

## Resumen

Cuando un lead no registrado da su consentimiento en la página de login, el sistema enviará automáticamente el formulario de cualificación por email, sin intervención del administrador.

---

## Flujo Propuesto

```text
Usuario intenta login → Email no registrado
         │
         ▼
  Pantalla de consentimiento
         │
    ┌────┴────────────────────────────┐
    │                                  │
"Sí, contactadme"              "No, gracias"
    │                                  │
    ▼                                  ▼
save-interested-lead              Solo guardar lead
  + send-qualification-form       status: pending
    │
    ▼
Email corporativo?
    │
┌───┴───────────────────────┐
│                           │
SÍ                          NO
│                           │
▼                           ▼
Recibe formulario      Recibe email de rechazo
de cualificación       amable (usa email corporativo)
```

---

## Cambios Técnicos

### 1. Modificar `save-interested-lead/index.ts`

Cuando `contact_consent = true`:
1. Guardar el lead como siempre
2. Llamar internamente a la lógica de `send-qualification-form`
3. Enviar el email correspondiente (formulario o rechazo)

**Ventajas de integrar la lógica en un solo Edge Function:**
- Una sola llamada desde el frontend
- Transacción atómica (guardar + enviar)
- Menos latencia para el usuario

### 2. Actualizar el mensaje de confirmación en Login.tsx

Cuando el lead da consentimiento y es email corporativo:
- "¡Gracias! Te hemos enviado un email con un formulario para personalizar tu experiencia."

Cuando es email no corporativo:
- "Gracias por tu interés. Te hemos enviado un email con más información."

### 3. Respuesta mejorada del Edge Function

La función devolverá información sobre el resultado:
```json
{
  "ok": true,
  "leadId": "uuid",
  "qualificationSent": true,
  "isCorporateEmail": true,
  "message": "Formulario enviado"
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/save-interested-lead/index.ts` | Integrar lógica de envío de email cuando `contact_consent = true` |
| `src/pages/Login.tsx` | Actualizar mensajes de confirmación basados en respuesta del backend |

---

## Detalles Técnicos

### `save-interested-lead/index.ts` - Nueva Lógica

```text
1. Validar payload
2. Guardar lead con upsert
3. SI contact_consent === true:
   a. Verificar si email es corporativo
   b. Generar token único (7 días expiración)
   c. Crear registro en lead_qualification_responses
   d. SI corporativo → enviar email con formulario
   e. SI no corporativo → enviar email de rechazo amable
   f. Actualizar qualification_status del lead
4. Devolver resultado con información del envío
```

### Login.tsx - Mensajes Actualizados

```text
SI leadSaved === 'consent' && data.isCorporateEmail:
  "¡Gracias! Revisa tu correo para completar un breve formulario 
   y personalizar tu acceso a RepIndex."

SI leadSaved === 'consent' && !data.isCorporateEmail:
  "Gracias por tu interés. Te hemos enviado información sobre 
   cómo acceder desde tu email corporativo."
```

---

## Resultado Esperado

1. Usuario da consentimiento → Recibe email inmediatamente (sin esperar a admin)
2. Admin ve el lead ya con estado "form_sent" o "rejected_email"
3. Solo cuando el lead complete el formulario, admin puede convertirlo a usuario

