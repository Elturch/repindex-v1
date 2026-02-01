

# Plan: Añadir Monitor Visual de Actividad e Instrucciones de Acción

## Problema Actual

El `SweepHealthDashboard` muestra datos pero:
- No hay un indicador visual claro de que el sistema está "vivo" y procesando
- No hay instrucciones sobre qué hacer cuando hay problemas
- El usuario no sabe qué acción tomar en cada situación

## Solución

### 1. Indicador de Latido (Heartbeat Monitor)

Añadir un indicador visual prominente que muestre el estado de actividad en tiempo real:

```text
┌─────────────────────────────────────────────────────────────────┐
│  [●] PROCESANDO                          ↻ Actualizado hace 5s │
│      ⟳ Última empresa: BBVA (hace 2 min)                       │
└─────────────────────────────────────────────────────────────────┘
```

**Visual:**
- **Estado `healthy`**: Círculo verde pulsante + icono de engranaje girando
- **Estado `slow`**: Círculo amarillo pulsante lento
- **Estado `stuck/dead`**: Círculo rojo estático sin animación
- **Estado `completed`**: Check verde estático

### 2. Panel de Instrucciones Contextuales

Un panel colapsable que muestra instrucciones específicas según el estado:

**Si está ATASCADO (zombi detectado):**
```
📋 QUÉ HACER:
1. Haz clic en "Limpiar Zombis" → Resetea los registros atascados
2. Luego haz clic en "Reanudar Cascada" → Reinicia el procesamiento
3. Espera 30 segundos y observa si el indicador vuelve a verde
```

**Si está MUERTO (sin actividad >10 min):**
```
📋 QUÉ HACER:
1. Haz clic en "Reanudar Cascada" → Intenta reiniciar el proceso
2. Si sigue muerto, haz clic en "Completar Análisis" → Programa reparación
3. Si persiste, contacta soporte técnico
```

**Si está LENTO:**
```
📋 INFORMACIÓN:
• El barrido está funcionando pero más lento de lo normal
• Esto puede ocurrir por alta carga en las APIs de IA
• No es necesaria acción inmediata, el sistema se recuperará
```

**Si está HEALTHY:**
```
✅ Todo funciona correctamente. No se requiere acción.
```

## Cambios en el Código

### Archivo: `src/components/admin/SweepHealthDashboard.tsx`

**1. Añadir componente de indicador de latido:**

```tsx
// Nuevo componente HeartbeatIndicator
function HeartbeatIndicator({ 
  status, 
  lastActivity, 
  processing 
}: { 
  status: SweepHealthStatus; 
  lastActivity: Date | null;
  processing: number;
}) {
  const isActive = status === 'healthy' || status === 'slow';
  
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 bg-background">
      {/* Círculo pulsante */}
      <div className="relative flex h-10 w-10 items-center justify-center">
        {isActive ? (
          <>
            <span className="absolute h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative h-6 w-6 rounded-full bg-green-500" />
          </>
        ) : status === 'completed' ? (
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        ) : (
          <span className="h-6 w-6 rounded-full bg-red-500" />
        )}
      </div>
      
      {/* Texto de estado */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          <span className="font-medium">
            {isActive ? `Procesando ${processing} empresa(s)...` : 
             status === 'completed' ? 'Barrido completado' :
             'Sistema detenido'}
          </span>
        </div>
        {lastActivity && (
          <span className="text-sm text-muted-foreground">
            Última actividad: {formatDistanceToNow(lastActivity, { locale: es, addSuffix: true })}
          </span>
        )}
      </div>
      
      {/* Indicador de auto-refresh */}
      <div className="text-xs text-muted-foreground">
        ↻ Auto-refresh: 10s
      </div>
    </div>
  );
}
```

**2. Añadir panel de instrucciones:**

```tsx
// Nuevo componente ActionGuidance
function ActionGuidance({ status, hasZombies, hasFailed }: {
  status: SweepHealthStatus;
  hasZombies: boolean;
  hasFailed: boolean;
}) {
  const getGuidance = () => {
    if (status === 'completed') {
      return {
        icon: '✅',
        title: 'Barrido completado',
        steps: ['No se requiere ninguna acción'],
        variant: 'success'
      };
    }
    
    if (status === 'healthy') {
      return {
        icon: '✅',
        title: 'Sistema funcionando correctamente',
        steps: ['El barrido avanza con normalidad', 'No se requiere intervención'],
        variant: 'success'
      };
    }
    
    if (hasZombies || status === 'stuck') {
      return {
        icon: '🔧',
        title: 'Acción requerida: Proceso atascado',
        steps: [
          '1. Haz clic en "Limpiar Zombis" para resetear registros atascados',
          '2. Luego haz clic en "Reanudar Cascada" para reiniciar',
          '3. Espera 30s y verifica que el indicador vuelva a verde'
        ],
        variant: 'warning'
      };
    }
    
    if (status === 'dead') {
      return {
        icon: '⚠️',
        title: 'Acción requerida: Sistema detenido',
        steps: [
          '1. Haz clic en "Reanudar Cascada" para reiniciar el proceso',
          '2. Si no funciona, usa "Completar Análisis" para reparación programada',
          '3. Si persiste tras 5 minutos, revisa los logs de errores'
        ],
        variant: 'error'
      };
    }
    
    if (status === 'slow') {
      return {
        icon: 'ℹ️',
        title: 'Sistema lento pero funcionando',
        steps: [
          'El barrido continúa pero más lento de lo esperado',
          'Puede deberse a alta carga en las APIs de IA',
          'No es necesaria acción inmediata'
        ],
        variant: 'info'
      };
    }
    
    if (hasFailed || status === 'error') {
      return {
        icon: '❌',
        title: 'Errores detectados',
        steps: [
          '1. Revisa la sección de alertas para ver qué falló',
          '2. Usa "Completar Análisis" para reprocesar los fallidos',
          '3. Si hay muchos fallos, puede haber un problema con las APIs'
        ],
        variant: 'error'
      };
    }
    
    return null;
  };
  
  const guidance = getGuidance();
  if (!guidance) return null;
  
  const variantStyles = {
    success: 'border-green-500/30 bg-green-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    error: 'border-red-500/30 bg-red-500/5'
  };
  
  return (
    <div className={cn("rounded-lg border p-4", variantStyles[guidance.variant])}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{guidance.icon}</span>
        <div className="flex-1 space-y-2">
          <h4 className="font-semibold">{guidance.title}</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {guidance.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

**3. Integrar en el componente principal:**

Añadir ambos componentes justo después del header:

```tsx
<CardContent className="space-y-4">
  {/* NUEVO: Heartbeat Indicator */}
  <HeartbeatIndicator 
    status={data.healthStatus} 
    lastActivity={data.lastActivity}
    processing={data.processing}
  />
  
  {/* NUEVO: Action Guidance */}
  <ActionGuidance 
    status={data.healthStatus}
    hasZombies={data.zombies.length > 0}
    hasFailed={data.failed > 0}
  />
  
  {/* Progress Section (existente) */}
  ...
```

## Resultado Visual Esperado

```text
┌─────────────────────────────────────────────────────────────────┐
│ 🟠 BARRIDO ATASCADO                           2026-W06         │
│ Zombi detectado                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [●] (pulsando)  Procesando 1 empresa...     ↻ Auto: 10s    │ │
│ │                 Última actividad: hace 12 min              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔧 Acción requerida: Proceso atascado                      │ │
│ │    1. Haz clic en "Limpiar Zombis" para resetear...        │ │
│ │    2. Luego haz clic en "Reanudar Cascada" para...         │ │
│ │    3. Espera 30s y verifica que el indicador vuelva...     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 75/174 empresas (43%)          ⏱️ 9h 12m    📊 Esperado: 100%  │
│ [████████░░░░░░░░░░░░] 43%                                     │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/SweepHealthDashboard.tsx` | Añadir `HeartbeatIndicator` y `ActionGuidance` |

