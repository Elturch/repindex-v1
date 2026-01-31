
# Plan: Añadir Tooltips Explicativos a las Métricas del Dashboard

## Objetivo

Mostrar un tooltip explicativo al pasar el cursor por encima de cada cabecera de métrica (RIX, NVM, DRM, SIM, etc.) en la tabla del Dashboard, **sin interferir** con la funcionalidad de ordenación existente (click para ordenar ascendente/descendente).

## Diagnóstico Actual

| Elemento | Estado |
|----------|--------|
| Cabeceras de métricas | Click funciona para ordenar (3 estados: desc → asc → reset) |
| Tooltips | Componente existe (`src/components/ui/tooltip.tsx`) pero no se usa en Dashboard |
| Glosario canónico | Contiene `executiveName` para cada métrica (ej: NVM → "Calidad de la Narrativa") |

## Solución Propuesta

### Cambio 1: Importar Tooltip y Glosario en Dashboard

Añadir las importaciones necesarias:

```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getMetricByAcronym } from "@/lib/rixMetricsGlossary";
```

### Cambio 2: Envolver la Tabla en TooltipProvider

El `TooltipProvider` debe envolver la tabla para que los tooltips funcionen.

### Cambio 3: Añadir Tooltip a Cada Cabecera de Métrica

Modificar el renderizado de las cabeceras (líneas 710-736) para que cada `<TableHead>` tenga un tooltip:

```
text
┌─────────────────────────────────────────────────────────────┐
│  TableHead (clickeable para ordenar)                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Tooltip                                                ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │  TooltipTrigger (span con asChild={false})         │││
│  │  │    → NVM + flechas de ordenación                   │││
│  │  └─────────────────────────────────────────────────────┘││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │  TooltipContent                                    │││
│  │  │    → "Calidad de la Narrativa"                     │││
│  │  │    → Descripción corta                             │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

La clave es que:
- El `onClick` permanece en el `TableHead` (ordenación)
- El `TooltipTrigger` usa `asChild={false}` para no interferir con el click
- El tooltip aparece con hover, el click sigue ordenando

### Cambio 4: Contenido del Tooltip

Cada tooltip mostrará:
1. **Línea 1**: Nombre ejecutivo en negrita (ej: "Calidad de la Narrativa")
2. **Línea 2**: Peso en la fórmula (ej: "Peso: 15%")
3. **Opcional**: Indicador si es puntuación inversa (para CEM)

Ejemplo visual:
```
┌─────────────────────────────────────┐
│ Calidad de la Narrativa            │
│ Peso: 15% · Click para ordenar     │
└─────────────────────────────────────┘
```

### Cambio 5: Tooltip para RIX

El RIX también tendrá tooltip explicando que es el índice compuesto:
```
┌─────────────────────────────────────┐
│ Índice Reputacional                 │
│ Puntuación global (0-100)           │
└─────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `src/pages/Dashboard.tsx` | Importar Tooltip + getMetricByAcronym | ~1-31 |
| `src/pages/Dashboard.tsx` | Envolver tabla con TooltipProvider | ~680 |
| `src/pages/Dashboard.tsx` | Añadir Tooltip a cabecera RIX | ~688-709 |
| `src/pages/Dashboard.tsx` | Añadir Tooltip a cabeceras de métricas | ~710-736 |

## Comportamiento Esperado

| Acción | Resultado |
|--------|-----------|
| **Hover** sobre NVM | Aparece tooltip: "Calidad de la Narrativa - Peso: 15%" |
| **Click** sobre NVM | Ordena por NVM (desc → asc → reset) |
| **Hover** sobre CEM | Aparece tooltip: "Gestión de Controversias - Peso: 12% (inverso)" |
| **Click** sobre CEM | Ordena por CEM |

## Consideraciones Técnicas

1. **No bloquea eventos**: Los tooltips de Radix UI no bloquean clicks por defecto
2. **Delay corto**: Se puede añadir `delayDuration={300}` para evitar tooltips accidentales
3. **Posición**: `side="bottom"` para que no tape los filtros superiores
4. **Mobile**: Los tooltips no aparecen en touch (comportamiento esperado), solo en hover

## Vista Previa del Resultado

Antes:
```
| RIX ↓ | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
```

Después (al hacer hover sobre NVM):
```
| RIX ↓ | NVM | DRM | SIM | RMM | CEM | GAM | DCM | CXM |
          ▼
    ┌──────────────────────────────┐
    │ Calidad de la Narrativa      │
    │ Peso: 15%                    │
    └──────────────────────────────┘
```
