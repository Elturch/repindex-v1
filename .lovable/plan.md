
## Plan: Corregir Error de Fetch en Panel de Análisis

### Diagnóstico del Problema

Se identificaron **DOS causas** del error "Failed to fetch":

1. **Extensión de Chrome bloqueando**: El stack trace muestra que una extensión (`frame_ant`) está interceptando `window.fetch` y bloqueando la petición antes de llegar al servidor. Esto está fuera de nuestro control directo.

2. **Headers CORS incompletos**: La Edge Function `rix-analyze-v2` solo declara 4 headers permitidos, pero el cliente Supabase JS envía headers adicionales como `x-supabase-client-platform`.

**Evidencia**:
- La llamada directa desde el servidor (curl) funciona correctamente (HTTP 200)
- Las llamadas desde el navegador del usuario fallan sin status code
- El stack trace muestra interceptación por extensión de Chrome

### Solución Propuesta

#### Cambio 1: Actualizar CORS Headers en Edge Function

En `supabase/functions/rix-analyze-v2/index.ts`, actualizar los headers CORS para incluir todos los headers que Supabase JS puede enviar:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

#### Cambio 2: Usar supabase.functions.invoke en lugar de fetch

En `src/components/admin/SweepMonitorPanel.tsx`, cambiar de `fetch` directo a `supabase.functions.invoke` que ya tiene manejo integrado de headers y timeouts:

```typescript
const handleRepairAnalysis = async () => {
  setRepairingAnalysis(true);
  
  toast({
    title: 'Análisis iniciado',
    description: 'Procesando registros pendientes... Esto puede tardar varios minutos.',
  });
  
  try {
    // Usar supabase.functions.invoke para evitar problemas de CORS
    const { data, error } = await supabase.functions.invoke('rix-analyze-v2', {
      body: { action: 'reprocess_pending', batch_size: 3 },
    });

    if (error) {
      throw error;
    }

    toast({
      title: 'Análisis completado',
      description: data?.message || `Procesados ${data?.processed || 0} registros`,
    });

    fetchAnalysisStatus();
  } catch (error: any) {
    console.error('Error repairing analysis:', error);
    toast({
      title: 'Error',
      description: error.message || 'No se pudo completar el análisis',
      variant: 'destructive',
    });
  } finally {
    setRepairingAnalysis(false);
  }
};
```

#### Cambio 3: Agregar Información de Diagnóstico

Añadir un mensaje informativo para el usuario si el problema persiste, sugiriendo que desactive extensiones del navegador:

```typescript
// En el catch del error
if (error.message?.includes('Failed to fetch')) {
  toast({
    title: 'Error de conexión',
    description: 'No se pudo conectar al servidor. Si el problema persiste, prueba a desactivar extensiones del navegador o usar modo incógnito.',
    variant: 'destructive',
  });
}
```

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/rix-analyze-v2/index.ts` | Actualizar corsHeaders con headers completos de Supabase JS |
| `src/components/admin/SweepMonitorPanel.tsx` | Cambiar de `fetch` a `supabase.functions.invoke` + mensaje de diagnóstico |

### Beneficios

1. **Mayor compatibilidad**: Los headers CORS completos evitan rechazos de preflight
2. **Menos puntos de fallo**: Usar el cliente SDK evita errores de configuración manual
3. **Mejor UX**: Mensaje claro si hay interferencia de extensiones
4. **Consistencia**: Alinea con el patrón usado en otras partes de la aplicación
