

# Fix: Hacer visible Rix Press en Lovable Preview

## Problema

En el entorno de Lovable Preview, el sistema de bypass (`isDevOrPreview()`) permite acceder a todas las rutas sin autenticacion real de Supabase. Sin embargo, el check de rol `press` en `ChatContext.tsx` depende de `currentUserId` (que viene de `useAuth()`), y como no hay sesion real de Supabase en Preview, `currentUserId` es siempre `null`. Esto hace que `hasRixPressAccess` sea siempre `false` y el boton de Rix Press nunca aparezca.

## Solucion

Aplicar el mismo patron de bypass que ya se usa en `ProtectedRoute`, `FloatingChat` y `Header`: cuando `isDevOrPreview()` es `true`, asumir acceso completo.

## Cambio tecnico

### Archivo: `src/contexts/ChatContext.tsx` (lineas ~227-247)

Modificar el `useEffect` que comprueba el rol `press` para que, si estamos en Preview/dev, se active automaticamente `hasRixPressAccess = true` sin consultar la base de datos:

```typescript
// Check if user has 'press' role
useEffect(() => {
  // In preview/dev, grant press access for testing
  if (isDevOrPreview()) {
    setHasRixPressAccess(true);
    return;
  }
  
  if (!currentUserId) {
    setHasRixPressAccess(false);
    return;
  }
  // ... rest of the check stays the same
}, [currentUserId]);
```

Se necesita importar `isDevOrPreview` de `@/lib/env` al inicio del archivo (ya se usa en otros ficheros del proyecto con el mismo patron).

### Resultado

- En Preview: el boton Rix Press aparecera siempre en el Agente Rix
- En produccion: solo aparecera si el usuario tiene el rol `press` asignado en `user_roles`

