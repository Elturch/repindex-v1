

# Plan: Corregir el Guardado de Leads en Login

## Diagnóstico Completo

Después de investigar los logs de PostgreSQL, he identificado dos problemas que se combinaron para causar este fallo:

### Problema 1: Error de RLS (YA RESUELTO)
Los logs de PostgreSQL muestran un error histórico:
```
ERROR: new row violates row-level security policy for table "interested_leads"
```
Este error ocurrió durante tus pruebas porque la migración que corrige los permisos para usuarios anónimos se aplicó **después** de tus pruebas.

La migración `20260205084928` ya está aplicada y la política RLS ahora permite correctamente inserciones desde usuarios anónimos.

### Problema 2: El Código Silencia Errores (PENDIENTE)
El código actual en `src/pages/Login.tsx` tiene un bug crítico:

```typescript
// Código actual (PROBLEMÁTICO)
const saveLead = useCallback(async (withConsent: boolean) => {
  setSavingLead(true);
  try {
    const { error } = await supabase
      .from('interested_leads')
      .upsert({ ... });

    if (error) {
      console.error('Error saving lead:', error);  // Solo log en consola
    }
    
    setLeadSaved(withConsent ? 'consent' : 'no_consent');  // ⚠️ SIEMPRE muestra éxito
  } catch (err) {
    console.error('Error saving lead:', err);
    setLeadSaved(withConsent ? 'consent' : 'no_consent');  // ⚠️ SIEMPRE muestra éxito
  }
}, [email]);
```

El problema: Si la inserción falla (por cualquier razón), el usuario ve la pantalla de confirmación como si hubiera funcionado.

## Cambio Requerido

Modificar `src/pages/Login.tsx` para que muestre un error real cuando la inserción falle:

```typescript
const saveLead = useCallback(async (withConsent: boolean) => {
  setSavingLead(true);
  setErrorMessage('');  // Limpiar errores previos
  
  try {
    const { error } = await supabase
      .from('interested_leads')
      .upsert({
        email: email.trim().toLowerCase(),
        contact_consent: withConsent,
        consent_date: new Date().toISOString(),
        user_agent: navigator.userAgent,
        source: 'login_attempt',
        status: 'pending',
      }, { onConflict: 'email' });

    if (error) {
      console.error('Error saving lead:', error);
      setErrorMessage('No se pudo guardar tu solicitud. Por favor, inténtalo de nuevo.');
      setLoginState('not_registered');  // Mantener en el mismo estado para reintentar
      return;  // IMPORTANTE: No continuar
    }
    
    // Solo mostrar éxito si realmente funcionó
    setLeadSaved(withConsent ? 'consent' : 'no_consent');
  } catch (err) {
    console.error('Error saving lead:', err);
    setErrorMessage('Error de conexión. Por favor, inténtalo de nuevo.');
    setLoginState('not_registered');
  } finally {
    setSavingLead(false);
  }
}, [email]);
```

## Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| `src/pages/Login.tsx` | Corregir `saveLead()` para mostrar errores reales en lugar de silenciarlos |

## Flujo Después de la Corrección

```text
Usuario introduce email no registrado
         │
         ▼
Aparece modal de consentimiento
         │
         ▼
Usuario hace clic en "Sí, contactadme"
         │
         ▼
┌────────────────────────────────────────┐
│ supabase.upsert() a interested_leads   │
└────────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
   OK       ERROR
    │         │
    ▼         ▼
Pantalla   Mensaje de error visible
de éxito   "No se pudo guardar..."
            (usuario puede reintentar)
```

## Pasos Post-Implementación

1. **Publicar los cambios** a producción
2. **Probar desde** `https://repindex.ai/login` (o `repindex-v1.lovable.app/login`)
3. **Verificar** que los leads aparecen en `/admin` > Leads

