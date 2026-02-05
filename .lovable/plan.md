
# Plan: Sistema de Cualificación de Leads con Formulario por Email

## Resumen Ejecutivo

Transformar la conversión de leads en un proceso de cualificación en dos pasos:
1. El lead recibe un **formulario de cualificación por email** (no se convierte directamente)
2. Solo se convierte a usuario cuando rellena el formulario **desde un email corporativo**

---

## Flujo Completo

```text
Lead en panel Admin (status: pending)
         │
         ▼
Admin hace clic en "Enviar Formulario de Cualificación"
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  Email al lead con enlace a formulario               │
│  (válido 7 días, con token único)                    │
└──────────────────────────────────────────────────────┘
         │
         ▼
Lead abre el enlace → Página de formulario público
         │
    ┌────┴────────────────────────────┐
    │                                  │
Email corporativo?              Gmail/Hotmail/Yahoo?
    │                                  │
    ▼                                  ▼
Formulario completo:           Email de rechazo amable:
- Empresas de interés          "Por favor, contacta desde
- Perfil/Rol                    un email corporativo"
- Sectores
    │
    ▼
Envío → Datos guardados + Email a info@repindex.ai
         │
         ▼
Admin ve respuesta en panel → Puede convertir a usuario
```

---

## Nuevos Componentes

### 1. Base de Datos

**Nueva tabla: `lead_qualification_responses`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | Primary key |
| lead_id | uuid | FK a interested_leads |
| token | text | Token único para el formulario (expira en 7 días) |
| token_expires_at | timestamp | Fecha de expiración |
| companies_interested | text[] | Array de tickers seleccionados |
| sectors_interested | text[] | Array de sectores |
| role_type | text | Perfil seleccionado (CEO, CFO, DirCom, etc.) |
| additional_notes | text | Comentarios libres |
| email_domain | text | Dominio del email (para matching) |
| is_corporate_email | boolean | true si no es gmail/hotmail/etc |
| contactability_score | integer | Puntuación 0-100 |
| submitted_at | timestamp | Cuándo rellenó el formulario |
| form_sent_at | timestamp | Cuándo se envió el email con el formulario |

**Añadir columnas a `interested_leads`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| qualification_status | text | 'pending', 'form_sent', 'form_completed', 'rejected_email' |
| qualification_score | integer | Score calculado de contactabilidad |

---

### 2. Edge Functions

**A) `send-qualification-form`**
- Genera token único + enlace al formulario
- Valida si el email es corporativo
  - Si es gmail/hotmail/yahoo: envía email de rechazo amable
  - Si es corporativo: envía email con enlace al formulario
- Guarda registro en `lead_qualification_responses`

**B) `submit-qualification-form`**
- Recibe datos del formulario público
- Valida token (no expirado, no usado)
- Calcula `contactability_score`:
  - +30 puntos si el dominio del email coincide con alguna empresa de interés
  - +20 puntos por cada sector coincidente con empresas de interés
  - +10 puntos por perfil directivo (CEO, CFO, DirCom)
  - +20 puntos si es email corporativo
- Guarda respuesta y actualiza `interested_leads.qualification_status`
- Envía email a `info@repindex.ai` con todos los datos

---

### 3. Página de Formulario Público

**Nueva página: `/qualification/:token`**

Formulario con:
- **Empresas de interés** (multiselect con búsqueda, datos de `repindex_root_issuers`)
- **Sectores de interés** (checkboxes con los 21 sectores disponibles)
- **Tipo de perfil** (select con los roles de `chatRoles.ts`: CEO, CFO, DirCom, Marketing, etc.)
- **Comentarios adicionales** (textarea opcional)
- Botón de envío

Si el token es inválido o expirado: mensaje de "Enlace expirado, contacta con info@repindex.ai"

---

### 4. Panel Admin Actualizado

**Nuevas acciones en InterestedLeadsPanel:**
- Botón **"Enviar Formulario"** (en lugar de conversión directa)
- Nuevo estado visual **"Formulario Enviado"** (azul)
- Nuevo estado visual **"Cualificado"** (verde con score)
- Nuevo estado visual **"Email Rechazado"** (naranja)
- Al hacer clic en un lead cualificado: ver respuestas del formulario
- Solo permitir "Convertir a Usuario" si `qualification_status = 'form_completed'`

---

### 5. Templates de Email

**A) Email con Formulario de Cualificación**

Asunto: "Tu acceso a RepIndex - Un paso más"

Contenido:
- Saludo personalizado
- Explicación breve de RepIndex
- Enlace al formulario
- Nota de expiración (7 días)

**B) Email de Rechazo Amable (email no corporativo)**

Asunto: "Sobre tu interés en RepIndex"

Contenido:
- Saludo
- "Hemos recibido tu solicitud desde [email]"
- "Para poder ofrecerte el mejor servicio, necesitamos que nos contactes desde tu email corporativo"
- "Esto nos permite personalizar los informes para tu empresa"
- CTA: "Contactar desde email corporativo" → mailto:info@repindex.ai

**C) Email de Notificación al Admin**

Asunto: "[Cualificación Completada] {email} - Score: {score}"

Contenido:
- Datos del lead
- Respuestas del formulario
- Score de contactabilidad con explicación
- Enlace al panel admin

---

## Dominios de Email No Corporativos

Lista de dominios a rechazar:
```text
gmail.com, googlemail.com, hotmail.com, hotmail.es, outlook.com, 
outlook.es, yahoo.com, yahoo.es, live.com, icloud.com, me.com,
protonmail.com, proton.me, aol.com, mail.com, gmx.com, gmx.es,
yandex.com, zoho.com, tutanota.com
```

---

## Cálculo del Score de Contactabilidad

```text
Base: 0 puntos

+30 si email.domain coincide con alguna empresa de interés (ej: bbva.com → BBVA)
+20 por cada sector elegido que coincida con empresas de interés
+10 si perfil es directivo (CEO, CFO, DirCom, etc.)
+20 si es email corporativo
+10 si rellena comentarios adicionales

Máximo: 100 puntos
```

**Umbrales:**
- 70+: Alta prioridad (contactar pronto)
- 40-69: Media prioridad
- <40: Baja prioridad

---

## Archivos a Crear/Modificar

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/xxx_lead_qualification.sql` | Nueva tabla + columnas |
| `supabase/functions/send-qualification-form/index.ts` | Envío del email con formulario |
| `supabase/functions/submit-qualification-form/index.ts` | Procesamiento del formulario |
| `src/pages/Qualification.tsx` | Formulario público |
| `src/components/admin/InterestedLeadsPanel.tsx` | Nuevos estados y acciones |
| `src/App.tsx` | Nueva ruta `/qualification/:token` |
| `src/lib/corporateEmailDomains.ts` | Lista de dominios no corporativos |

---

## Seguridad

- Los tokens del formulario expiran en 7 días
- El formulario solo acepta un envío por token
- RLS en la nueva tabla para que solo service_role pueda escribir
- Validación de entrada en el formulario (máx caracteres, etc.)
- Rate limiting en el endpoint de submit

---

## Preguntas Resueltas

**¿Se puede hacer con Resend?** ✅ Sí
- Resend envía los emails (formulario, rechazo, notificación)
- El formulario es una página en la app (no necesita Resend)
- Al enviar el formulario, se notifica vía Resend a info@repindex.ai
