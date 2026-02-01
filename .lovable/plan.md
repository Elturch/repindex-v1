
# Plan: Dashboard de Monitorización en Tiempo Real del Barrido

## Problema Central

El panel actual `SweepMonitorPanel` tiene ~2200 líneas de código con múltiples secciones pero **ninguna vista unificada del estado en tiempo real**. No hay forma de ver de un vistazo:
- Si el sistema está funcionando o muerto
- Cuál es el progreso real vs esperado
- Qué acciones tomar para resolver problemas

## Solución: Panel de Estado Unificado

Crear un nuevo componente `SweepHealthDashboard` que muestre:

### 1. Header de Estado Global (siempre visible)

```text
┌─────────────────────────────────────────────────────────────────┐
│  🔴 BARRIDO ATASCADO                    2026-W06               │
│  ═══════════════════════════════════════════════════════════════│
│  75/174 empresas (43%)    ⏱️ 9h 12m    📊 Esperado: 100%       │
│  [████████░░░░░░░░░░░░] 43%            🎯 Meta: 03:50 CET      │
│                                                                 │
│  🔴 BBVA atascado (10 min)  ⚠️ 101 pendientes  ❌ 1 fallida    │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Indicadores de Salud del Sistema

| Indicador | Estado | Descripción |
|-----------|--------|-------------|
| **Heartbeat** | 🔴 Muerto | Último procesamiento hace >5 min |
| **Zombis** | ⚠️ 1 detectado | BBVA en processing >5 min |
| **Tasa de éxito** | ⚠️ 88% | Por debajo del 95% objetivo |
| **APIs** | ✅ OK | Sin errores de autenticación |

### 3. Timeline Visual de Fases

```text
Fase:  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23...
       ✓  ✓  ✓  ✓  ✓  ✓  ⚠️ ✓  ✓  ✓  ⚠️ ✓  ✓  ✓  ⚠️ ✓  ✓  ⚠️ ✓  ⚠️ ❌ ⚠️ ⚠️
       │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │
       ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼
      5/5 5/5 4/6 5/5 5/5 3/5 2/5 ...                              0/5 1/6

Leyenda: ✓ Completa (100%)  ⚠️ Parcial (>0%)  ❌ Sin procesar (0%)
```

### 4. Acciones Rápidas Contextuales

Botones que aparecen según el estado:

- **Si hay zombis**: `[🧟 Limpiar Zombis]` - Reset automático de registros atascados
- **Si hay pendientes analizables**: `[🔧 Completar Análisis]` - Trigger de reparación
- **Si el barrido está parado**: `[▶️ Reanudar Cascada]` - Inicia procesamiento manual
- **Si hay errores de API**: `[🔑 Verificar APIs]` - Diagnóstico de credenciales

## Cambios Técnicos

### Archivo: `src/components/admin/SweepHealthDashboard.tsx` (NUEVO)

Componente dedicado de ~400 líneas que:
1. Consulta `sweep_progress` cada 10 segundos
2. Calcula métricas de salud en tiempo real
3. Detecta zombis (processing > 5 min)
4. Compara progreso real vs esperado basado en hora actual
5. Muestra acciones contextuales según el estado

### Archivo: `src/components/admin/SweepMonitorPanel.tsx` (MODIFICAR)

- Integrar `SweepHealthDashboard` como primera sección del panel
- Colapsar las secciones detalladas por defecto
- El dashboard de salud siempre visible arriba

### Lógica de Estados

```typescript
type SweepHealthStatus = 
  | 'healthy'      // Procesando normalmente, sin zombis
  | 'slow'         // Procesando pero por debajo del ritmo esperado  
  | 'stuck'        // Zombi detectado (>5 min sin cambios)
  | 'dead'         // Sin actividad en >10 min
  | 'completed'    // 100% completado
  | 'error';       // Errores críticos de API

function calculateExpectedProgress(sweepStartTime: Date): number {
  const hoursElapsed = (Date.now() - sweepStartTime.getTime()) / 3600000;
  // El barrido debería completarse en ~3 horas
  return Math.min(100, Math.round((hoursElapsed / 3) * 100));
}

function detectZombies(records: SweepRecord[]): SweepRecord[] {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return records.filter(r => 
    r.status === 'processing' && 
    new Date(r.started_at).getTime() < fiveMinutesAgo
  );
}
```

## Resultado Esperado

Al abrir `/admin` > "Barrido V2":

1. **Vista inmediata** del estado: verde/amarillo/rojo
2. **Progreso claro**: X de 174 empresas, Y% completado
3. **Tiempo**: Cuánto lleva, cuánto debería llevar
4. **Problemas**: Zombis, fallos, APIs caídas
5. **Acciones**: Botones para resolver cada problema

El administrador sabrá en 5 segundos si el barrido está funcionando y qué hacer si no.
