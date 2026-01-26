
# Plan: Formulario de Contacto para RepIndex

## Objetivo
Crear un formulario de contacto en la landing page que envíe correos a `informes@repindex.ai` sin exponer ninguna dirección de email al usuario.

## Arquitectura

```text
+------------------+     +-------------------+     +------------------+
|   ContactForm    | --> | Edge Function     | --> | Resend API       |
|   (Frontend)     |     | send-contact-form |     | informes@...     |
+------------------+     +-------------------+     +------------------+
```

## Componentes a Crear/Modificar

### 1. Nuevo Edge Function: `send-contact-form`
**Archivo:** `supabase/functions/send-contact-form/index.ts`

- Recibe: nombre, email, mensaje (validados con zod)
- Envía email a `informes@repindex.ai` usando Resend
- Template HTML branded con estilos RepIndex
- Incluye anti-spam básico (honeypot field)
- Logging para debugging

### 2. Nueva Sección: `ContactSection`
**Archivo:** `src/components/landing/ContactSection.tsx`

Formulario con campos:
| Campo | Tipo | Validación |
|-------|------|------------|
| Nombre | text | Requerido, max 100 chars |
| Email | email | Requerido, formato válido |
| Empresa | text | Opcional, max 100 chars |
| Mensaje | textarea | Requerido, max 1000 chars |

Características:
- Validación client-side con zod
- Estados: idle, loading, success, error
- Animaciones Framer Motion (consistente con resto del landing)
- Diseño responsive
- Honeypot field invisible para anti-spam

### 3. Modificar Landing Page
**Archivo:** `src/pages/Landing.tsx`

- Importar `ContactSection`
- Añadir entre `CTASection` y `footer`
- Añadir enlace "Contacto" en footer que scrollea al formulario

### 4. Actualizar config.toml
**Archivo:** `supabase/config.toml`

- Añadir función `send-contact-form` con `verify_jwt = false` (público)

## Detalles Técnicos

### Edge Function - Estructura

```typescript
// Validación con zod
const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(1000),
  honeypot: z.string().max(0) // Anti-spam
});

// Email template branded
const generateContactEmail = (name, email, company, message) => `
  <!DOCTYPE html>
  <html>
  <!-- Template con branding RepIndex -->
  <!-- Muestra: nombre, email del remitente, empresa, mensaje -->
  <!-- Footer: timestamp, indicador de origen -->
  </html>
`;

// Envío via Resend
await resend.emails.send({
  from: "RepIndex <noreply@repindex.ai>",
  to: ["informes@repindex.ai"],
  replyTo: [email], // Permite responder al usuario
  subject: `[Contacto Web] ${name}`,
  html: generateContactEmail(...)
});
```

### Frontend - Estructura del Formulario

```typescript
// Campos del formulario
const form = useForm<ContactFormData>({
  resolver: zodResolver(contactSchema),
  defaultValues: {
    name: "",
    email: "",
    company: "",
    message: ""
  }
});

// Honeypot invisible
<input 
  name="website" 
  className="absolute -left-[9999px]"
  tabIndex={-1}
/>

// Llamada al edge function
const response = await supabase.functions.invoke("send-contact-form", {
  body: { name, email, company, message, honeypot }
});
```

### Diseño Visual

La sección tendrá:
- Fondo con gradiente sutil (`bg-gradient-to-b from-primary/5`)
- Título: "¿Interesado en RepIndex?"
- Subtítulo: "Déjanos tus datos y te contactaremos"
- Formulario en Card con sombra suave
- Botón primario "Enviar mensaje"
- Toast de confirmación al enviar

### Footer - Enlace de Contacto

```typescript
<footer className="py-8 px-4 border-t border-border/50 bg-background">
  <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground">
    <p>© 2025 RepIndex.ai - Análisis Reputacional Inteligente</p>
    <a 
      href="#contacto" 
      className="text-primary hover:underline"
    >
      Contacto
    </a>
  </div>
</footer>
```

## Seguridad

| Medida | Implementación |
|--------|----------------|
| No exponer email destino | Email hardcoded en edge function |
| Validación server-side | zod en edge function |
| Validación client-side | zod + react-hook-form |
| Anti-spam | Honeypot field invisible |
| Rate limiting | Resend tiene límites por defecto |
| Sanitización | trim() en todos los campos |

## Archivos a Crear/Modificar

| Archivo | Acción |
|---------|--------|
| `supabase/functions/send-contact-form/index.ts` | Crear |
| `supabase/config.toml` | Modificar (añadir función) |
| `src/components/landing/ContactSection.tsx` | Crear |
| `src/pages/Landing.tsx` | Modificar (añadir sección + enlace footer) |

## Flujo de Usuario

1. Usuario navega a landing page
2. Hace scroll hasta sección "Contacto" o click en enlace del footer
3. Rellena formulario (nombre, email, empresa opcional, mensaje)
4. Click "Enviar mensaje"
5. Validación client-side, si falla muestra errores
6. Envío a edge function
7. Validación server-side + envío a Resend
8. Usuario ve toast "¡Mensaje enviado!"
9. Formulario se resetea

## Tiempo Estimado

- Edge function: 5 minutos
- ContactSection: 10 minutos
- Integración Landing: 3 minutos
- **Total: ~18 minutos**
