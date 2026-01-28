

# Plan: Distribución Automática del Newsroom por Email

## Resumen Ejecutivo

Cuando el Newsroom se genera cada lunes (vía `generate-news-story`), enviar automáticamente un email a todos los usuarios activos que tengan habilitadas las alertas de Newsroom, usando Resend con una plantilla HTML premium.

---

## Arquitectura Propuesta

```text
┌─────────────────────────┐
│  generate-news-story    │
│  (Edge Function)        │
│  [Genera el Newsroom]   │
└───────────┬─────────────┘
            │ Después de guardar en DB
            ▼
┌─────────────────────────┐
│  send-newsroom-email    │
│  (Nueva Edge Function)  │
│  [Envía emails via      │
│   Resend a usuarios     │
│   activos]              │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Usuarios Activos       │
│  is_active = true       │
│  enable_newsroom = true │
│  enable_email = true    │
└─────────────────────────┘
```

---

## Paso 1: Crear Edge Function `send-newsroom-email`

### Responsabilidades:
1. Recibir el ID del `weekly_news` recién publicado
2. Obtener usuarios elegibles:
   - `user_profiles.is_active = true`
   - `user_notification_preferences.enable_newsroom_alerts = true`
   - `user_notification_preferences.enable_email_notifications = true`
3. Generar email HTML con:
   - Titular principal del Newsroom
   - 3-5 historias destacadas con leads
   - Botón CTA "Leer Newsroom Completo"
4. Enviar emails en batches (evitar rate limits de Resend)
5. Registrar en `user_notifications` para tracking

### Template de Email:
- Header con logo RepIndex
- Sección hero con el `main_headline`
- 3-5 cards con titulares y leads de las historias principales
- Botón CTA azul hacia `/noticias`
- Footer con opción de unsubscribe

---

## Paso 2: Modificar `generate-news-story`

Añadir llamada a `send-newsroom-email` después de guardar en DB:

```typescript
// Después de guardar weekly_news...
if (weeklyNewsRecord?.id) {
  // Enviar emails en background
  EdgeRuntime.waitUntil(
    fetch(`${supabaseUrl}/functions/v1/send-newsroom-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        weeklyNewsId: weeklyNewsRecord.id,
        weekLabel: newsData.weekLabel,
        mainHeadline: newsData.mainStory?.headline,
        mainLead: newsData.mainStory?.lead,
        stories: newsData.stories?.slice(0, 4).map(s => ({
          headline: s.headline,
          lead: s.lead
        }))
      })
    })
  );
}
```

---

## Paso 3: Lógica de Filtrado de Usuarios

```sql
SELECT 
  up.id,
  up.email,
  up.full_name
FROM user_profiles up
LEFT JOIN user_notification_preferences unp ON unp.user_id = up.id
WHERE up.is_active = true
  AND COALESCE(unp.enable_newsroom_alerts, true) = true
  AND COALESCE(unp.enable_email_notifications, true) = true
  AND up.email IS NOT NULL
```

**Usuarios actuales elegibles:** ~14 (usuarios activos)

---

## Paso 4: Rate Limiting y Batching

Para evitar problemas con Resend:
- Enviar en batches de 10 emails
- Delay de 100ms entre emails
- Log de éxitos/fallos por usuario
- Retry automático para fallos transitorios

---

## Paso 5: Tracking de Envíos

Registrar cada envío en `user_notifications`:

```typescript
await supabase.from('user_notifications').insert({
  user_id: userId,
  notification_type: 'newsroom_weekly',
  title: `📰 ${weekLabel}`,
  content: mainHeadline,
  metadata: { week_id: weeklyNewsId, email_sent: true },
  status: 'sent',
  approved_at: new Date().toISOString()
});
```

---

## Estructura de Archivos

```text
supabase/functions/
├── generate-news-story/
│   └── index.ts          ← Modificar: añadir llamada a send-newsroom-email
├── send-newsroom-email/
│   └── index.ts          ← NUEVO: Edge function para emails
└── supabase/config.toml  ← Añadir nueva función
```

---

## Template HTML del Email

```html
<!-- Header con branding RepIndex -->
<tr>
  <td style="background:#1e293b;padding:24px;text-align:center;">
    <img src="logo" height="32">
  </td>
</tr>

<!-- Hero con titular principal -->
<tr>
  <td style="padding:32px;">
    <h1 style="color:#1e293b;font-size:24px;">
      📰 Newsroom Semanal
    </h1>
    <p style="font-size:14px;color:#64748b;">
      {weekLabel}
    </p>
    <h2 style="font-size:20px;color:#2563eb;">
      {mainHeadline}
    </h2>
    <p style="color:#475569;">
      {mainLead}
    </p>
  </td>
</tr>

<!-- 3-4 historias destacadas -->
<tr>
  <td style="padding:0 32px 24px;">
    <div style="border-left:4px solid #2563eb;padding-left:16px;margin-bottom:16px;">
      <strong>{story.headline}</strong>
      <p>{story.lead}</p>
    </div>
    <!-- Repetir para cada historia -->
  </td>
</tr>

<!-- CTA -->
<tr>
  <td align="center" style="padding:24px;">
    <a href="https://repindex.ai/noticias" 
       style="background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;">
      Leer Newsroom Completo
    </a>
  </td>
</tr>

<!-- Footer con unsubscribe -->
<tr>
  <td style="background:#f8fafc;padding:24px;text-align:center;">
    <p style="font-size:12px;color:#94a3b8;">
      Recibes este email porque tienes activadas las alertas del Newsroom.
      <a href="https://repindex.ai/perfil">Gestionar preferencias</a>
    </p>
  </td>
</tr>
```

---

## Sección Técnica

### Dependencias Existentes Reutilizadas:
- `RESEND_API_KEY` ✅ (ya configurado)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ 
- Template de email de `admin-api` como base

### Configuración de config.toml:
```toml
[functions.send-newsroom-email]
verify_jwt = false
```

### Flujo de Datos:
1. `generate-news-story` guarda en `weekly_news` 
2. Obtiene `weeklyNewsRecord.id`
3. Llama a `send-newsroom-email` con datos del Newsroom
4. `send-newsroom-email` consulta usuarios elegibles
5. Envía emails en batches via Resend
6. Registra en `user_notifications`

### Manejo de Errores:
- Si Resend falla → log error + continuar con siguiente usuario
- Si BD falla → responder con error 500
- Timeout de 60s para la función completa

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| Newsroom se genera y queda en la web | Newsroom llega al inbox de usuarios activos |
| Usuarios deben recordar visitar /noticias | Email con preview y CTA directo |
| Sin tracking de engagement por email | Registro en `user_notifications` |

**Usuarios impactados:** ~14 activos actualmente

