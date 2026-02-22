

# Plan: Alerta visible y boton de reanudacion cuando hay empresas pendientes

## Problema actual

El monitor muestra "129 completados, 0 procesando, 0 fallidos" y parece que todo esta bien. Pero hay 46 empresas en estado `pending` que no se estan procesando. No hay ninguna alerta visual ni boton dedicado para reanudar el barrido de esas empresas pendientes.

## Solucion

### Cambio 1: Banner de alerta prominente cuando hay pendientes sin actividad

Anadir un banner naranja/rojo en la parte superior del panel (debajo del SweepHealthDashboard) que aparece SOLO cuando:
- Hay empresas `pending` en sweep_progress
- No hay empresas `processing`
- No hay cascada activa

El banner mostrara: "46 empresas pendientes sin procesar. El barrido parece detenido."

### Cambio 2: Boton "Reanudar Barrido" en el banner

Dentro del banner, un boton que lanza la cascada automaticamente (reutiliza `handleLaunchCascade`). Esto permite reanudar con un solo clic cuando hay empresas atascadas.

### Cambio 3: Mostrar el contador de pendientes en las estadisticas

Actualmente la fila de stats muestra: Total | Completados | Procesando | Pendientes analisis | Fallidos. El problema es que "Pendientes analisis" se refiere a registros con datos pero sin score, NO a empresas sin buscar.

Anadir una sexta stat card: "Pendientes busqueda" que muestre `unifiedMetrics.searchPending` (empresas cuyo sweep_progress esta en pending).

### Archivo modificado

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/SweepMonitorPanel.tsx` | Banner de alerta (linea ~1100), boton reanudar, nueva stat card de pendientes de busqueda (linea ~1197) |

### Detalle tecnico

**Banner (entre linea 1102 y 1104):**
```typescript
{/* Alerta: empresas pendientes sin actividad */}
{(unifiedMetrics?.searchPending || 0) > 0 && 
 (unifiedMetrics?.searchProcessing || 0) === 0 && 
 !cascade.isRunning && (
  <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
    <CardContent className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        <div>
          <p className="font-semibold text-orange-700 dark:text-orange-400">
            {unifiedMetrics.searchPending} empresas pendientes sin procesar
          </p>
          <p className="text-sm text-orange-600/80 dark:text-orange-400/60">
            El barrido parece detenido. Pulsa "Reanudar" para continuar.
          </p>
        </div>
      </div>
      <Button onClick={() => handleLaunchCascade(false)} className="gap-2">
        <Play className="h-4 w-4" />
        Reanudar Barrido
      </Button>
    </CardContent>
  </Card>
)}
```

**Stat card adicional (en el grid de linea 1197, cambiar `grid-cols-5` a `grid-cols-6`):**
```typescript
<div className="text-center p-3 rounded-lg bg-orange-500/10">
  <div className="text-2xl font-bold text-orange-600">
    {unifiedMetrics?.searchPending || 0}
  </div>
  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
    <Search className="h-3 w-3" />
    Pend. busqueda
  </div>
</div>
```

## Resultado esperado

Cuando haya empresas pendientes sin actividad:
1. Un banner naranja visible inmediatamente al entrar al admin
2. Un boton "Reanudar Barrido" de un solo clic
3. El contador de pendientes de busqueda siempre visible en las estadisticas
4. Cuando todo esta procesando o completado, el banner desaparece automaticamente
