
# Plan: Sistema de Captura de Leads con Consentimiento GDPR

## Objetivo
Cuando alguien intenta acceder con un email no registrado, en lugar de solo rechazarlos, les ofrecemos la opción de dar su consentimiento para ser contactados. Esto crea un funnel de captación de usuarios interesados con consentimiento explícito (GDPR compliant).

## Flujo de Usuario Propuesto

```text
Usuario no registrado intenta login
         │
         ▼
  Email no está en user_profiles
         │
         ▼
  ┌──────────────────────────────────────┐
  │  "Tu correo no está en la base de    │
  │   datos de RepIndex.                 │
  │                                      │
  │   ¿Nos autorizas a contactar         │
  │   contigo para darte acceso?"        │
  │                                      │
  │   [Sí, contactadme]  [No, gracias]   │
  └──────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
  "Sí"      "No"
    │         │
    ▼         ▼
  Guarda    Guarda email
  con       SIN consentimiento
  consent   (solo para stats)
    │         │
    ▼         ▼
  "¡Gracias!   "Entendido.
   Te          Contacta con
   contactaremos tu administrador."
   pronto."
```

## Componentes a Crear/Modificar

### 1. Nueva Tabla: `interested_leads`

Campos:
- `id` (uuid, PK)
- `email` (text, único)
- `contact_consent` (boolean) - Si autorizó contacto
- `consent_date` (timestamp) - Cuándo dio/negó consentimiento
- `ip_address` (text, nullable) - Para auditoría GDPR
- `user_agent` (text, nullable) - Para analytics
- `source` (text) - "login_attempt"
- `status` (text) - "pending", "contacted", "converted", "rejected"
- `admin_notes` (text, nullable)
- `contacted_at` (timestamp, nullable)
- `converted_at` (timestamp, nullable) - Si se convirtió en user_profile
- `created_at` (timestamp)

### 2. Modificar Login.tsx

Añadir un nuevo estado `notRegistered` que muestre:
- Mensaje explicativo amigable
- Checkbox de consentimiento de contacto
- Botones de "Sí" / "No"
- Mensaje de confirmación tras la acción

### 3. Modificar AuthContext.tsx

La función `sendMagicLink` ahora retornará un objeto más rico:
```typescript
type MagicLinkResult = {
  error: string | null;
  notRegistered?: boolean; // Email no existe
  email?: string; // Para pasar al modal de consentimiento
}
```

### 4. Nuevo Panel en Admin: `InterestedLeadsPanel.tsx`

Mostrar tabla con:
- Email del lead
- Fecha de intento
- ¿Dio consentimiento? (Sí/No con badge de color)
- Estado (Pendiente, Contactado, Convertido, Rechazado)
- Acciones:
  - "Invitar" → Crea user_profile + envía magic link
  - "Marcar como contactado"
  - "Rechazar"
  - "Añadir nota"

Métricas:
- Total de intentos de login fallidos
- % con consentimiento vs sin consentimiento
- Tasa de conversión (leads → usuarios)

### 5. RLS Policies

- SELECT: Solo admins
- INSERT: Público (desde login)
- UPDATE/DELETE: Solo admins

## Sección Tecnica

### Migración SQL

```sql
CREATE TABLE public.interested_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  contact_consent boolean NOT NULL DEFAULT false,
  consent_date timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  source text NOT NULL DEFAULT 'login_attempt',
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interested_leads_email_key UNIQUE (email)
);

-- RLS
ALTER TABLE public.interested_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (from login page)
CREATE POLICY "Public can insert leads" ON public.interested_leads
  FOR INSERT WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can view leads" ON public.interested_leads
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update
CREATE POLICY "Admins can update leads" ON public.interested_leads
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins can delete leads" ON public.interested_leads
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for quick lookups
CREATE INDEX idx_interested_leads_email ON public.interested_leads(email);
CREATE INDEX idx_interested_leads_status ON public.interested_leads(status);
```

### Archivos a Modificar

1. **`src/pages/Login.tsx`**
   - Añadir estados: `showConsentModal`, `consentGiven`, `leadSaved`
   - Nuevo componente inline o modal para solicitar consentimiento
   - Función para guardar lead en Supabase

2. **`src/contexts/AuthContext.tsx`**
   - Modificar retorno de `sendMagicLink` para incluir `notRegistered: true`
   - No guardar el lead aquí (eso lo hace Login.tsx tras la respuesta del usuario)

3. **`src/components/admin/InterestedLeadsPanel.tsx`** (NUEVO)
   - Tabla con leads
   - Filtros por estado y consentimiento
   - Acciones de admin
   - Métricas de conversión

4. **`src/pages/Admin.tsx`**
   - Importar y añadir tab "Leads" con `InterestedLeadsPanel`

5. **`supabase/functions/admin-api/index.ts`**
   - Añadir acciones: `list_leads`, `update_lead`, `convert_lead_to_user`

### Flujo de Conversión Lead → Usuario

Cuando el admin hace click en "Invitar":
1. Crea registro en `user_profiles` con los datos del lead
2. Envía magic link al email
3. Actualiza `interested_leads.status = 'converted'`
4. Actualiza `interested_leads.converted_at = now()`

### Consideraciones GDPR

- Guardamos fecha exacta del consentimiento
- Diferenciamos claramente entre quienes consintieron y quienes no
- Los que NO consintieron se guardan solo para estadísticas internas (sin contacto)
- Botón para eliminar lead por completo si lo solicitan
