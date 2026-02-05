
# Auditoría de Registro de Usuarios - RepIndex

## Resumen del Problema

He identificado **un bug crítico de seguridad** que permite a cualquier persona registrarse en RepIndex sin ser invitada por un administrador.

## Evidencia del Bug

### 1. Análisis de los 38 usuarios registrados

| Métrica | Valor |
|---------|-------|
| Total usuarios en `auth.users` | 38 |
| Total perfiles en `user_profiles` | 38 |
| Usuarios con evento `user_invited` en logs | **Solo 1** (chloe.clavell.r@gmail.com) |
| Resto de usuarios | Sin registro de invitación (auto-registro vía OTP) |

### 2. Flujo del Bug

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUJO ACTUAL (CON BUG)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Usuario desconocido                                                        │
│         │                                                                   │
│         ▼                                                                   │
│  /login → Introduce email                                                   │
│         │                                                                   │
│         ▼                                                                   │
│  signInWithOtp(email)                                                       │
│         │                                                                   │
│         ├──▶ Usuario NO existe en auth.users                                │
│         │         │                                                         │
│         │         ▼                                                         │
│         │    Supabase CREA el usuario automáticamente    ◀── BUG           │
│         │         │                                                         │
│         │         ▼                                                         │
│         │    Trigger "handle_new_user" crea perfil                          │
│         │         │                                                         │
│         │         ▼                                                         │
│         │    Envía magic link                                               │
│         │                                                                   │
│         ▼                                                                   │
│  Usuario accede sin haber sido invitado                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Causa Raíz

El método `signInWithOtp()` de Supabase tiene un comportamiento por defecto problemático:
- Si el email **no existe**, **crea el usuario automáticamente** y le envía el OTP
- No hay validación previa que compruebe si el email está pre-autorizado

El comentario en `AuthContext.tsx` (línea 187-188) lo reconoce:
```typescript
// First check if the email exists in user_profiles
// Note: This is a soft check - the actual validation happens server-side
```

**Pero el "check" nunca se implementó.**

## Solución Propuesta

### Opción A: Validación en el Frontend + Backend (Recomendada)

Añadir validación antes de llamar a `signInWithOtp`:

**1. Modificar `AuthContext.tsx`:**
```typescript
const sendMagicLink = async (email: string): Promise<{ error: string | null }> => {
  try {
    // Verificar si el email existe en user_profiles ANTES de pedir OTP
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('id, is_active')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (checkError) {
      console.error('Error checking profile:', checkError);
      return { error: 'Error verificando el email. Inténtalo de nuevo.' };
    }

    // Si no existe perfil, rechazar
    if (!existingProfile) {
      return { error: 'Email no registrado. Contacta con el administrador.' };
    }

    // Si existe pero está desactivado, rechazar
    if (!existingProfile.is_active) {
      return { error: 'Tu cuenta está desactivada. Contacta con el administrador.' };
    }

    // Solo ahora enviar el OTP
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: false, // CRÍTICO: previene auto-registro
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error('Error sending magic link:', error);
    return { error: 'Error al enviar el enlace. Inténtalo de nuevo.' };
  }
};
```

**2. Añadir `shouldCreateUser: false`** en la llamada OTP (esto es clave)

**3. Reforzar `ProtectedRoute.tsx`** para requerir perfil activo:
```typescript
// Cambiar la condición actual:
if (profile && !profile.is_active) { ... }

// Por esta más estricta:
if (!profile || !profile.is_active) {
  // Cerrar sesión y redirigir
}
```

### Opción B: Configuración en Supabase Dashboard (Complementaria)

Adicionalmente, en el Dashboard de Supabase:

1. Ir a **Authentication → Providers → Email**
2. **Desactivar** "Confirm email" si no se necesita verificación
3. O bien, en **Authentication → Settings**, asegurar que el registro esté controlado

## Usuarios Actuales a Revisar

Dado que la mayoría de los 38 usuarios se registraron sin invitación formal, recomiendo:

1. **Auditar la lista** de usuarios en `/admin` 
2. **Desactivar** (`is_active = false`) a los que no reconozcas
3. **Re-invitar** a los legítimos usando el botón "Enviar Magic Link" para que tengan el flujo correcto

## Impacto de la Solución

| Aspecto | Antes | Después |
|---------|-------|---------|
| Registro no autorizado | Posible | Bloqueado |
| Flujo de login | Sin validación | Valida perfil pre-existente |
| Experiencia de usuario | Igual | Igual (solo cambia mensaje de error) |
| Usuarios existentes | Sin cambios | Pueden seguir accediendo |

## Sección Técnica

### Archivos a modificar:

1. **`src/contexts/AuthContext.tsx`**
   - Añadir consulta previa a `user_profiles`
   - Añadir `shouldCreateUser: false` a `signInWithOtp`
   - Validar `is_active` antes de enviar OTP

2. **`src/components/auth/ProtectedRoute.tsx`**
   - Cambiar condición para requerir perfil existente Y activo
   - Añadir cierre de sesión automático si el perfil no existe

3. **(Opcional) `src/lib/env.ts`**
   - Considerar restringir el bypass solo a `localhost` para mayor seguridad

### Consideraciones de RLS

La tabla `user_profiles` ya tiene políticas RLS que permiten lectura pública del propio perfil. La consulta de verificación funcionará porque:
- Usamos el cliente anónimo para verificar existencia
- Solo necesitamos saber si el email existe, no datos sensibles

### Configuración Supabase Recomendada

En el Dashboard de Supabase (Authentication → URL Configuration):
- Site URL: `https://repindex-v1.lovable.app`
- Redirect URLs: 
  - `https://repindex-v1.lovable.app/**`
  - `https://id-preview--bc807963-c063-4e58-b3fe-21a2a28cd8bf.lovable.app/**`
