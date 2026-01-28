

## Plan: Sistema de Visibilidad de Errores de API de IAs

### Contexto del Problema

Actualmente los errores de conexión a las APIs de IA (OpenAI, Perplexity, Grok, DeepSeek, Gemini, Qwen) se registran en la columna `model_errors` de `rix_runs_v2`, pero **no hay visibilidad** de estos errores en el panel de administración. Los administradores no pueden:

1. Ver qué modelos están fallando
2. Entender el porqué de los fallos
3. Identificar patrones (ej: Grok siempre falla con HTTP 422)
4. Tomar acciones correctivas informadas

**Errores actuales detectados en la base de datos:**
| Modelo | Errores | Tipo de Error |
|--------|---------|---------------|
| ChatGPT | 3 | `error reading a body from connection` |
| Grok | 3 | `HTTP 422: missing field parameters` |
| Deepseek | 1 | conexión |
| Perplexity | 1 | conexión |

---

### Solución Propuesta

Crear un panel de **"Errores de API"** dentro de `SweepMonitorPanel.tsx` que muestre:

1. **Resumen de errores por modelo** - conteo y % de fallos
2. **Detalle de errores recientes** - mensaje exacto, ticker afectado, timestamp
3. **Clasificación de errores** - tipo de error (auth, rate limit, timeout, payload, conexión)
4. **Acciones rápidas** - reintentar análisis fallidos

---

### Arquitectura Visual

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Errores de API - Modelos IA                                   [Refrescar]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ RESUMEN DE ERRORES (Última Semana)                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐    │
│ │ ChatGPT  ████░░░░░░ 3 errores (1.7%)  ⚡ Conexión                   │    │
│ │ Grok     ████████░░ 3 errores (100%)  🔴 HTTP 422                   │    │
│ │ Deepseek █░░░░░░░░░ 1 error (0.6%)    ⚡ Conexión                   │    │
│ │ Perplexity █░░░░░░░░░ 1 error (0.6%)  ⚡ Conexión                   │    │
│ └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ DETALLE DE ERRORES RECIENTES                                                 │
│ ┌──────────────────────────────────────────────────────────────────────┐    │
│ │ 🔴 Grok - R4 (Repsol)                              25 ene 20:04     │    │
│ │    HTTP 422: Failed to deserialize JSON body...                      │    │
│ │    missing field `parameters` at line 1 column 7281                  │    │
│ │    [Reintentar] [Ver Registro]                                       │    │
│ ├──────────────────────────────────────────────────────────────────────┤    │
│ │ ⚡ ChatGPT - OHL                                   25 ene 10:47     │    │
│ │    error reading a body from connection                              │    │
│ │    [Reintentar] [Ver Registro]                                       │    │
│ └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ DIAGNÓSTICO                                                                  │
│ • Grok: Posible problema con la estructura del payload (tools schema)       │
│ • ChatGPT: Timeouts de conexión intermitentes (rate limiting)               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Cambios Técnicos

#### 1. Nuevos Tipos TypeScript

```typescript
interface APIErrorRecord {
  id: string;
  ticker: string;
  issuer_name: string;
  model_name: string;
  error_source: string;  // Modelo interno (gpt-4.1-mini, grok-3, etc.)
  error_message: string;
  error_type: 'auth' | 'rate_limit' | 'timeout' | 'payload' | 'connection' | 'unknown';
  created_at: string;
}

interface APIErrorSummary {
  model: string;
  total_errors: number;
  error_rate: number;  // % de registros con error
  primary_error_type: string;
  last_error_at: string;
}
```

#### 2. Nueva Función de Fetch de Errores

```typescript
const fetchAPIErrors = useCallback(async () => {
  setLoadingErrors(true);
  try {
    // Obtener registros con errores de la última semana
    const { data, error } = await supabase
      .from('rix_runs_v2')
      .select('id, "02_model_name", "03_target_name", "05_ticker", model_errors, created_at')
      .not('model_errors', 'is', null)
      .neq('model_errors', '{}')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Procesar y clasificar errores
    const processed = data?.map(record => {
      const errors = record.model_errors as Record<string, string>;
      const errorEntries = Object.entries(errors);
      
      return errorEntries.map(([source, message]) => ({
        id: record.id,
        ticker: record['05_ticker'],
        issuer_name: record['03_target_name'],
        model_name: record['02_model_name'],
        error_source: source,
        error_message: message,
        error_type: classifyError(message),
        created_at: record.created_at,
      }));
    }).flat();

    setApiErrors(processed || []);
    
    // Calcular resumen por modelo
    const summary = calculateErrorSummary(processed || []);
    setErrorSummary(summary);

  } catch (error) {
    console.error('Error fetching API errors:', error);
  } finally {
    setLoadingErrors(false);
  }
}, []);
```

#### 3. Clasificador de Errores

```typescript
function classifyError(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('401') || lowerMsg.includes('unauthorized') || lowerMsg.includes('api key')) {
    return 'auth';
  }
  if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('quota')) {
    return 'rate_limit';
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('aborted')) {
    return 'timeout';
  }
  if (lowerMsg.includes('422') || lowerMsg.includes('400') || lowerMsg.includes('deserialize') || lowerMsg.includes('json')) {
    return 'payload';  // Error en estructura del request
  }
  if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
    return 'connection';
  }
  return 'unknown';
}
```

#### 4. Componente Visual de Errores

```tsx
// Dentro de SweepMonitorPanel.tsx
<Card className="shadow-card mt-6">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      Errores de API - Modelos IA
    </CardTitle>
    <CardDescription>
      Errores de conexión a APIs de IA en las últimas semanas
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Resumen por modelo */}
    <div className="space-y-2 mb-4">
      {errorSummary.map((summary) => (
        <div key={summary.model} className="flex items-center justify-between">
          <span className="font-medium">{summary.model}</span>
          <div className="flex items-center gap-2">
            <Badge variant={summary.total_errors > 5 ? 'destructive' : 'secondary'}>
              {summary.total_errors} errores
            </Badge>
            <Badge variant="outline">{getErrorTypeIcon(summary.primary_error_type)}</Badge>
          </div>
        </div>
      ))}
    </div>

    {/* Tabla de errores recientes */}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Modelo</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Error</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apiErrors.slice(0, 10).map((error) => (
          <TableRow key={`${error.id}-${error.error_source}`}>
            <TableCell>
              <Badge variant="outline">{error.model_name}</Badge>
            </TableCell>
            <TableCell>{error.ticker}</TableCell>
            <TableCell className="max-w-xs truncate" title={error.error_message}>
              {error.error_message.substring(0, 60)}...
            </TableCell>
            <TableCell>{formatDistanceToNow(new Date(error.created_at))}</TableCell>
            <TableCell>
              <Button size="sm" variant="ghost" onClick={() => retryAnalysis(error.id)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

#### 5. Iconos de Tipo de Error

```typescript
function getErrorTypeIcon(type: string): React.ReactNode {
  switch (type) {
    case 'auth':
      return <><Key className="h-3 w-3 inline mr-1" /> Auth</>;
    case 'rate_limit':
      return <><Timer className="h-3 w-3 inline mr-1" /> Rate Limit</>;
    case 'timeout':
      return <><Clock className="h-3 w-3 inline mr-1" /> Timeout</>;
    case 'payload':
      return <><AlertCircle className="h-3 w-3 inline mr-1" /> Payload</>;
    case 'connection':
      return <><Zap className="h-3 w-3 inline mr-1" /> Conexión</>;
    default:
      return <><HelpCircle className="h-3 w-3 inline mr-1" /> Desconocido</>;
  }
}
```

---

### Mejoras Adicionales en Edge Functions

#### 6. Logging Mejorado de Errores en `rix-analyze-v2`

Actualizar el manejo de errores para persistir más contexto:

```typescript
// En catch block de analyzeRecord
} catch (error: any) {
  console.error(`[rix-analyze-v2] Error for ${record.id}:`, error.message);
  
  // Persistir error en model_errors para visibilidad
  const currentErrors = record.model_errors || {};
  const updatedErrors = {
    ...currentErrors,
    [RIX_ANALYSIS_MODEL]: error.message,
    [`${RIX_ANALYSIS_MODEL}_timestamp`]: new Date().toISOString(),
  };
  
  await supabase
    .from('rix_runs_v2')
    .update({ model_errors: updatedErrors })
    .eq('id', record.id);
  
  throw error;
}
```

---

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/SweepMonitorPanel.tsx` | Agregar panel de errores de API con resumen y detalle |
| `supabase/functions/rix-analyze-v2/index.ts` | Mejorar logging de errores en `model_errors` |

---

### Beneficios Esperados

1. **Visibilidad inmediata**: Ver qué modelos están fallando y por qué
2. **Diagnóstico rápido**: Identificar si es un problema de auth, rate limit, o payload
3. **Acción directa**: Reintentar análisis fallidos desde el panel
4. **Historial de errores**: Entender patrones de fallos a lo largo del tiempo
5. **Detección temprana**: Identificar problemas antes de que afecten a todo el sweep

---

### Hallazgo Importante

Durante la exploración se detectó que **Grok tiene 100% de fallos** en la fase de análisis debido a un error HTTP 422:

```
HTTP 422: Failed to deserialize the JSON body into the target type: 
tools[0]: missing field `parameters` at line 1 column 7281
```

Esto indica que el esquema de herramientas (tools) enviado a la API de xAI tiene un formato incorrecto. Esto es un bug separado que debería corregirse en `rix-search-v2` o en la configuración del modelo Grok.

